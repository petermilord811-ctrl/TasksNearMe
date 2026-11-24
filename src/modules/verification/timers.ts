import { and, eq, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import type { FileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { userTimeZone } from '@/modules/markets/time-zone';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { deleteAddressDocument } from './address';
import { captureFileIds, deleteIdentityCapturePhotos } from './capture';
import { computeOnboarding } from './progress';
import type { VerificationProviders } from './providers';
import { addressVerifications, backgroundChecks, identityCaptures, identityVerifications } from './schema';
import { addressDocumentDue, ADDRESS_RULES, BACKGROUND_RULES, backgroundNoticeDue, capturePhotosDue, IDENTITY_CAPTURE_RULES, IDENTITY_RULES, identityStanding, idExpiryNoticeDue } from './standing';
import { emitVerificationEvent, loadOnboardingState, syncHelperProfile } from './state';

/**
 * Verification timers (the job runner, every minute; each step is idempotent):
 * - proof-of-address documents are deleted 30 days after the decision (withdrawn ones, and a deleted
 *   account's, at once);
 * - the ID photos of our own check are deleted once both stages are final (the double check cleared the ID
 *   our team approved), and at the latest 30 days after the stage-1 decision, whether approved or rejected
 *   (canceled ones, and a deleted account's, at once);
 * - hosted ID sessions nobody finished within 48 hours are closed, so a new one can start;
 * - 30 days before the ID a helper verified with runs out (the end of its expiry month), a new ID check is
 *   asked for and the helper is told; their ID-verified badge counts until the month ends, then not until it passes
 *   (being booked doesn't wait on the ID since 2026-11-23: helping opens with the verified home address);
 * - the provider is asked to delete ID images 30 days after a final result (Texas biometric limits);
 * - Checkr invitations nobody used within 7 days expire;
 * - background checks send renewal notices at 30 and 7 days, and pause in-home work when they run out.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const REDACT_AFTER_DAYS = 30;
const BATCH = 50;

export interface VerificationTimerDeps {
  storage: FileStorage;
  providers: VerificationProviders | null;
}

/** `scope.userIds`: only these people (tests; the job runs for everyone). */
export async function runVerificationTimers(db: Db, deps: VerificationTimerDeps, now: Date, scope: { userIds?: readonly string[] } = {}) {
  const touched = new Set<string>();
  const only = (column: Parameters<typeof inArray>[0]) => (scope.userIds ? [inArray(column, [...scope.userIds])] : []);

  // Documents past their retention, and a deleted account's at once (account deletion removes them
  // itself; this is the backstop).
  const withDocuments = await db
    .select({ row: addressVerifications, accountStatus: users.status })
    .from(addressVerifications)
    .innerJoin(users, eq(users.id, addressVerifications.userId))
    .where(
      and(
        ...only(addressVerifications.userId),
        isNotNull(addressVerifications.documentFileId),
        or(eq(addressVerifications.status, 'withdrawn'), eq(users.status, 'deleted'), lte(addressVerifications.decidedAt, new Date(now.getTime() - ADDRESS_RULES.documentRetentionDays * DAY_MS))),
      ),
    )
    .limit(BATCH);
  let documentsDeleted = 0;
  for (const { row, accountStatus } of withDocuments) {
    if (accountStatus !== 'deleted' && !addressDocumentDue(row, now)) continue;
    if (await deleteAddressDocument({ db, storage: deps.storage }, row.id, now)) {
      documentsDeleted += 1;
      await db.insert(auditLog).values({ id: newId('aud'), actorRole: 'system', action: 'address_proof.deleted', targetType: 'user', targetId: row.userId, metadata: { verificationId: row.id } });
    }
  }

  // ID photos of our own check (stage 1) past their retention. A deleted account's photos go at once,
  // and photos still waiting for review are canceled first.
  const photoRows = await db
    .select({ capture: identityCaptures, accountStatus: users.status })
    .from(identityCaptures)
    .innerJoin(users, eq(users.id, identityCaptures.userId))
    .where(
      and(
        ...only(identityCaptures.userId),
        isNull(identityCaptures.filesDeletedAt),
        or(isNotNull(identityCaptures.frontFileId), isNotNull(identityCaptures.backFileId), isNotNull(identityCaptures.selfieFileId)),
        or(eq(identityCaptures.status, 'canceled'), eq(users.status, 'deleted'), lte(identityCaptures.decidedAt, new Date(now.getTime() - IDENTITY_CAPTURE_RULES.photoRetentionDays * DAY_MS))),
      ),
    )
    .limit(BATCH);
  let idPhotosDeleted = 0;
  for (const { capture, accountStatus } of photoRows) {
    const gone = accountStatus === 'deleted';
    if (gone && capture.status === 'submitted') {
      await db.update(identityCaptures).set({ status: 'canceled', decidedAt: now, updatedAt: now }).where(and(eq(identityCaptures.id, capture.id), eq(identityCaptures.status, 'submitted')));
    }
    if (!gone && !capturePhotosDue({ ...capture, hasFiles: captureFileIds(capture).length > 0 }, now)) continue;
    if (await deleteIdentityCapturePhotos({ db, storage: deps.storage }, capture.id, now)) {
      idPhotosDeleted += 1;
      await db.insert(auditLog).values({ id: newId('aud'), actorRole: 'system', action: 'identity_capture.deleted', targetType: 'user', targetId: capture.userId, metadata: { captureId: capture.id, status: gone && capture.status === 'submitted' ? 'canceled' : capture.status } });
    }
  }

  // Both stages final: the double check cleared the ID our team approved, so the photos have done their job.
  const approvedWithPhotos = await db
    .select({ id: identityCaptures.id, userId: identityCaptures.userId })
    .from(identityCaptures)
    .where(
      and(
        ...only(identityCaptures.userId),
        eq(identityCaptures.status, 'approved'),
        isNull(identityCaptures.filesDeletedAt),
        or(isNotNull(identityCaptures.frontFileId), isNotNull(identityCaptures.backFileId), isNotNull(identityCaptures.selfieFileId)),
      ),
    )
    .limit(BATCH);
  for (const capture of approvedWithPhotos) {
    const [identityRows, captureRows] = await Promise.all([
      db.select().from(identityVerifications).where(eq(identityVerifications.userId, capture.userId)),
      db.select().from(identityCaptures).where(eq(identityCaptures.userId, capture.userId)),
    ]);
    // The current check itself passed (a renewal's earlier check counting doesn't make these final).
    const standing = identityStanding(identityRows, now, captureRows, await userTimeZone(db, capture.userId));
    if (!standing.verified || !standing.cleared) continue;
    if (await deleteIdentityCapturePhotos({ db, storage: deps.storage }, capture.id, now)) {
      idPhotosDeleted += 1;
      await db.insert(auditLog).values({ id: newId('aud'), actorRole: 'system', action: 'identity_capture.deleted', targetType: 'user', targetId: capture.userId, metadata: { captureId: capture.id, status: 'approved', after: 'double_check' } });
    }
  }

  // The ID a helper verified with runs out (6.3).
  const idRenewals = await runIdExpiry(db, deps, now, scope, touched);

  // Unfinished ID sessions.
  const stale = await db
    .update(identityVerifications)
    .set({ status: 'canceled', updatedAt: now })
    .where(
      and(
        ...only(identityVerifications.userId),
        eq(identityVerifications.status, 'processing'),
        isNotNull(identityVerifications.providerSessionId),
        lte(identityVerifications.createdAt, new Date(now.getTime() - IDENTITY_RULES.staleHours * HOUR_MS)),
      ),
    )
    .returning({ userId: identityVerifications.userId });
  for (const row of stale) touched.add(row.userId);

  // ID images at the provider.
  let redactions = 0;
  if (deps.providers) {
    const due = await db
      .select()
      .from(identityVerifications)
      .where(
        and(
          ...only(identityVerifications.userId),
          isNull(identityVerifications.redactionRequestedAt),
          isNotNull(identityVerifications.providerSessionId),
          inArray(identityVerifications.status, ['verified', 'requires_input', 'canceled']),
          lte(identityVerifications.updatedAt, new Date(now.getTime() - REDACT_AFTER_DAYS * DAY_MS)),
        ),
      )
      .limit(BATCH);
    for (const row of due) {
      await deps.providers.identity.redact(row.providerSessionId!);
      await db.update(identityVerifications).set({ redactionRequestedAt: now }).where(eq(identityVerifications.id, row.id));
      redactions += 1;
    }
  }

  // Unused invitations.
  const expiredInvites = await db
    .update(backgroundChecks)
    .set({ status: 'expired', updatedAt: now })
    .where(and(...only(backgroundChecks.userId), eq(backgroundChecks.status, 'invited'), lte(backgroundChecks.invitationExpiresAt, now)))
    .returning({ userId: backgroundChecks.userId });
  for (const row of expiredInvites) touched.add(row.userId);

  // Renewal notices for checks that count (clear, or engaged after review).
  const counting = await db
    .select()
    .from(backgroundChecks)
    .where(
      and(
        ...only(backgroundChecks.userId),
        isNotNull(backgroundChecks.expiresAt),
        lte(backgroundChecks.expiresAt, new Date(now.getTime() + BACKGROUND_RULES.renewalDays * DAY_MS)),
        or(eq(backgroundChecks.status, 'clear'), and(eq(backgroundChecks.status, 'consider'), eq(backgroundChecks.adjudication, 'engaged'))),
      ),
    )
    .limit(BATCH * 4);
  let notices = 0;
  for (const row of counting) {
    const stage = backgroundNoticeDue(row, now);
    if (!stage) continue;
    const state = await loadOnboardingState(db, row.userId, now);
    const { backgroundRequired } = computeOnboarding(state.facts);
    // A newer check that counts (a finished renewal), or no in-home category any more: nothing to say.
    const renewed = state.background.eligibleRow && state.background.eligibleRow.id !== row.id;
    await db.update(backgroundChecks).set({ expiryNotices: stage }).where(eq(backgroundChecks.id, row.id));
    if (renewed || !backgroundRequired || !state.profile) continue;
    const days = Math.max(0, Math.ceil((row.expiresAt!.getTime() - now.getTime()) / DAY_MS));
    await emitVerificationEvent(db, row.userId, 'background', stage === 3 ? 'expired' : 'expiring', { days });
    notices += 1;
    if (stage === 3) touched.add(row.userId);
  }

  for (const userId of touched) await syncHelperProfile(db, userId, now);
  return { documentsDeleted, idPhotosDeleted, idRenewals, staleSessions: stale.length, redactions, expiredInvites: expiredInvites.length, notices };
}

/**
 * The ID behind a helper's verification runs out at the end of its expiry month (we keep only the month
 * and year). 30 days before, an `id_expiring` request row asks for a new check, and the helper is told; the
 * earlier check counts until the month ends (`identityStanding`), so the ID-verified badge stays meanwhile. Once
 * it has ended without a new check passing, they're told once more and the badge goes (being booked doesn't depend
 * on the ID since 2026-11-23: helping opens with the verified home address).
 * Returns the new checks asked for.
 */
async function runIdExpiry(db: Db, deps: VerificationTimerDeps, now: Date, scope: { userIds?: readonly string[] }, touched: Set<string>): Promise<number> {
  const only = (column: Parameters<typeof inArray>[0]) => (scope.userIds ? [inArray(column, [...scope.userIds])] : []);
  // People with approved photos of an ID whose expiry month ends by the end of next month (a cheap first cut).
  const months = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
  const expiring = await db
    .selectDistinct({ userId: identityCaptures.userId })
    .from(identityCaptures)
    .innerJoin(users, eq(users.id, identityCaptures.userId))
    .where(
      and(
        ...only(identityCaptures.userId),
        eq(identityCaptures.status, 'approved'),
        ne(users.status, 'deleted'),
        sql`(${identityCaptures.autoCheck} ->> 'expiresYear')::int * 12 + (${identityCaptures.autoCheck} ->> 'expiresMonth')::int <= ${months + 1}`,
      ),
    )
    .limit(BATCH * 4);
  let asked = 0;
  for (const { userId } of expiring) {
    const [rows, captures] = await Promise.all([
      db.select().from(identityVerifications).where(eq(identityVerifications.userId, userId)),
      db.select().from(identityCaptures).where(eq(identityCaptures.userId, userId)),
    ]);
    const standing = identityStanding(rows, now, captures, await userTimeZone(db, userId));
    if (!standing.verified || !standing.expiresAt || !idExpiryNoticeDue(standing.expiresAt, now)) continue;
    const passed = now.getTime() >= standing.expiresAt.getTime();
    await db.insert(identityVerifications).values({
      id: newId('idv'),
      userId,
      provider: deps.providers?.identity.provider ?? 'dev',
      providerSessionId: null,
      status: 'not_started',
      requestedReason: 'id_expiring',
      requestedByUserId: null,
      expiryNotices: passed ? 2 : 1,
      createdAt: now,
      updatedAt: now,
    });
    const days = Math.max(0, Math.ceil((standing.expiresAt.getTime() - now.getTime()) / DAY_MS));
    await emitVerificationEvent(db, userId, 'identity', passed ? 'expired' : 'expiring', { days });
    await db.insert(auditLog).values({ id: newId('aud'), actorRole: 'system', action: 'identity.renewal_requested', targetType: 'user', targetId: userId, metadata: { expiresAt: standing.expiresAt.toISOString() } });
    touched.add(userId);
    asked += 1;
  }

  // Renewals whose month has ended without a new check passing: told once, and the ID badge goes.
  const renewals = await db
    .select()
    .from(identityVerifications)
    .where(and(...only(identityVerifications.userId), eq(identityVerifications.requestedReason, 'id_expiring'), lt(identityVerifications.expiryNotices, 2)))
    .limit(BATCH * 4);
  for (const renewal of renewals) {
    const [rows, captures] = await Promise.all([
      db.select().from(identityVerifications).where(eq(identityVerifications.userId, renewal.userId)),
      db.select().from(identityCaptures).where(eq(identityCaptures.userId, renewal.userId)),
    ]);
    const standing = identityStanding(rows, now, captures, await userTimeZone(db, renewal.userId));
    // Still counting: nothing to do yet.
    if (standing.renewal) continue;
    const resets = rows.filter((row) => row.providerSessionId === null).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const current = resets.at(-1)?.id === renewal.id;
    await db.update(identityVerifications).set({ expiryNotices: 2 }).where(eq(identityVerifications.id, renewal.id));
    // A newer request, or a new check that already passed: nothing to say.
    if (!current || standing.verified) continue;
    await emitVerificationEvent(db, renewal.userId, 'identity', 'expired', { days: 0 });
    touched.add(renewal.userId);
  }
  return asked;
}
