import { and, asc, desc, eq, inArray, isNull, lte, ne, notInArray, or } from 'drizzle-orm';
import { DATA_EXPORT_DAYS, DELETION_GRACE_DAYS, type AccountPrivacyView, type ActionResult, type DeletionBlocker } from '@/contracts';
import { isReservedEmailAddress, type EmailProvider } from '@/integrations/email';
import type { FileStorage } from '@/integrations/storage';
import { accounts, phoneVerifications, sessions, staffAuthenticators, staffRoles, users, verifications } from '@/modules/accounts/schema';
import { availabilityPosts } from '@/modules/availability/schema';
import { bookings } from '@/modules/bookings/schema';
import { earnings, payouts } from '@/modules/earnings/schema';
import { blocks, threadParticipants } from '@/modules/messaging/schema';
import { notificationPreferences, notifications, privacyRequests, pushSubscriptions } from '@/modules/notifications/schema';
import { offers } from '@/modules/offers/schema';
import { helperOfferAction } from '@/modules/offers/helper';
import { cancelTask } from '@/modules/offers/owner';
import { paymentMethods } from '@/modules/payments/schema';
import { helperProfiles, helperServices, helperWorkSamples } from '@/modules/profiles/schema';
import { savedHelpers } from '@/modules/reviews/schema';
import { supportCases } from '@/modules/support/schema';
import { files, taskMarks, tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { buildDataExport, dataExportFilename } from './data-export';
import { renderAccountDeletedNotice } from './emails';

/**
 * Privacy requests (blueprint 08 §5; completion plan 3.3). A copy of the data is prepared by the job runner,
 * kept for `DATA_EXPORT_DAYS`, then deleted. A deletion waits `DELETION_GRACE_DAYS` (the person can keep the
 * account until then), and past that date for anything still open; then the account is anonymized: the
 * profile, contact details, sign-ins and preferences go, open tasks and offers close, and what others and
 * the law need (bookings, payments, messages to others, reviews) stays under "Deleted user".
 */

const DAY_MS = 86_400_000;
const OPEN_BOOKING_STATUSES = ['pending_funding', 'confirmed', 'in_progress', 'completion_submitted', 'disputed'];
const CLOSED_CASE_STATUSES = ['resolved', 'closed'];
/** Earnings not yet in the helper's bank: due later, held, scheduled, or on the way. */
const UNPAID_EARNING_STATUSES = ['not_due', 'on_hold', 'scheduled', 'transferred'];
const OPEN_PAYOUT_STATUSES = ['pending', 'in_transit'];
const EXPORTS_PER_RUN = 2;
const DELETIONS_PER_RUN = 5;

type Scope = { userIds?: readonly string[] };
const inScope = (scope: Scope) => (scope.userIds ? inArray(privacyRequests.userId, [...scope.userIds]) : undefined);

export interface PrivacyJobDeps {
  storage: FileStorage;
  cipher: FieldCipher;
  email: EmailProvider;
  appUrl: string;
}

async function hasOpenBookings(db: Db, userId: string): Promise<boolean> {
  const [open] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(inArray(bookings.status, OPEN_BOOKING_STATUSES), or(eq(bookings.posterUserId, userId), eq(bookings.helperUserId, userId))))
    .limit(1);
  return Boolean(open);
}

/** What keeps an account from being deleted right now (`DELETION_BLOCKERS`), if anything. */
export async function deletionBlocker(db: Db, userId: string): Promise<DeletionBlocker | undefined> {
  if (await hasOpenBookings(db, userId)) return 'open_bookings';
  const [openCase] = await db
    .select({ id: supportCases.id })
    .from(supportCases)
    .where(and(notInArray(supportCases.status, CLOSED_CASE_STATUSES), or(eq(supportCases.openedByUserId, userId), eq(supportCases.subjectUserId, userId))))
    .limit(1);
  if (openCase) return 'open_case';
  const [unpaid] = await db.select({ id: earnings.id }).from(earnings).where(and(eq(earnings.helperUserId, userId), inArray(earnings.status, UNPAID_EARNING_STATUSES))).limit(1);
  const [payout] = unpaid ? [unpaid] : await db.select({ id: payouts.id }).from(payouts).where(and(eq(payouts.helperUserId, userId), inArray(payouts.status, OPEN_PAYOUT_STATUSES))).limit(1);
  if (payout) return 'money_on_its_way';
  return undefined;
}

