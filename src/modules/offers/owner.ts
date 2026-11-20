import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, ne, notInArray } from 'drizzle-orm';
import type {
  ActionResult,
  BookingStatus,
  MyTasksPageData,
  OfferDetailPageData,
  OfferStatus,
  OfferView,
  OwnerTaskRow,
  PricingInput,
  TaskCancelReason,
  TaskOwnerView,
} from '@/contracts';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { photoFromFile } from '@/modules/files/uploads';
import { categories, type FeeSchedule } from '@/modules/markets/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { isReliable, reliabilityFacts } from '@/modules/profiles/reliability';
import { pushSetup } from '@/modules/notifications/push';
import { readExactAddress } from '@/modules/tasks/locations';
import { budgetOf } from '@/modules/tasks/projections';
import { findTaskWithPublicView } from '@/modules/tasks/queries';
import { files, taskLocations, taskPhotos, tasks } from '@/modules/tasks/schema';
import { blockedPeopleOf, isBlockedBetween } from '@/modules/trust/blocks';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import { toMessageSegments } from '@/modules/trust/message-segments';
import { auditLog } from '@/platform/audit/schema';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { declinedByCancel, declinedForCancel } from './closing';
import { byAttention, offerSortKey, ownerTaskAttention, posterOfferActions, taskOwnerActions } from './domain';
import { offers } from './schema';

/** The poster's side of tasks and offers: reads projected for the poster, and their changes. */

const ACTIVE: OfferStatus[] = ['pending', 'stale'];
type OfferRow = typeof offers.$inferSelect;

export function offerPricing(row: Pick<OfferRow, 'pricingType' | 'priceCents' | 'hourlyRateCents' | 'estimatedHours' | 'hoursCap'>): PricingInput {
  return row.pricingType === 'hourly'
    ? { type: 'hourly', rateCents: row.hourlyRateCents ?? 0, estimatedHours: row.estimatedHours ?? row.hoursCap ?? 0, hoursCap: row.hoursCap ?? 0 }
    : { type: 'fixed', priceCents: row.priceCents ?? 0 };
}

export interface OwnerDeps {
  db: Db;
  cipher: FieldCipher;
  /** The market's published fee schedule: what the poster would pay if they booked now. */
  fees: FeeSchedule;
}

/** The offers among `offerIds` whose booking was paid (confirmed at some point, even if canceled since). */
async function paidOffers(db: Db, offerIds: string[]): Promise<Set<string>> {
  if (offerIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ offerId: bookings.offerId })
    .from(bookings)
    .where(and(inArray(bookings.offerId, offerIds), isNotNull(bookings.confirmedAt)));
  return new Set(rows.flatMap((row) => (row.offerId ? [row.offerId] : [])));
}

/** The booking behind each booked task (confirmed or later; a hold waiting for payment doesn't count). */
async function bookingIdsOf(db: Db, taskIds: string[]): Promise<Map<string, string>> {
  if (taskIds.length === 0) return new Map();
  const rows = await db
    .select({ id: bookings.id, taskId: bookings.taskId })
    .from(bookings)
    .where(and(inArray(bookings.taskId, taskIds), notInArray(bookings.status, ['canceled', 'pending_funding'])));
  return new Map(rows.map((row) => [row.taskId, row.id]));
}

async function ownedTask(db: Db, userId: string, taskId: string) {
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.posterUserId, userId))).limit(1);
  return task ?? null;
}

