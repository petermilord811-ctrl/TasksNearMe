import { and, eq } from 'drizzle-orm';
import type { ActionResult, BackgroundCheckStatus, IdentityFailureReason, PayoutAccountStatus } from '@/contracts';
import { recordAgreement, type RequestOrigin } from '@/modules/accounts/agreements';
import { users } from '@/modules/accounts/schema';
import { fieldError } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { computeOnboarding } from './progress';
import type { VerificationProviders } from './providers';
import { backgroundChecks, identityVerifications, payoutAccounts } from './schema';
import { BACKGROUND_RULES, namesMatch } from './standing';
import { emitVerificationEvent, loadOnboardingState, syncHelperProfile } from './state';

/**
 * Starting the hosted checks and recording their results (blueprint 06 §1). Results come by webhook
 * from the providers; in development the /dev/providers pages call the same functions.
 */

const DAY_MS = 86_400_000;

function audit(db: Db, action: string, userId: string, metadata: Record<string, unknown> = {}) {
  return db.insert(auditLog).values({ id: newId('aud'), actorRole: 'system', action, targetType: 'user', targetId: userId, metadata });
}

// ---- Identity -------------------------------------------------------------------------------------

/**
 * Opens a hosted ID check. Needs the phone verified and the Texas biometric notice accepted (now or
 * before). A check in progress can be continued with a new session (it counts as a try); blocked
 * helpers (3 tries a day, 5 in all, under 18) can't start one.
 */
export async function startIdentity(
  db: Db,
  providers: VerificationProviders,
  userId: string,
  now: Date,
  options: { consent?: boolean; origin?: RequestOrigin } = {},
): Promise<ActionResult> {
  const state = await loadOnboardingState(db, userId, now);
  const step = computeOnboarding(state.facts).progress.steps.find((s) => s.step === 'identity');
  if (!step || step.state === 'locked' || !state.identity.canStart) return { ok: false, code: 'not_allowed' };
  if (state.agreements.biometric_consent === undefined) {
    if (options.consent !== true) return fieldError('consent', 'must_accept');
    await recordAgreement(db, userId, 'biometric_consent', options.origin ?? {}, now);
  }
  const latest = state.identity.latest;
  if (latest && latest.providerSessionId !== null && latest.status === 'processing') {
    // Continuing: the unfinished session is closed and a new one opens.
    await db.update(identityVerifications).set({ status: 'canceled', updatedAt: now }).where(eq(identityVerifications.id, latest.id));
  }
  const { sessionId, url } = await providers.identity.start(userId);
  await db.insert(identityVerifications).values({
    id: newId('idv'),
    userId,
    provider: providers.identity.provider,
    providerSessionId: sessionId,
    status: 'processing',
    createdAt: now,
    updatedAt: now,
  });
  await audit(db, 'identity.started', userId);
  return { ok: true, code: 'updated', redirectTo: url };
}

export type IdentityResult =
  | { status: 'verified'; /** From the provider's verified outputs; compared, never stored. */ verifiedName?: { firstName: string; lastName: string } }
  | { status: 'requires_input'; reason: IdentityFailureReason }
  | { status: 'processing' }
  | { status: 'canceled' };

/** A provider result (webhook). Returns the person's id, or null for an unknown session. */
export async function recordIdentityResult(db: Db, sessionId: string, result: IdentityResult, now: Date): Promise<string | null> {
  const [row] = await db.select().from(identityVerifications).where(eq(identityVerifications.providerSessionId, sessionId)).limit(1);
  if (!row) return null;
  // A late result for a session that was already replaced or decided changes nothing.
  if (row.status === 'verified' || (row.status === 'canceled' && result.status !== 'verified')) return row.userId;
  let nameMatches: boolean | null = null;
  if (result.status === 'verified') {
    const [account] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, row.userId)).limit(1);
    nameMatches = !result.verifiedName || !account ? true : namesMatch(account, result.verifiedName);
  }
  await db
    .update(identityVerifications)
    .set({
      status: result.status,
      failureReason: result.status === 'requires_input' ? result.reason : null,
      isAdult: result.status === 'verified' ? true : result.status === 'requires_input' && result.reason === 'under_18' ? false : null,
      nameMatches,
      verifiedAt: result.status === 'verified' ? now : null,
      updatedAt: now,
    })
    .where(eq(identityVerifications.id, row.id));
  await audit(db, `identity.${result.status}`, row.userId, nameMatches === false ? { nameMatches: false } : {});
  if (result.status === 'verified') await emitVerificationEvent(db, row.userId, 'identity', nameMatches === false ? 'action_needed' : 'passed');
  if (result.status === 'requires_input') await emitVerificationEvent(db, row.userId, 'identity', 'action_needed');
  await syncHelperProfile(db, row.userId, now);
  return row.userId;
}