/** A copy of the data, prepared in the background. Asking again while one is on its way or ready changes nothing. */
export async function requestDataExport(db: Db, userId: string, now: Date): Promise<ActionResult> {
  const [current] = await db
    .select({ id: privacyRequests.id, status: privacyRequests.status, expiresAt: privacyRequests.expiresAt })
    .from(privacyRequests)
    .where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.kind, 'export'), inArray(privacyRequests.status, ['requested', 'ready'])))
    .orderBy(desc(privacyRequests.createdAt))
    .limit(1);
  const usable = current && (current.status === 'requested' || (current.expiresAt && current.expiresAt > now));
  if (!usable) await db.insert(privacyRequests).values({ id: newId('prv'), userId, kind: 'export', status: 'requested', createdAt: now });
  return { ok: true, code: 'submitted' };
}

/** Deletion in `DELETION_GRACE_DAYS`; not while bookings are open (finish or cancel them first). */
export async function requestAccountDeletion(db: Db, userId: string, now: Date): Promise<ActionResult> {
  if (await hasOpenBookings(db, userId)) return { ok: false, code: 'not_allowed' };
  const [existing] = await db
    .select({ id: privacyRequests.id })
    .from(privacyRequests)
    .where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.kind, 'deletion'), eq(privacyRequests.status, 'requested')))
    .limit(1);
  if (!existing) {
    await db.insert(privacyRequests).values({ id: newId('prv'), userId, kind: 'deletion', status: 'requested', scheduledFor: new Date(now.getTime() + DELETION_GRACE_DAYS * DAY_MS), createdAt: now });
    await db.insert(auditLog).values({ id: newId('aud'), actorId: userId, actorRole: 'user', action: 'account.deletion_requested', targetType: 'user', targetId: userId });
  }
  return { ok: true, code: 'submitted' };
}

/** "Keep my account": the deletion is withdrawn. Nothing pending is fine too. */
export async function cancelAccountDeletion(db: Db, userId: string, now: Date): Promise<ActionResult> {
  const withdrawn = await db
    .update(privacyRequests)
    .set({ status: 'withdrawn', completedAt: now })
    .where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.kind, 'deletion'), eq(privacyRequests.status, 'requested')))
    .returning({ id: privacyRequests.id });
  if (withdrawn.length) await db.insert(auditLog).values({ id: newId('aud'), actorId: userId, actorRole: 'user', action: 'account.deletion_withdrawn', targetType: 'user', targetId: userId });
  return { ok: true, code: 'updated' };
}

const scheduledOf = (row: { scheduledFor: Date | null; createdAt: Date }) => row.scheduledFor ?? new Date(row.createdAt.getTime() + DELETION_GRACE_DAYS * DAY_MS);

/** The account page's privacy section. */
export async function privacyViewOf(db: Db, userId: string, now: Date): Promise<AccountPrivacyView> {
  const rows = await db
    .select()
    .from(privacyRequests)
    .where(and(eq(privacyRequests.userId, userId), inArray(privacyRequests.status, ['requested', 'ready'])))
    .orderBy(desc(privacyRequests.createdAt));
  const exportRow = rows.find((row) => row.kind === 'export' && (row.status === 'requested' || (row.expiresAt && row.expiresAt > now)));
  const deletionRow = rows.find((row) => row.kind === 'deletion' && row.status === 'requested');
  return {
    ...(exportRow
      ? {
          export:
            exportRow.status === 'ready' && exportRow.expiresAt
              ? { status: 'ready' as const, requestedAt: exportRow.createdAt.toISOString(), expiresAt: exportRow.expiresAt.toISOString() }
              : { status: 'preparing' as const, requestedAt: exportRow.createdAt.toISOString() },
        }
      : {}),
    ...(deletionRow
      ? {
          deletion: {
            requestedAt: deletionRow.createdAt.toISOString(),
            scheduledFor: scheduledOf(deletionRow).toISOString(),
            ...(deletionRow.blockedReason ? { waitingFor: deletionRow.blockedReason as DeletionBlocker } : {}),
          },
        }
      : {}),
  };
}

const exportKey = (userId: string, requestId: string) => `exports/${userId}/${requestId}.json`;