export async function getMyTasks(db: Db, userId: string, now: Date): Promise<MyTasksPageData> {
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.posterUserId, userId))
    .orderBy(desc(tasks.createdAt));
  const visible = rows.filter((row) => row.status !== 'draft');
  const ids = visible.map((row) => row.id);
  // Open offers, newest first: their count, the unopened ones, and the newest one per task. The ones the task page
  // lists: not expired, not from someone either side blocked, and none from before Find a replacement reopened it.
  const blocked = ids.length ? await blockedPeopleOf(db, userId) : [];
  const openOffers = ids.length
    ? await db
        .select({
          id: offers.id,
          taskId: offers.taskId,
          helperUserId: offers.helperUserId,
          posterSeenAt: offers.posterSeenAt,
          createdAt: offers.createdAt,
          updatedAt: offers.updatedAt,
          expiresAt: offers.expiresAt,
          pricingType: offers.pricingType,
          priceCents: offers.priceCents,
          hourlyRateCents: offers.hourlyRateCents,
          estimatedHours: offers.estimatedHours,
          hoursCap: offers.hoursCap,
        })
        .from(offers)
        .where(and(inArray(offers.taskId, ids), inArray(offers.status, ACTIVE), gt(offers.expiresAt, now), ...(blocked.length ? [notInArray(offers.helperUserId, blocked)] : [])))
        .orderBy(desc(offers.updatedAt))
    : [];
  const reopenedAtOf = new Map(visible.map((row) => [row.id, row.reopenedAt]));
  const offersByTask = new Map<string, typeof openOffers>();
  for (const offer of openOffers) {
    const reopenedAt = reopenedAtOf.get(offer.taskId);
    if (reopenedAt && offer.createdAt < reopenedAt) continue;
    offersByTask.set(offer.taskId, [...(offersByTask.get(offer.taskId) ?? []), offer]);
  }
  // Each task's booking (the latest that isn't canceled), with its current terms' start.
  const bookingRows = ids.length
    ? await db
        .select({
          id: bookings.id,
          taskId: bookings.taskId,
          status: bookings.status,
          helperUserId: bookings.helperUserId,
          fundingExpiresAt: bookings.fundingExpiresAt,
          fundingFailure: bookings.fundingFailure,
          approvalDueAt: bookings.approvalDueAt,
          start: bookingTerms.startAt,
        })
        .from(bookings)
        .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
        .where(and(inArray(bookings.taskId, ids), ne(bookings.status, 'canceled')))
        .orderBy(desc(bookings.createdAt))
    : [];
  const bookingOf = new Map<string, (typeof bookingRows)[number]>();
  for (const booking of bookingRows) if (!bookingOf.has(booking.taskId)) bookingOf.set(booking.taskId, booking);
  const helpers = await getHelperSummaries([...new Set([...openOffers.map((offer) => offer.helperUserId), ...bookingRows.map((booking) => booking.helperUserId)])], db);
  const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const slugOf = new Map(categoryRows.map((row) => [row.id, row.slug]));

  const toRow = (row: (typeof visible)[number]): OwnerTaskRow => {
    const status = (row.status === 'open' && row.windowEnd <= now ? 'expired' : row.status) as OwnerTaskRow['status'];
    const taskOffers = offersByTask.get(row.id) ?? [];
    const newOfferCount = taskOffers.filter((offer) => offer.posterSeenAt === null).length;
    const newest = taskOffers[0];
    const newestHelper = newest ? helpers.get(newest.helperUserId) : undefined;
    const booking = bookingOf.get(row.id);
    const bookingHelper = booking ? helpers.get(booking.helperUserId) : undefined;
    const offersExpireAt = taskOffers.reduce<Date | undefined>((latest, offer) => (!latest || offer.expiresAt > latest ? offer.expiresAt : latest), undefined);
    const attention = ownerTaskAttention(
      {
        status,
        windowStart: row.windowStart,
        windowEnd: row.windowEnd,
        // A day without offers counts from when it went up again after a canceled booking.
        postedAt: row.reopenedAt ?? row.publishedAt ?? row.createdAt,
        activeOfferCount: taskOffers.length,
        newOfferCount,
        ...(offersExpireAt ? { offersExpireAt } : {}),
        ...(booking ? { booking: { id: booking.id, status: booking.status, fundingExpiresAt: booking.fundingExpiresAt, fundingFailure: booking.fundingFailure, approvalDueAt: booking.approvalDueAt } } : {}),
      },
      now,
    );
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      categorySlug: slugOf.get(row.categoryId) as OwnerTaskRow['categorySlug'],
      status,
      schedule: { windowStart: row.windowStart.toISOString(), windowEnd: row.windowEnd.toISOString(), flexible: row.flexible },
      budget: budgetOf(row),
      offerCount: row.offerCount,
      newOfferCount,
      postedAt: (row.publishedAt ?? row.createdAt).toISOString(),
      // A hold waiting for payment isn't booked yet: the task still links to itself.
      ...(booking && booking.status !== 'pending_funding' ? { bookingId: booking.id } : {}),
      ...(status === 'open' && newest && newestHelper ? { newestOffer: { id: newest.id, helper: newestHelper, pricing: offerPricing(newest), submittedAt: newest.updatedAt.toISOString() } } : {}),
      ...(booking && bookingHelper
        ? {
            booking: {
              start: booking.start.toISOString(),
              helper: { id: bookingHelper.id, displayName: bookingHelper.displayName, initials: bookingHelper.initials, memberSince: bookingHelper.memberSince, phoneVerified: bookingHelper.phoneVerified, ...(bookingHelper.photo ? { photo: bookingHelper.photo } : {}) },
              status: booking.status as BookingStatus,
            },
          }
        : {}),
      ...(attention ? { attention } : {}),
    };
  };
  const all = visible.map(toRow);
  const startOf = (row: OwnerTaskRow) => row.booking?.start ?? row.schedule.windowStart;
  return {
    needsYou: all.filter((row) => row.attention).sort(byAttention),
    open: all.filter((row) => row.status === 'open'),
    booked: all.filter((row) => row.status === 'assigned').sort((a, b) => startOf(a).localeCompare(startOf(b))),
    past: all.filter((row) => row.status === 'completed' || row.status === 'canceled' || row.status === 'expired'),
  };
}

