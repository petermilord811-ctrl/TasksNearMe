import { and, eq, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type { FileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { deleteAddressDocument } from './address';
import { captureFileIds, deleteIdentityCapturePhotos } from './capture';
import { computeOnboarding } from './progress';
import type { VerificationProviders } from './providers';
import { addressVerifications, backgroundChecks, identityCaptures, identityVerifications } from './schema';
import { addressDocumentDue, ADDRESS_RULES, BACKGROUND_RULES, backgroundNoticeDue, capturePhotosDue, IDENTITY_CAPTURE_RULES, IDENTITY_RULES } from './standing';
import { emitVerificationEvent, loadOnboardingState, syncHelperProfile } from './state';

/**
 * Verification timers (the job runner, every minute; each step is idempotent):
 * - proof-of-address documents are deleted 30 days after the decision (withdrawn ones at once);
 * - the ID photos of our own check are deleted 30 days after the stage-1 decision, whether approved or
 *   rejected (canceled ones, and a deleted account's, at once);
 * - hosted ID sessions nobody finished within 48 hours are closed, so a new one can start;
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

  // Documents past their retention.
  const withDocuments = await db
    .select()
    .from(addressVerifications)
    .where(and(...only(addressVerifications.userId), isNotNull(addressVerifications.documentFileId), or(eq(addressVerifications.status, 'withdrawn'), lte(addressVerifications.decidedAt, new Date(now.getTime() - ADDRESS_RULES.documentRetentionDays * DAY_MS)))))
    .limit(BATCH);
  let documentsDeleted = 0;
  for (const row of withDocuments) {
    if (!addressDocumentDue(row, now)) continue;
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
  return { documentsDeleted, idPhotosDeleted, staleSessions: stale.length, redactions, expiredInvites: expiredInvites.length, notices };
}
