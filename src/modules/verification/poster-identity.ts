import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { routes, type ActionResult, type PosterIdentityPageData } from '@/contracts';
import { recordAgreement, type RequestOrigin } from '@/modules/accounts/agreements';
import { POSTER_ID_RULES, posterIdentityRequirement } from '@/modules/trust/poster-risk';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import type { VerificationProviders } from './providers';
import { identityVerifications } from './schema';
import { loadOnboardingState, verificationSummary } from './state';

/**
 * The client's ID check (blueprint 01 P2: asked for when risk calls for it; src/modules/trust/poster-risk.ts).
 * The same hosted check and limits as the helper's (3 tries a day, 5 in all, the Texas biometric notice
 * first), without the helper setup around it; it returns to `/app/verify-identity`.
 */

/** Only the app's own pages, so a link can't send the person elsewhere after verifying (home otherwise). */
export function safeContinue(next: unknown): string {
  return typeof next === 'string' && /^\/app([/?][A-Za-z0-9_\-/?=&%.+*~!'(),:@]*)?$/.test(next) && !next.includes('//') ? next : routes.app.home();
}

/** Pages that post or pay send the person to their ID check first, when risk asks for one (and back after). */
export async function requirePosterIdentity(db: Db, userId: string, now: Date, here: string, amountCents?: number): Promise<void> {
  if (await posterIdentityRequirement(db, userId, now, amountCents)) redirect(routes.app.verifyIdentity(here));
}

/**
 * What this page offers: whatever risk asks for now, or, for a new account, the large-booking rule (the
 * check can be done ahead of the booking that needs it, which is how a refused booking gets here).
 */
const offered = (db: Db, userId: string, now: Date) => posterIdentityRequirement(db, userId, now, POSTER_ID_RULES.largeBookingCents);

export async function getPosterIdentityPage(db: Db, userId: string, next: unknown, now: Date): Promise<PosterIdentityPageData> {
  const [state, requirement] = await Promise.all([loadOnboardingState(db, userId, now), offered(db, userId, now)]);
  return {
    ...(requirement ? { reason: requirement.reason } : {}),
    identity: verificationSummary(state, false, null).identity,
    continueHref: safeContinue(next),
  };
}

export async function startPosterIdentity(
  db: Db,
  providers: VerificationProviders,
  userId: string,
  now: Date,
  options: { consent?: boolean; origin?: RequestOrigin; next?: string } = {},
): Promise<ActionResult> {
  const state = await loadOnboardingState(db, userId, now);
  // Only when something asks for it (each check costs us); the limits are the helper's.
  if (!state.identity.canStart || !(await offered(db, userId, now))) return { ok: false, code: 'not_allowed' };
  if (state.agreements.biometric_consent === undefined) {
    if (options.consent !== true) return { ok: false, code: 'validation_failed', fieldErrors: { consent: ['must_accept'] } };
    await recordAgreement(db, userId, 'biometric_consent', options.origin ?? {}, now);
  }
  const latest = state.identity.latest;
  if (latest && latest.providerSessionId !== null && latest.status === 'processing') {
    // Continuing: the unfinished session is closed and a new one opens.
    await db.update(identityVerifications).set({ status: 'canceled', updatedAt: now }).where(eq(identityVerifications.id, latest.id));
  }
  const { sessionId, url } = await providers.identity.start(userId, { returnPath: routes.app.verifyIdentity(options.next ? safeContinue(options.next) : undefined) });
  await db.insert(identityVerifications).values({ id: newId('idv'), userId, provider: providers.identity.provider, providerSessionId: sessionId, status: 'processing', createdAt: now, updatedAt: now });
  await db.insert(auditLog).values({ id: newId('aud'), actorId: userId, actorRole: 'user', action: 'identity.started', targetType: 'user', targetId: userId, metadata: { for: 'poster' } });
  return { ok: true, code: 'updated', redirectTo: url };
}