async function offerViews(deps: OwnerDeps, task: typeof tasks.$inferSelect, rows: OfferRow[], now: Date): Promise<OfferView[]> {
  const [helpers, facts, canceled, paid] = await Promise.all([
    getHelperSummaries(
      rows.map((row) => row.helperUserId),
      deps.db,
    ),
    // "Reliable" helps the client compare offers (blueprint 01 P2).
    reliabilityFacts(deps.db, rows.map((row) => row.helperUserId), now),
    // Declined by the task's cancellation, not by the client's choice (sweep D9).
    declinedByCancel(deps.db, rows, () => task.status),
    // Contact details in an offer show only once that helper's booking is paid (`confirmed_at`), as in their
    // conversation (messaging/service.ts). The task's status used to decide for every offer on it, so booking one
    // helper showed every other offerer's number under "Earlier offers", and a booking not paid yet (made more than
    // 14 days ahead) showed the booked one's (sweep MN2). What a helper brings is their own words too.
    paidOffers(deps.db, rows.map((row) => row.id)),
  ]);
  return rows
    .filter((row) => helpers.has(row.helperUserId))
    .sort((a, b) => offerSortKey(a.status) - offerSortKey(b.status) || b.createdAt.getTime() - a.createdAt.getTime())
    .map((row) => {
      const pricing = offerPricing(row);
      return {
        id: row.id,
        taskId: row.taskId,
        helper: isReliable(facts.get(row.helperUserId)!) ? { ...helpers.get(row.helperUserId)!, reliable: true } : helpers.get(row.helperUserId)!,
        status: row.status as OfferStatus,
        pricing,
        proposedStart: row.proposedStart.toISOString(),
        message: toMessageSegments(row.message, { mask: !paid.has(row.id) }),
        brings: paid.has(row.id) ? row.brings : row.brings.map((item) => maskContactDetails(item).text),
        expiresAt: row.expiresAt.toISOString(),
        revision: row.revision,
        submittedAt: row.updatedAt.toISOString(),
        isNew: row.posterSeenAt === null && ACTIVE.includes(row.status as OfferStatus),
        breakdown: quoteBreakdown(deps.fees, pricing, { expenseAllowanceCents: task.expenseAllowanceCents }),
        actions: posterOfferActions(row, task, now),
        ...(canceled.has(row.id) ? { taskCanceled: true } : {}),
      };
    });
}