/** The job: prepare waiting exports (a couple a minute), then tell the person it's ready. */
export async function prepareDueExports(db: Db, deps: Pick<PrivacyJobDeps, 'storage' | 'cipher'>, now: Date, scope: Scope = {}): Promise<number> {
  const due = await db
    .select()
    .from(privacyRequests)
    .where(and(eq(privacyRequests.kind, 'export'), eq(privacyRequests.status, 'requested'), inScope(scope)))
    .orderBy(asc(privacyRequests.createdAt))
    .limit(EXPORTS_PER_RUN);
  let prepared = 0;
  for (const request of due) {
    const data = await buildDataExport(db, deps.cipher, request.userId, now);
    if (!data) {
      await db.update(privacyRequests).set({ status: 'expired', completedAt: now }).where(eq(privacyRequests.id, request.id));
      continue;
    }
    const key = exportKey(request.userId, request.id);
    await deps.storage.put(key, Buffer.from(JSON.stringify(data, null, 2), 'utf8'), 'application/json');
    const expiresAt = new Date(now.getTime() + DATA_EXPORT_DAYS * DAY_MS);
    const [ready] = await db
      .update(privacyRequests)
      .set({ status: 'ready', fileKey: key, readyAt: now, expiresAt })
      .where(and(eq(privacyRequests.id, request.id), eq(privacyRequests.status, 'requested')))
      .returning({ id: privacyRequests.id });
    if (!ready) {
      // Another run got there first.
      await deps.storage.delete(key);
      continue;
    }
    await db.insert(outboxEvents).values({ id: newId('evt'), type: 'privacy.export_ready', aggregateType: 'user', aggregateId: request.userId, payload: { userId: request.userId, requestId: request.id, expiresAt: expiresAt.toISOString() } });
    prepared += 1;
  }
  return prepared;
}

/** The job: delete exports past their days. */
export async function expireDueExports(db: Db, deps: Pick<PrivacyJobDeps, 'storage'>, now: Date, scope: Scope = {}): Promise<number> {
  const due = await db
    .select({ id: privacyRequests.id, fileKey: privacyRequests.fileKey })
    .from(privacyRequests)
    .where(and(eq(privacyRequests.kind, 'export'), eq(privacyRequests.status, 'ready'), lte(privacyRequests.expiresAt, now), inScope(scope)));
  for (const row of due) {
    if (row.fileKey) await deps.storage.delete(row.fileKey);
    await db.update(privacyRequests).set({ status: 'expired', fileKey: null, completedAt: now }).where(eq(privacyRequests.id, row.id));
  }
  return due.length;
}

/** The person's ready export, for the download route (their own only). */
export async function readReadyExport(db: Db, storage: FileStorage, userId: string, now: Date): Promise<{ body: Buffer; filename: string } | null> {
  const [row] = await db
    .select()
    .from(privacyRequests)
    .where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.kind, 'export'), eq(privacyRequests.status, 'ready')))
    .orderBy(desc(privacyRequests.readyAt))
    .limit(1);
  if (!row?.fileKey || !row.expiresAt || row.expiresAt <= now) return null;
  const body = await storage.get(row.fileKey);
  return body ? { body, filename: dataExportFilename(row.readyAt ?? now) } : null;
}

/** The job: deletions past their date, once nothing is open (otherwise say what they wait for). */
export async function processDueDeletions(db: Db, deps: PrivacyJobDeps, now: Date, scope: Scope = {}): Promise<{ deleted: number; waiting: number }> {
  const requested = await db
    .select()
    .from(privacyRequests)
    .where(and(eq(privacyRequests.kind, 'deletion'), eq(privacyRequests.status, 'requested'), inScope(scope)))
    .orderBy(asc(privacyRequests.createdAt));
  let deleted = 0;
  let waiting = 0;
  for (const request of requested.filter((row) => scheduledOf(row) <= now).slice(0, DELETIONS_PER_RUN)) {
    const blocker = await deletionBlocker(db, request.userId);
    if (blocker) {
      if (request.blockedReason !== blocker) await db.update(privacyRequests).set({ blockedReason: blocker }).where(eq(privacyRequests.id, request.id));
      waiting += 1;
      continue;
    }
    await anonymizeAccount(db, deps, request.userId, now);
    await db.update(privacyRequests).set({ status: 'done', blockedReason: null, completedAt: now }).where(eq(privacyRequests.id, request.id));
    deleted += 1;
  }
  return { deleted, waiting };
}

/**
 * Anonymizes an account. Their open tasks are canceled and pending offers withdrawn first (the other
 * people are told, as usual); then the personal details, sign-ins, sessions, preferences, photos and
 * marks go, and the person gets a last email at the old address. Bookings, payments, messages others
 * received and reviews stay, under "Deleted user", for the people and the records that need them.
 */
