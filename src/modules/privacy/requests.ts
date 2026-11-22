import { communityAnnouncementDismissals, communityFollows, communityPosts, communityReactions, communityReplies } from '@/modules/community/schema';
import { messageReactions, savedReplies } from '@/modules/messaging/schema';
import { taskQuestions } from '@/modules/questions/schema';
import { savedSearches } from '@/modules/searches/schema';
import { waitlistEntries } from '@/modules/marketing/schema';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from 'drizzle-orm';
import { DATA_EXPORT_DAYS, DELETION_GRACE_DAYS, localeOrDefault, type AccountPrivacyView, type ActionResult, type DeletionBlocker } from '@/contracts';
import { isReservedEmailAddress, type EmailProvider } from '@/integrations/email';
import type { FileStorage } from '@/integrations/storage';
import { accounts, contactChangeReverts, passkeys, phoneVerifications, sessions, staffAuthenticators, staffRoles, usernames, users, verifications } from '@/modules/accounts/schema';
import { availabilityPosts } from '@/modules/availability/schema';
import { bookingSeries, bookings } from '@/modules/bookings/schema';
import { earnings, payouts } from '@/modules/earnings/schema';
import { blocks, threadParticipants } from '@/modules/messaging/schema';
import { notificationDeliveries, notificationPreferences, notifications, privacyRequests, pushSubscriptions } from '@/modules/notifications/schema';
import { closeInvitesOf } from '@/modules/invites/service';
import { rebookProposals } from '@/modules/rebook/schema';
import { declineProposal, withdrawProposal } from '@/modules/rebook/service';
import { markets } from '@/modules/markets/schema';
import { expireCacheTags } from '@/platform/cache/expire';
import { offers } from '@/modules/offers/schema';
import { helperOfferAction } from '@/modules/offers/helper';
import { cancelTask } from '@/modules/offers/owner';
import type { PaymentProvider } from '@/integrations/payments';
import { paymentCustomers, paymentMethods } from '@/modules/payments/schema';
import { helperProfiles, helperServices, helperWorkSamples } from '@/modules/profiles/schema';
import { userBadges } from '@/modules/badges/schema';
import { savedHelpers } from '@/modules/reviews/schema';
import { deleteAddressDocument } from '@/modules/verification/address';
import { deleteIdentityCapturePhotos } from '@/modules/verification/capture';
import { addressVerifications, backgroundChecks, identityCaptures } from '@/modules/verification/schema';
import { supportCases } from '@/modules/support/schema';
import { files, taskLocations, taskMarks, taskPhotos, tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { buildDataExport, dataExportFilename, dataExportJsonName, dataExportPhotos } from './data-export';
import { zipFiles } from './zip';
import { renderAccountDeletedNotice } from './emails';
import { devHelpersOn } from '@/shared/dev-helpers';
import { createBillingProvider } from '@/integrations/billing';
import { aiUsage } from '@/modules/billing/schema';
import { endSubscriptionsOf, forgetBillingCustomerOf, stopRenewalsOf } from '@/modules/billing/service';

/**
 * Privacy requests (blueprint 08 §5; completion plan 3.3). A copy of the data is prepared by the job runner,
 * kept for `DATA_EXPORT_DAYS`, then deleted. A deletion waits `DELETION_GRACE_DAYS` (the person can keep the
 * account until then), and past that date for anything still open; then the account is anonymized: the
 * profile, contact details, sign-ins and preferences go, open tasks and offers close, and what others and
 * the law need (bookings, payments, messages to others, reviews) stays under "Deleted account".
 */

const DAY_MS = 86_400_000;
const OPEN_BOOKING_STATUSES = ['scheduled', 'pending_funding', 'confirmed', 'in_progress', 'completion_submitted', 'disputed'];
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
  /** Deletes the person's customer at the payment provider (Stripe) with the account. */
  payments?: PaymentProvider | null;
  /** Cancels a background check invitation still waiting at Checkr (ab, 2026-11-21). */
  background?: { cancelInvitations?(ref: string): Promise<void> } | null;
}

