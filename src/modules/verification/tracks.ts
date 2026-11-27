import { and, desc, eq, ne } from 'drizzle-orm';
import type { ActionResult, BackgroundCheckStatus, IdentityFailureReason, PayoutAccountStatus } from '@/contracts';
import { recordAgreement, type RequestOrigin } from '@/modules/accounts/agreements';
import { users } from '@/modules/accounts/schema';
import { areas, markets } from '@/modules/markets/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { fieldError } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { computeOnboarding } from './progress';
import type { VerificationProviders } from './providers';
import { addressVerifications, backgroundChecks, identityVerifications, payoutAccounts } from './schema';
import { BACKGROUND_RULES, namesMatch, normalizeName } from './standing';
import { emitVerificationEvent, loadOnboardingState, syncHelperProfile } from './state';
import { workLocationFor, type WorkLocation } from './work-location';

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
 * Opens the provider's hosted ID check: for helpers, the double check after our team approved their
 * photos (stage 1, `capture.ts`). Needs the phone verified and the Texas biometric notice accepted (now
 * or before). A check in progress can be continued with a new session (it counts as a try); blocked
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
  if (!step || step.state === 'locked' || !state.identity.canStart || !state.identity.captureApproved) return { ok: false, code: 'not_allowed' };
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

/**
 * A provider result (webhook). Returns the person's id, or null for an unknown session. `event`: when the
 * provider made the event and its own word for the result (Persona), so events that arrive late or twice
 * change nothing: only one newer than the last applied counts.
 */
export async function recordIdentityResult(db: Db, sessionId: string, result: IdentityResult, now: Date, event: { at?: Date; outcome?: string } = {}): Promise<string | null> {
  const [row] = await db.select().from(identityVerifications).where(eq(identityVerifications.providerSessionId, sessionId)).limit(1);
  if (!row) return null;
  if (event.at && row.providerEventAt && event.at.getTime() <= row.providerEventAt.getTime()) return row.userId;
  // A late result for a session that was already replaced or decided changes nothing, and a decision
  // isn't undone by a progress update.
  if (row.status === 'verified' || (row.status === 'canceled' && result.status !== 'verified')) return row.userId;
  if (row.status === 'requires_input' && result.status === 'processing') return row.userId;
  let nameMatches: boolean | null = null;
  if (result.status === 'verified') {
    const [account] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, row.userId)).limit(1);
    nameMatches = !result.verifiedName || !account ? true : namesMatch(account, result.verifiedName);
  }
  const rechecked = await db.transaction(async (tx) => {
    await tx
      .update(identityVerifications)
      .set({
        status: result.status,
        failureReason: result.status === 'requires_input' ? result.reason : null,
        isAdult: result.status === 'verified' ? true : result.status === 'requires_input' && result.reason === 'under_18' ? false : null,
        nameMatches,
        verifiedAt: result.status === 'verified' ? now : null,
        ...(event.at ? { providerEventAt: event.at } : {}),
        ...(event.outcome ? { providerOutcome: event.outcome } : {}),
        updatedAt: now,
      })
      .where(eq(identityVerifications.id, row.id));
    // The ID's legal name differs from the account's (ab, 2026-11-21): a home address our team verified against the
    // account's name goes back to them, in this same write. (It can be verified first now: the address opens while
    // the ID photos are in review.)
    if (nameMatches !== false) return false;
    const [latest] = await tx
      .select({ id: addressVerifications.id, status: addressVerifications.status })
      .from(addressVerifications)
      .where(and(eq(addressVerifications.userId, row.userId), ne(addressVerifications.status, 'withdrawn')))
      .orderBy(desc(addressVerifications.createdAt))
      .limit(1);
    if (latest?.status !== 'verified') return false;
    await tx.update(addressVerifications).set({ status: 'in_review', decidedAt: null, decidedByUserId: null, decidedBy: null }).where(eq(addressVerifications.id, latest.id));
    return true;
  });
  if (rechecked) await audit(db, 'address.recheck', row.userId, { reason: 'id_name_differs' });
  await audit(db, `identity.${result.status}`, row.userId, nameMatches === false ? { nameMatches: false } : {});
  // Helpers hear about it in setup; clients (asked by risk) on their own ID page.
  const [helper] = await db.select({ userId: helperProfiles.userId }).from(helperProfiles).where(eq(helperProfiles.userId, row.userId)).limit(1);
  const track = helper ? 'identity' : 'poster_identity';
  if (result.status === 'verified') await emitVerificationEvent(db, row.userId, track, nameMatches === false ? 'action_needed' : 'passed');
  if (result.status === 'requires_input') await emitVerificationEvent(db, row.userId, track, 'action_needed');
  // The helper hears why their home address is in review again (address_recheck).
  if (rechecked) await emitVerificationEvent(db, row.userId, 'address', 'recheck');
  await syncHelperProfile(db, row.userId, now);
  return row.userId;
}

/**
 * The legal name on the account changed (plan 6.3; blueprint 06 §1): a verified helper's ID check stops
 * counting and a new one is asked for (`name_changed`), so the ID's name is compared with the new one.
 * Case, accents and punctuation don't count as a change. A check under way already compares with the
 * name as it is. Returns whether a new check was asked for.
 */