export async function anonymizeAccount(db: Db, deps: PrivacyJobDeps, userId: string, now: Date): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status === 'deleted') return;

  for (const task of await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.posterUserId, userId), eq(tasks.status, 'open')))) {
    await cancelTask(db, userId, task.id, 'no_longer_needed', now);
  }
  for (const offer of await db.select({ id: offers.id }).from(offers).where(and(eq(offers.helperUserId, userId), inArray(offers.status, ['pending', 'stale'])))) {
    await helperOfferAction(db, userId, offer.id, 'withdraw_offer', now);
  }

  const photoFiles = await db
    .select({ id: files.id, storageKey: files.storageKey })
    .from(files)
    .where(and(eq(files.ownerUserId, userId), or(eq(files.kind, 'avatar'), eq(files.kind, 'work_sample'))));

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        name: 'Deleted user',
        firstName: 'Deleted',
        lastName: 'User',
        email: `deleted+${userId}@deleted.invalid`,
        emailVerified: false,
        image: null,
        phone: null,
        phoneVerifiedAt: null,
        avatarFileId: null,
        status: 'deleted',
        updatedAt: now,
      })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx.delete(verifications).where(eq(verifications.identifier, user.email));
    await tx.delete(phoneVerifications).where(eq(phoneVerifications.userId, userId));
    await tx.delete(staffRoles).where(eq(staffRoles.userId, userId));
    await tx.delete(staffAuthenticators).where(eq(staffAuthenticators.userId, userId));
    await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    await tx.delete(savedHelpers).where(or(eq(savedHelpers.userId, userId), eq(savedHelpers.helperUserId, userId)));
    await tx.delete(taskMarks).where(eq(taskMarks.userId, userId));
    await tx.delete(blocks).where(eq(blocks.blockerId, userId));
    await tx.update(threadParticipants).set({ muted: true }).where(eq(threadParticipants.userId, userId));
    await tx.update(paymentMethods).set({ detachedAt: now, isDefault: false }).where(and(eq(paymentMethods.userId, userId), isNull(paymentMethods.detachedAt)));
    await tx.update(availabilityPosts).set({ status: 'canceled', canceledAt: now, updatedAt: now }).where(and(eq(availabilityPosts.helperUserId, userId), ne(availabilityPosts.status, 'canceled')));
    await tx.update(helperProfiles).set({ handle: `deleted-${userId}`, headline: '', bio: '', tools: [], status: 'paused', updatedAt: now.toISOString() }).where(eq(helperProfiles.userId, userId));
    await tx.update(helperServices).set({ status: 'paused', description: '' }).where(eq(helperServices.userId, userId));
    await tx.delete(helperWorkSamples).where(eq(helperWorkSamples.userId, userId));
    if (photoFiles.length) await tx.delete(files).where(inArray(files.id, photoFiles.map((file) => file.id)));
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: null, actorRole: 'system', action: 'account.deleted', targetType: 'user', targetId: userId, metadata: { at: now.toISOString() } });
  });

  for (const file of photoFiles) await deps.storage.delete(file.storageKey);
  // Unfinished exports of a deleted account go too.
  for (const row of await db.select({ id: privacyRequests.id, fileKey: privacyRequests.fileKey }).from(privacyRequests).where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.kind, 'export'), inArray(privacyRequests.status, ['requested', 'ready'])))) {
    if (row.fileKey) await deps.storage.delete(row.fileKey);
    await db.update(privacyRequests).set({ status: 'expired', fileKey: null, completedAt: now }).where(eq(privacyRequests.id, row.id));
  }

  if (!isReservedEmailAddress(user.email) || process.env.NODE_ENV !== 'production') {
    const email = renderAccountDeletedNotice({ appUrl: deps.appUrl });
    try {
      await deps.email.send({ to: user.email, subject: email.subject, text: email.text, html: email.html, tag: 'account-deleted', idempotencyKey: `account-deleted-${userId}` });
    } catch (error) {
      console.error('[privacy] the goodbye email failed', error instanceof Error ? error.message : error);
    }
  }
}

/** Everything the privacy job does in one run. */
export async function runPrivacyRequests(db: Db, deps: PrivacyJobDeps, now: Date): Promise<void> {
  await prepareDueExports(db, deps, now);
  await expireDueExports(db, deps, now);
  await processDueDeletions(db, deps, now);
}