async function hasOpenBookings(db: Db, userId: string): Promise<boolean> {
  const [open] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(inArray(bookings.status, OPEN_BOOKING_STATUSES), or(eq(bookings.posterUserId, userId), eq(bookings.helperUserId, userId))))
    .limit(1);
  if (open) return true;
  // Regular visits still running (active or paused) are ended by the person first, so the helper's schedule stays whole.
  const [series] = await db
    .select({ id: bookingSeries.id })
    .from(bookingSeries)
    .where(and(inArray(bookingSeries.status, ['active', 'paused']), or(eq(bookingSeries.posterUserId, userId), eq(bookingSeries.helperUserId, userId))))
    .limit(1);
  return Boolean(series);
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
  // Plans (9.13): nothing renews while the deletion waits (aa's sweep #6); each ends with the period paid for.
  await stopRenewalsOf(db, createBillingProvider(), userId, now);
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

const exportKey = (userId: string, requestId: string) => `exports/${userId}/${requestId}.zip`;

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
    let data: Record<string, unknown> | null;
    try {
      data = await buildDataExport(db, deps.cipher, request.userId, now);
    } catch (error) {
      // One that fails is tried again next run, and the ones behind it still go (J-PR1).
      console.error(`[privacy] the data copy for ${request.userId} failed; trying again next run`, error instanceof Error ? error.message : error);
      continue;
    }
    if (!data) {
      await db.update(privacyRequests).set({ status: 'expired', completedAt: now }).where(eq(privacyRequests.id, request.id));
      continue;
    }
    const key = exportKey(request.userId, request.id);
    // One zip: the JSON, and the photos they added, listed in it (ab, 2026-11-21, J-PR10).
    const photos = await dataExportPhotos(db, deps.storage, request.userId);
    const json = Buffer.from(JSON.stringify({ ...data, photos: photos.list }, null, 2), 'utf8');
    await deps.storage.put(key, zipFiles([{ name: dataExportJsonName(now), body: json, compress: true }, ...photos.entries], now), 'application/zip');
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
  let tried = 0;
  // Only deletions that run count toward a run's share: the ones still waiting (an open booking, a case) no longer take
  // every place and leave the requests behind them waiting forever (privacy rehearsal J-PR2).
  for (const request of requested.filter((row) => scheduledOf(row) <= now)) {
    if (tried >= DELETIONS_PER_RUN) break;
    const blocker = await deletionBlocker(db, request.userId);
    if (blocker) {
      if (request.blockedReason !== blocker) await db.update(privacyRequests).set({ blockedReason: blocker }).where(eq(privacyRequests.id, request.id));
      waiting += 1;
      continue;
    }
    tried += 1;
    try {
      await anonymizeAccount(db, deps, request.userId, now);
    } catch (error) {
      // One that fails (a provider, a constraint) is tried again next run without holding up the ones behind it
      // (privacy rehearsal J-PR1: a single failure stalled every deletion after it in the batch, every minute).
      console.error(`[privacy] deleting ${request.userId} failed; trying again next run`, error instanceof Error ? error.message : error);
      continue;
    }
    await db.update(privacyRequests).set({ status: 'done', blockedReason: null, completedAt: now }).where(eq(privacyRequests.id, request.id));
    deleted += 1;
  }
  return { deleted, waiting };
}