export async function getTaskOwnerView(deps: OwnerDeps, userId: string, taskId: string, now: Date): Promise<TaskOwnerView | null> {
  const task = await ownedTask(deps.db, userId, taskId);
  if (!task || task.status === 'draft') return null;
  const found = await findTaskWithPublicView(deps.db, taskId);
  if (!found) return null;

  const [allOffers, photoRows, location, blocked] = await Promise.all([
    deps.db.select().from(offers).where(eq(offers.taskId, taskId)),
    deps.db
      .select({ file: files })
      .from(taskPhotos)
      .innerJoin(files, eq(files.id, taskPhotos.fileId))
      .where(eq(taskPhotos.taskId, taskId))
      .orderBy(asc(taskPhotos.position)),
    task.locationId ? deps.db.select().from(taskLocations).where(eq(taskLocations.id, task.locationId)).limit(1) : Promise.resolve([]),
    blockedPeopleOf(deps.db, userId),
  ]);
  // After Find a replacement, earlier offers belong to the canceled booking.
  const current = allOffers.filter((offer) => !task.reopenedAt || offer.createdAt >= task.reopenedAt);
  const offerRows = current.filter((offer) => !blocked.includes(offer.helperUserId));
  const exactAddress = readExactAddress(deps.cipher, location[0]?.addressEnc);
  const bookingId = (await bookingIdsOf(deps.db, [taskId])).get(taskId);
  const offerList = await offerViews(deps, task, offerRows, now);
  // Seeing the offers here counts as opening them, so "N new offers" clears on My tasks and the dashboard (sweep
  // 2026-11-18); this view still marks them new.
  const unseen = offerRows.filter((offer) => offer.posterSeenAt === null && ACTIVE.includes(offer.status as OfferStatus)).map((offer) => offer.id);
  if (unseen.length > 0) await deps.db.update(offers).set({ posterSeenAt: now }).where(and(inArray(offers.id, unseen), isNull(offers.posterSeenAt)));

  return {
    task: found.view,
    description: task.description,
    details: task.details,
    photos: photoRows.map(({ file }) => photoFromFile(file)),
    ...(exactAddress ? { exactAddress } : {}),
    ...(task.expenseAllowanceCents > 0
      ? { expenseAllowance: { amountCents: task.expenseAllowanceCents, description: task.expenseAllowanceNote ?? '' } }
      : {}),
    offers: offerList,
    actions: taskOwnerActions(task),
    ...(bookingId ? { bookingId } : {}),
    ...(task.status === 'open' && pushSetup() ? { push: pushSetup()! } : {}),
  };
}

/** One offer in full. Opening it marks it seen. */
export async function getOfferDetail(
  deps: OwnerDeps,
  userId: string,
  taskId: string,
  offerId: string,
  now: Date,
): Promise<OfferDetailPageData | null> {
  const task = await ownedTask(deps.db, userId, taskId);
  if (!task) return null;
  const [row] = await deps.db.select().from(offers).where(and(eq(offers.id, offerId), eq(offers.taskId, taskId))).limit(1);
  const found = await findTaskWithPublicView(deps.db, taskId);
  if (!row || !found) return null;
  if (await isBlockedBetween(deps.db, userId, row.helperUserId)) return null;
  const [offer] = await offerViews(deps, task, [row], now);
  if (!offer) return null;
  if (row.posterSeenAt === null) {
    await deps.db.update(offers).set({ posterSeenAt: now }).where(eq(offers.id, offerId));
  }
  const [others] = await deps.db
    .select({ value: count() })
    .from(offers)
    .where(and(eq(offers.taskId, taskId), inArray(offers.status, ACTIVE)));
  const { id, title, categorySlug, schedule, location, budget } = found.view;
  return {
    task: { id, title, categorySlug, schedule, location, budget },
    offer,
    otherPendingOffers: Math.max(0, (others?.value ?? 0) - (ACTIVE.includes(row.status as OfferStatus) ? 1 : 0)),
  };
}