export async function requestIdentityAfterNameChange(
  db: Db,
  userId: string,
  names: { before: { firstName: string; lastName: string }; after: { firstName: string; lastName: string } },
  now: Date,
): Promise<boolean> {
  const { before, after } = names;
  if (normalizeName(before.firstName) === normalizeName(after.firstName) && normalizeName(before.lastName) === normalizeName(after.lastName)) return false;
  const state = await loadOnboardingState(db, userId, now);
  // Helpers only, verified (or still counting while a renewal runs).
  if (!state.profile || (!state.identity.verified && !state.identity.renewal)) return false;
  await db.insert(identityVerifications).values({
    id: newId('idv'),
    userId,
    provider: state.identityRows.at(-1)?.provider ?? 'dev',
    providerSessionId: null,
    status: 'not_started',
    requestedReason: 'name_changed',
    requestedByUserId: null,
    createdAt: now,
    updatedAt: now,
  });
  await audit(db, 'identity.requested', userId, { reason: 'name_changed' });
  await emitVerificationEvent(db, userId, 'identity', 'action_needed');
  await syncHelperProfile(db, userId, now);
  return true;
}

// ---- Payouts --------------------------------------------------------------------------------------

export async function startPayout(db: Db, providers: Pick<VerificationProviders, 'payout'>, userId: string, now: Date): Promise<ActionResult> {
  const state = await loadOnboardingState(db, userId, now);
  const step = computeOnboarding(state.facts).progress.steps.find((s) => s.step === 'payout');
  if (!step || step.state === 'locked') return { ok: false, code: 'not_allowed' };
  // The account they started with this provider continues; otherwise a new one.
  const existing = state.payout?.provider === providers.payout.provider ? state.payout.providerAccountId : undefined;
  const [person] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const { accountId, url } = await providers.payout.start({ userId, email: person?.email ?? '', ...(existing ? { accountId: existing } : {}) });
  if (!state.payout) {
    await db.insert(payoutAccounts).values({ userId, provider: providers.payout.provider, providerAccountId: accountId, status: 'pending', createdAt: now, updatedAt: now });
  } else if (!existing) {
    // A development account replaced by a real one (the keys were added): start over with the provider.
    await db.update(payoutAccounts).set({ provider: providers.payout.provider, providerAccountId: accountId, status: 'pending', activatedAt: null, updatedAt: now }).where(eq(payoutAccounts.userId, userId));
  }
  return { ok: true, code: 'updated', redirectTo: url };
}

/** After the provider's onboarding (or "Check status"): its account state, read again. Webhooks do the same. */
export async function syncPayoutStatus(db: Db, providers: Pick<VerificationProviders, 'payout'>, userId: string, now: Date): Promise<void> {
  const [account] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, userId)).limit(1);
  if (!account || account.provider !== providers.payout.provider || !providers.payout.status) return;
  const status = await providers.payout.status(account.providerAccountId);
  if (status !== account.status) await recordPayoutStatus(db, userId, status, now);
}

/** A Connect `account.updated` event: the account's state for its helper. */
export async function recordPayoutAccountStatus(db: Db, providerAccountId: string, status: PayoutAccountStatus, now: Date): Promise<string | null> {
  const [account] = await db.select({ userId: payoutAccounts.userId, status: payoutAccounts.status }).from(payoutAccounts).where(eq(payoutAccounts.providerAccountId, providerAccountId)).limit(1);
  if (!account) return null;
  if (account.status !== status) await recordPayoutStatus(db, account.userId, status, now);
  return account.userId;
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
 * Sends the Checkr invitation (valid 7 days). Needs the profile basics (where the helper works decides the check's
 * rules), an in-home category offered, and the disclosure summary acknowledged (now or before); nothing else first
 * (owner, 2026-11-23: "I can do background first"). A renewal can start from 30 days before the current check runs out.
 */
export async function startBackgroundCheck(
  db: Db,
  providers: Pick<VerificationProviders, 'background'>,
  userId: string,
  now: Date,
  options: { acknowledged?: boolean; origin?: RequestOrigin } = {},
): Promise<ActionResult> {
  const state = await loadOnboardingState(db, userId, now);
  const { backgroundRequired, progress } = computeOnboarding(state.facts);
  const step = progress.steps.find((entry) => entry.step === 'background');
  if (!step || step.state === 'locked' || !backgroundRequired || !state.background.canStart) return { ok: false, code: 'not_allowed' };
  if (state.agreements.bg_check_disclosure === undefined) {
    if (options.acknowledged !== true) return fieldError('acknowledged', 'must_accept');
    await recordAgreement(db, userId, 'bg_check_disclosure', options.origin ?? {}, now);
  }
  const [person] = await db.select({ email: users.email, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId)).limit(1);
  const workLocation = await helperWorkLocation(db, userId);
  if (!person || !workLocation) return { ok: false, code: 'not_allowed' };
  const { ref, url } = await providers.background.start({ userId, ...person, workLocation });
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

/** Where the helper works, for the check's state and local rules (work-location.ts). */
async function helperWorkLocation(db: Pick<Db, 'select'>, userId: string): Promise<WorkLocation | null> {
  const [row] = await db
    .select({ areaId: helperProfiles.areaId, homeZip: helperProfiles.homeZip, homeCity: helperProfiles.homeCity, homeState: helperProfiles.homeState, marketName: markets.name, marketState: markets.state })
    .from(helperProfiles)
    .leftJoin(areas, eq(areas.id, helperProfiles.areaId))
    .leftJoin(markets, eq(markets.id, areas.marketId))
    .where(eq(helperProfiles.userId, userId))
    .limit(1);
  if (!row) return null;
  const market = row.marketName && row.marketState ? { name: row.marketName, state: row.marketState } : null;
  return workLocationFor({ ...row, market });
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