/**
 * Anonymizes an account. Their open tasks are canceled and pending offers withdrawn first (the other
 * people are told, as usual); then the personal details, sign-ins, sessions, preferences, photos, marks
 * and verification documents go, and the person gets a last email at the old address. Bookings, payments, messages others
 * received and reviews stay, under "Deleted account", for the people and the records that need them.
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

  // Their requests to helpers end (the card holds are released), and requests to them as a helper are declined:
  // nobody books, or is booked by, a deleted account (privacy rehearsal J-PR3).
  await closeInvitesOf(db, deps.payments ?? null, userId, now);
  // Rebooking proposals waiting either way end too: one they sent as a helper is withdrawn, one sent to them declined.
  for (const row of await db.select({ id: rebookProposals.id, helperUserId: rebookProposals.helperUserId }).from(rebookProposals).where(and(or(eq(rebookProposals.helperUserId, userId), eq(rebookProposals.posterUserId, userId)), eq(rebookProposals.status, 'sent')))) {
    await (row.helperUserId === userId ? withdrawProposal(db, userId, row.id, now) : declineProposal(db, userId, row.id, now));
  }

  // Plans (9.13): they end now, so nothing renews and charges after the account is gone.
  const billing = createBillingProvider();
  await endSubscriptionsOf(db, billing, userId, now);

  // Their photos go: the profile's, the work samples' and their tasks' (pictures of their home, J-PR3). Message
  // attachments, completion photos and receipts stay on the retention clock (blueprint 08 §5), for the other person.
  const photoFiles = await db
    .select({ id: files.id, storageKey: files.storageKey })
    .from(files)
    .where(and(eq(files.ownerUserId, userId), inArray(files.kind, ['avatar', 'work_sample', 'task_photo', 'community_photo'])));
  // The cached pages they were on: their public profile, the helper lists, their tasks and their city's pages (J-PR4).
  const [profile] = await db.select({ handle: helperProfiles.handle }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  const [market] = await db.select({ slug: markets.slug }).from(markets).where(eq(markets.id, user.homeMarketId)).limit(1);

  // What lives outside the database goes before the account changes, so a failure here leaves the account whole for the
  // next run to try again (J-PR1); deleting a file or a customer twice is harmless. After the change, the account reads
  // as deleted and the next run would skip it.
  for (const file of photoFiles) await deps.storage.delete(file.storageKey);
  // Their customer at the payment provider goes too, with every card on it (payments themselves stay on the
  // provider's records, as the law requires). Connected payout accounts stay for tax reporting.
  const [customer] = await db.select().from(paymentCustomers).where(eq(paymentCustomers.userId, userId)).limit(1);
  if (customer && deps.payments?.name === customer.provider && deps.payments.forgetCustomer) {
    await deps.payments.forgetCustomer(customer.customerRef);
    await db.delete(paymentCustomers).where(eq(paymentCustomers.userId, userId));
  }
  // And their customer for plans, once its plans ended above (J-PR9).
  await forgetBillingCustomerOf(db, billing, userId);
  // A background check invitation still waiting is canceled at Checkr, so nothing is run or billed for an account
  // that's gone (ab, 2026-11-21, J-PR11); the row stays, canceled. A check under way or done keeps its status (FCRA).
  for (const check of await db.select({ id: backgroundChecks.id, provider: backgroundChecks.provider, ref: backgroundChecks.providerRef }).from(backgroundChecks).where(and(eq(backgroundChecks.userId, userId), eq(backgroundChecks.status, 'invited')))) {
    if (check.provider === 'checkr' && check.ref) {
      if (deps.background?.cancelInvitations) await deps.background.cancelInvitations(check.ref);
      else console.error(`[privacy] no Checkr client to cancel ${check.id}'s invitation; it expires on its own`);
    }
    await db.update(backgroundChecks).set({ status: 'canceled', updatedAt: now }).where(eq(backgroundChecks.id, check.id));
  }
  // Had they any booking, either side? Then their verified home address stays, encrypted, for claims about real jobs:
  // the retention sweep deletes it 2 years after the last one (ab, 2026-11-21, J-PR12).
  const [booked] = await db.select({ id: bookings.id }).from(bookings).where(or(eq(bookings.posterUserId, userId), eq(bookings.helperUserId, userId))).limit(1);
  // Unfinished exports of a deleted account go too.
  for (const row of await db.select({ id: privacyRequests.id, fileKey: privacyRequests.fileKey }).from(privacyRequests).where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.kind, 'export'), inArray(privacyRequests.status, ['requested', 'ready'])))) {
    if (row.fileKey) await deps.storage.delete(row.fileKey);
    await db.update(privacyRequests).set({ status: 'expired', fileKey: null, completedAt: now }).where(eq(privacyRequests.id, row.id));
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        // As the data copy names them (ab, 2026-11-21); a label in each reader's language is a row of its own.
        name: 'Deleted account',
        firstName: 'Deleted',
        lastName: 'Account',
        email: `deleted+${userId}@deleted.invalid`,
        emailVerified: false,
        image: null,
        phone: null,
        phoneVerifiedAt: null,
        avatarFileId: null,
        // Neighbors (plan 10): their neighborhood and digest mark go with the account.
        homeAreaId: null,
        communityDigestAt: null,
        status: 'deleted',
        updatedAt: now,
      })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx.delete(passkeys).where(eq(passkeys.userId, userId));
    await tx.delete(verifications).where(eq(verifications.identifier, user.email));
    await tx.delete(phoneVerifications).where(eq(phoneVerifications.userId, userId));
    // "Not you?" links keep old addresses and numbers (completion plan 5.23).
    await tx.delete(contactChangeReverts).where(eq(contactChangeReverts.userId, userId));
    await tx.delete(staffRoles).where(eq(staffRoles.userId, userId));
    await tx.delete(staffAuthenticators).where(eq(staffAuthenticators.userId, userId));
    // Their @username is free for someone else (2026-11-22); old messages show "Deleted account" without one.
    await tx.delete(usernames).where(eq(usernames.userId, userId));
    await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    await tx.delete(aiUsage).where(eq(aiUsage.userId, userId));
    // Their notifications' email, text and push rows first: they point at the notifications with no cascade, and every
    // recent notification has them, so the delete failed for anyone who'd been told anything (privacy rehearsal J-PR1).
    await tx.delete(notificationDeliveries).where(eq(notificationDeliveries.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    // Their exact addresses go now, not 180 days after their last booking (nothing of theirs is open by now, J-PR3).
    await tx.update(taskLocations).set({ addressEnc: '', deletedAt: now }).where(and(eq(taskLocations.ownerUserId, userId), isNull(taskLocations.deletedAt)));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    await tx.delete(savedHelpers).where(or(eq(savedHelpers.userId, userId), eq(savedHelpers.helperUserId, userId)));
    await tx.delete(taskMarks).where(eq(taskMarks.userId, userId));
    await tx.delete(blocks).where(eq(blocks.blockerId, userId));
    await tx.update(threadParticipants).set({ muted: true }).where(eq(threadParticipants.userId, userId));
    await tx.update(paymentMethods).set({ detachedAt: now, isDefault: false }).where(and(eq(paymentMethods.userId, userId), isNull(paymentMethods.detachedAt)));
    await tx.update(availabilityPosts).set({ status: 'canceled', canceledAt: now, updatedAt: now }).where(and(eq(availabilityPosts.helperUserId, userId), ne(availabilityPosts.status, 'canceled')));
    // No trust badges on a deleted account's card where others still see it (a past booking, privacy rehearsal J-PR16):
    // the verification rows keep their statuses and dates as records.
    await tx.update(helperProfiles).set({ handle: `deleted-${userId}`, headline: '', bio: '', tools: [], homeZip: null, idVerifiedAt: null, backgroundCheckedAt: null, addressVerifiedAt: null, status: 'paused', updatedAt: now.toISOString() }).where(eq(helperProfiles.userId, userId));
    await tx.delete(userBadges).where(eq(userBadges.userId, userId));
    await tx.update(helperServices).set({ status: 'paused', description: '' }).where(eq(helperServices.userId, userId));
    await tx.delete(helperWorkSamples).where(eq(helperWorkSamples.userId, userId));
    // Part 7: what they kept goes; what they wrote in the community and on tasks comes down (rows stay for
    // reports and staff, as messages do); their reactions go, and the counts on what they reacted to follow.
    await tx.delete(savedSearches).where(eq(savedSearches.userId, userId));
    await tx.delete(savedReplies).where(eq(savedReplies.userId, userId));
    await tx.delete(messageReactions).where(eq(messageReactions.userId, userId));
    await tx.update(communityPosts).set({ status: 'removed', moderationReason: 'account_deleted', moderatedAt: now, updatedAt: now }).where(and(eq(communityPosts.authorUserId, userId), ne(communityPosts.status, 'removed')));
    // What they followed and the cards they closed go (plan 10); their community photos go with their files below.
    await tx.delete(communityFollows).where(eq(communityFollows.userId, userId));
    await tx.delete(communityAnnouncementDismissals).where(eq(communityAnnouncementDismissals.userId, userId));
    const takenDown = await tx
      .update(communityReplies)
      .set({ status: 'removed', moderationReason: 'account_deleted', moderatedAt: now, updatedAt: now })
      .where(and(eq(communityReplies.authorUserId, userId), ne(communityReplies.status, 'removed')))
      .returning({ id: communityReplies.id, postId: communityReplies.postId });
    // The posts they replied on count only visible replies (sweep P8), as when an author or staff takes one down, and
    // a pinned answer of theirs is unpinned.
    const repliedOn = [...new Set(takenDown.map((reply) => reply.postId))];
    if (repliedOn.length) {
      await tx
        .update(communityPosts)
        .set({ replyCount: sql`(select count(*) from ${communityReplies} r where r.post_id = ${communityPosts.id} and r.status = 'visible')` })
        .where(inArray(communityPosts.id, repliedOn));
      await tx.update(communityPosts).set({ pinnedReplyId: null }).where(inArray(communityPosts.pinnedReplyId, takenDown.map((reply) => reply.id)));
    }
    await tx.update(taskQuestions).set({ status: 'removed', moderationReason: 'account_deleted', moderatedAt: now, updatedAt: now }).where(and(eq(taskQuestions.askerUserId, userId), ne(taskQuestions.status, 'removed')));
    const reacted = await tx.delete(communityReactions).where(eq(communityReactions.userId, userId)).returning({ targetKind: communityReactions.targetKind, targetId: communityReactions.targetId });
    for (const kind of ['post', 'reply'] as const) {
      const ids = [...new Set(reacted.filter((row) => row.targetKind === kind).map((row) => row.targetId))];
      if (ids.length === 0) continue;
      const table = kind === 'post' ? communityPosts : communityReplies;
      await tx.update(table).set({
        thanksCount: sql`(select count(*) from ${communityReactions} r where r.target_kind = ${kind} and r.target_id = ${table.id} and r.kind = 'thanks')`,
        helpfulCount: sql`(select count(*) from ${communityReactions} r where r.target_kind = ${kind} and r.target_id = ${table.id} and r.kind = 'helpful')`,
      }).where(inArray(table.id, ids));
    }
    if (photoFiles.length) {
      // A task's photos are linked to it with no cascade (J-PR3); a community photo's link goes with its file (cascade).
      await tx.delete(taskPhotos).where(inArray(taskPhotos.fileId, photoFiles.map((file) => file.id)));
      await tx.delete(files).where(inArray(files.id, photoFiles.map((file) => file.id)));
    }
    // What they wrote on tasks nobody booked serves nobody now: the description goes, and the search text with it (it's
    // generated from the title and description). The title stays for the offers helpers made; a booked task keeps its
    // text as its booking's record (J-PR6).
    await tx
      .update(tasks)
      .set({ description: '', updatedAt: now })
      .where(and(eq(tasks.posterUserId, userId), ne(tasks.description, ''), sql`not exists (select 1 from ${bookings} b where b.task_id = ${tasks.id})`));
    // The waitlist entry with their address goes too (J-PR13).
    await tx.delete(waitlistEntries).where(eq(sql`lower(${waitlistEntries.email})`, user.email.toLowerCase()));
    // Their audit rows keep ids and what happened, not their contact details (ab, 2026-11-21, J-PR13): an email change's
    // addresses, a "Not you?" report's, a passkey's name and the IP addresses go. A banned account's stay, for the
    // investigations its ban may need, as its ID hash does.
    if (user.status !== 'banned') {
      await tx
        .update(auditLog)
        .set({ metadata: sql`${auditLog.metadata} - array['previousEmail', 'newEmail', 'name']::text[]`, ip: null })
        .where(and(eq(auditLog.targetType, 'user'), eq(auditLog.targetId, userId)));
      await tx
        .update(auditLog)
        .set({ metadata: sql`${auditLog.metadata} - array['from', 'to']::text[]` })
        .where(and(eq(auditLog.targetType, 'user'), eq(auditLog.targetId, userId), sql`${auditLog.metadata} ->> 'kind' = 'email'`));
    }
    // A verified home address with no booking behind it serves no claim: it goes now (J-PR12). A banned account's stays.
    if (!booked && user.status !== 'banned') await tx.update(addressVerifications).set({ addressCiphertext: null, updatedAt: now }).where(eq(addressVerifications.userId, userId));
    // `banned` tells the retention sweep to leave a banned account's address, as its ID hash is left.
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: null, actorRole: 'system', action: 'account.deleted', targetType: 'user', targetId: userId, metadata: { at: now.toISOString(), ...(user.status === 'banned' ? { banned: true } : {}) } });
  });

  await expireCacheTags(db, ['tasks', 'helpers', ...(profile ? [`helper:${profile.handle}`] : []), ...(market ? [`market:${market.slug}`] : [])]);
  // The verification timers are this step's backstop: they delete a deleted account's documents too.
  await deleteVerificationDocuments(db, deps.storage, userId, now, { keepIdHash: user.status === 'banned' });

  if (!isReservedEmailAddress(user.email) || devHelpersOn()) {
    const email = renderAccountDeletedNotice({ appUrl: deps.appUrl, locale: localeOrDefault(user.locale) });
    try {
      await deps.email.send({ to: user.email, subject: email.subject, text: email.text, html: email.html, tag: 'account-deleted', idempotencyKey: `account-deleted-${userId}` });
    } catch (error) {
      console.error('[privacy] the goodbye email failed', error instanceof Error ? error.message : error);
    }
  }
}

/**
 * A deleted account's verification documents go at once (blueprint 08 §5): the proofs of address and our
 * own ID check's photos. A proof or photos still waiting for staff are withdrawn first, so they leave the
 * queues. The rows keep their statuses and dates; the verification timers stay as the backstop. The ID's
 * keyed hash (plan 6.3) goes too, unless the account was banned: then a new account with the same ID is
 * still flagged for our team.
 */