/** Recomputes the public offer count from the offers still in play. */
async function refreshOfferCount(db: Db, taskId: string): Promise<void> {
  const [active] = await db
    .select({ value: count() })
    .from(offers)
    .where(and(eq(offers.taskId, taskId), inArray(offers.status, ACTIVE)));
  await db.update(tasks).set({ offerCount: active?.value ?? 0 }).where(eq(tasks.id, taskId));
}

export async function declineOffer(db: Db, userId: string, offerId: string, now: Date): Promise<ActionResult> {
  const [row] = await db
    .select({ offer: offers, posterUserId: tasks.posterUserId })
    .from(offers)
    .innerJoin(tasks, eq(tasks.id, offers.taskId))
    .where(eq(offers.id, offerId))
    .limit(1);
  if (!row || row.posterUserId !== userId) return { ok: false, code: 'not_found' };
  if (!ACTIVE.includes(row.offer.status as OfferStatus)) return { ok: false, code: 'version_conflict' };
  await db.transaction(async (tx) => {
    await tx.update(offers).set({ status: 'declined', closedAt: now, updatedAt: now }).where(eq(offers.id, offerId));
    await tx.insert(outboxEvents).values({
      id: newId('evt'),
      type: 'offer.declined',
      aggregateType: 'offer',
      aggregateId: offerId,
      payload: { offerId, taskId: row.offer.taskId, helperUserId: row.offer.helperUserId },
    });
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: userId, actorRole: 'user', action: 'offer.declined', targetType: 'offer', targetId: offerId });
  });
  await refreshOfferCount(db, row.offer.taskId);
  return { ok: true, code: 'updated' };
}

/** The poster cancels an open task: the offers still in play are declined. */
export async function cancelTask(db: Db, userId: string, taskId: string, reason: TaskCancelReason, now: Date): Promise<ActionResult> {
  const task = await ownedTask(db, userId, taskId);
  if (!task) return { ok: false, code: 'not_found' };
  if (task.status !== 'open') return { ok: false, code: 'not_allowed' };
  // Not while a booking's payment is under way (the bank step): it could still confirm and book the task (sweep PT7).
  const [funding] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.taskId, taskId), eq(bookings.status, 'pending_funding'))).limit(1);
  if (funding) return { ok: false, code: 'not_allowed' };
  const canceled = await db.transaction(async (tx) => {
    // Only from open: a booking that confirmed meanwhile keeps its task (sweep PT7; settle() checks the other way).
    const [row] = await tx
      .update(tasks)
      .set({ status: 'canceled', offerCount: 0, updatedAt: now, version: task.version + 1 })
      .where(and(eq(tasks.id, taskId), eq(tasks.status, 'open')))
      .returning({ id: tasks.id });
    if (!row) return false;
    const declined = await tx
      .update(offers)
      .set({ status: 'declined', closedAt: now, updatedAt: now })
      .where(and(eq(offers.taskId, taskId), inArray(offers.status, ACTIVE)))
      .returning({ id: offers.id, helperUserId: offers.helperUserId });
    await tx.insert(outboxEvents).values([
      { id: newId('evt'), type: 'task.canceled', aggregateType: 'task', aggregateId: taskId, payload: { taskId, reason } },
      // Each helper whose offer was still open hears the task was canceled, once (an offer closed before isn't told).
      ...declinedForCancel(taskId, declined),
    ]);
    await tx.insert(auditLog).values({
      id: newId('aud'),
      actorId: userId,
      actorRole: 'user',
      action: 'task.canceled',
      targetType: 'task',
      targetId: taskId,
      reason,
    });
    return true;
  });
  return canceled ? { ok: true, code: 'canceled' } : { ok: false, code: 'not_allowed' };
}