// ---- Payouts --------------------------------------------------------------------------------------

export async function startPayout(db: Db, providers: VerificationProviders, userId: string, now: Date): Promise<ActionResult> {
  const state = await loadOnboardingState(db, userId, now);
  const step = computeOnboarding(state.facts).progress.steps.find((s) => s.step === 'payout');
  if (!step || step.state === 'locked') return { ok: false, code: 'not_allowed' };
  const { accountId, url } = await providers.payout.start(userId);
  if (!state.payout) {
    await db.insert(payoutAccounts).values({ userId, provider: providers.payout.provider, providerAccountId: accountId, status: 'pending', createdAt: now, updatedAt: now });
  }
  return { ok: true, code: 'updated', redirectTo: url };
}

export async function recordPayoutStatus(db: Db, userId: string, status: PayoutAccountStatus, now: Date): Promise<void> {
  const [before] = await db.select({ status: payoutAccounts.status }).from(payoutAccounts).where(eq(payoutAccounts.userId, userId)).limit(1);
  await db
    .update(payoutAccounts)
    .set({ status, activatedAt: status === 'active' ? now : null, updatedAt: now })
    .where(eq(payoutAccounts.userId, userId));
  if (before && before.status !== status) {
    if (status === 'active') await emitVerificationEvent(db, userId, 'payout', 'passed');
    if (status === 'requirements_due' || status === 'restricted') await emitVerificationEvent(db, userId, 'payout', 'action_needed');
  }
  await syncHelperProfile(db, userId, now);
}

// ---- Background checks ----------------------------------------------------------------------------

/**
 * Sends the Checkr invitation (valid 7 days). Needs payouts active, an in-home category offered, and the
 * disclosure summary acknowledged (now or before). A renewal can start from 30 days before the current
 * check runs out.
 */
export async function startBackgroundCheck(
  db: Db,
  providers: VerificationProviders,
  userId: string,
  now: Date,
  options: { acknowledged?: boolean; origin?: RequestOrigin } = {},
): Promise<ActionResult> {
  const state = await loadOnboardingState(db, userId, now);
  const { backgroundRequired } = computeOnboarding(state.facts);
  if (state.facts.payout !== 'active' || !state.identity.verified || !backgroundRequired || !state.background.canStart) return { ok: false, code: 'not_allowed' };
  if (state.agreements.bg_check_disclosure === undefined) {
    if (options.acknowledged !== true) return fieldError('acknowledged', 'must_accept');
    await recordAgreement(db, userId, 'bg_check_disclosure', options.origin ?? {}, now);
  }
  const [person] = await db.select({ email: users.email, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId)).limit(1);
  if (!person) return { ok: false, code: 'not_allowed' };
  const { ref, url } = await providers.background.start({ userId, ...person });
  await db.insert(backgroundChecks).values({
    id: newId('bgc'),
    userId,
    provider: providers.background.provider,
    providerRef: ref,
    status: 'invited',
    invitationExpiresAt: new Date(now.getTime() + BACKGROUND_RULES.invitationDays * DAY_MS),
    createdAt: now,
    updatedAt: now,
  });
  await audit(db, 'background.invited', userId);
  return { ok: true, code: 'updated', redirectTo: url };
}

export type BackgroundResult = Extract<BackgroundCheckStatus, 'pending' | 'clear' | 'consider' | 'suspended' | 'canceled'>;

/** A provider result (webhook): the report's status. Returns the person's id, or null for an unknown check. */
export async function recordBackgroundResult(db: Db, ref: string, status: BackgroundResult, now: Date): Promise<string | null> {
  const [row] = await db.select().from(backgroundChecks).where(eq(backgroundChecks.providerRef, ref)).limit(1);
  if (!row) return null;
  // Finished checks don't move again (a re-check is a new row).
  if (row.status === 'clear' || row.status === 'consider' || row.status === 'canceled' || row.status === 'expired') return row.userId;
  const completed = status === 'clear' || status === 'consider';
  await db
    .update(backgroundChecks)
    .set({
      status,
      completedAt: completed ? now : null,
      expiresAt: status === 'clear' ? new Date(now.getTime() + BACKGROUND_RULES.validDays * DAY_MS) : null,
      updatedAt: now,
    })
    .where(and(eq(backgroundChecks.id, row.id)));
  await audit(db, `background.${status}`, row.userId);
  if (status === 'clear') await emitVerificationEvent(db, row.userId, 'background', 'passed');
  if (status === 'suspended') await emitVerificationEvent(db, row.userId, 'background', 'action_needed');
  await syncHelperProfile(db, row.userId, now);
  return row.userId;
}