async function deleteVerificationDocuments(db: Db, storage: FileStorage, userId: string, now: Date, options: { keepIdHash: boolean }): Promise<void> {
  if (!options.keepIdHash) await db.update(identityCaptures).set({ documentHash: null }).where(eq(identityCaptures.userId, userId));
  await db.update(addressVerifications).set({ status: 'withdrawn', updatedAt: now }).where(and(eq(addressVerifications.userId, userId), eq(addressVerifications.status, 'in_review')));
  const proofs = await db.select({ id: addressVerifications.id }).from(addressVerifications).where(and(eq(addressVerifications.userId, userId), isNotNull(addressVerifications.documentFileId)));
  for (const proof of proofs) {
    if (await deleteAddressDocument({ db, storage }, proof.id, now)) {
      await db.insert(auditLog).values({ id: newId('aud'), actorRole: 'system', action: 'address_proof.deleted', targetType: 'user', targetId: userId, metadata: { verificationId: proof.id, after: 'account_deleted' } });
    }
  }
  await db.update(identityCaptures).set({ status: 'canceled', decidedAt: now, updatedAt: now }).where(and(eq(identityCaptures.userId, userId), eq(identityCaptures.status, 'submitted')));
  const captures = await db.select({ id: identityCaptures.id, status: identityCaptures.status }).from(identityCaptures).where(and(eq(identityCaptures.userId, userId), isNull(identityCaptures.filesDeletedAt)));
  for (const capture of captures) {
    if (await deleteIdentityCapturePhotos({ db, storage }, capture.id, now)) {
      await db.insert(auditLog).values({ id: newId('aud'), actorRole: 'system', action: 'identity_capture.deleted', targetType: 'user', targetId: userId, metadata: { captureId: capture.id, status: capture.status, after: 'account_deleted' } });
    }
  }
}

/** Everything the privacy job does in one run. */
export async function runPrivacyRequests(db: Db, deps: PrivacyJobDeps, now: Date): Promise<void> {
  await prepareDueExports(db, deps, now);
  await expireDueExports(db, deps, now);
  await processDueDeletions(db, deps, now);
}
