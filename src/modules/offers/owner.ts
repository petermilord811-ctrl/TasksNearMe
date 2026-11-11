import { and, asc, count, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import type {
  ActionResult,
  ExactAddress,
  MyTasksPageData,
  OfferDetailPageData,
  OfferStatus,
  OfferView,
  OwnerTaskRow,
  PricingInput,
  TaskCancelReason,
  TaskOwnerView,
} from '@/contracts';
import { bookings } from '@/modules/bookings/schema';
import { photoFromFile } from '@/modules/files/uploads';
import { categories, type FeeSchedule } from '@/modules/markets/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { budgetOf } from '@/modules/tasks/projections';
import { findTaskWithPublicView } from '@/modules/tasks/queries';
import { files, taskLocations, taskPhotos, tasks } from '@/modules/tasks/schema';
import { blockedPeopleOf, isBlockedBetween } from '@/modules/trust/blocks';
import { toMessageSegments } from '@/modules/trust/message-segments';
import { auditLog } from '@/platform/audit/schema';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { offerSortKey, posterOfferActions, taskOwnerActions } from './domain';
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
  const unseen = ids.length
    ? await db
        .select({ taskId: offers.taskId, value: count() })
        .from(offers)
        .where(and(inArray(offers.taskId, ids), inArray(offers.status, ACTIVE), isNull(offers.posterSeenAt)))
        .groupBy(offers.taskId)
    : [];
  const unseenByTask = new Map(unseen.map((row) => [row.taskId, row.value]));
  const bookingByTask = await bookingIdsOf(db, ids);
  const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const slugOf = new Map(categoryRows.map((row) => [row.id, row.slug]));

  const toRow = (row: (typeof visible)[number]): OwnerTaskRow => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    categorySlug: slugOf.get(row.categoryId) as OwnerTaskRow['categorySlug'],
    status: (row.status === 'open' && row.windowEnd <= now ? 'expired' : row.status) as OwnerTaskRow['status'],
    schedule: { windowStart: row.windowStart.toISOString(), windowEnd: row.windowEnd.toISOString(), flexible: row.flexible },
    budget: budgetOf(row),
    offerCount: row.offerCount,
    newOfferCount: unseenByTask.get(row.id) ?? 0,
    postedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    ...(bookingByTask.has(row.id) ? { bookingId: bookingByTask.get(row.id)! } : {}),
  });
  const all = visible.map(toRow);
  return {
    open: all.filter((row) => row.status === 'open'),
    booked: all.filter((row) => row.status === 'assigned').sort((a, b) => a.schedule.windowStart.localeCompare(b.schedule.windowStart)),
    past: all.filter((row) => row.status === 'completed' || row.status === 'canceled' || row.status === 'expired'),
  };
}

async function offerViews(deps: OwnerDeps, task: typeof tasks.$inferSelect, rows: OfferRow[], now: Date): Promise<OfferView[]> {
  const helpers = await getHelperSummaries(
    rows.map((row) => row.helperUserId),
    deps.db,
  );
  const masked = task.status !== 'assigned' && task.status !== 'completed';
  return rows
    .filter((row) => helpers.has(row.helperUserId))
    .sort((a, b) => offerSortKey(a.status) - offerSortKey(b.status) || b.createdAt.getTime() - a.createdAt.getTime())
    .map((row) => {
      const pricing = offerPricing(row);
      return {
        id: row.id,
        taskId: row.taskId,
        helper: helpers.get(row.helperUserId)!,
        status: row.status as OfferStatus,
        pricing,
        proposedStart: row.proposedStart.toISOString(),
        message: toMessageSegments(row.message, { mask: masked }),
        brings: row.brings,
        expiresAt: row.expiresAt.toISOString(),
        revision: row.revision,
        submittedAt: row.updatedAt.toISOString(),
        isNew: row.posterSeenAt === null && ACTIVE.includes(row.status as OfferStatus),
        breakdown: quoteBreakdown(deps.fees, pricing, { expenseAllowanceCents: task.expenseAllowanceCents }),
        actions: posterOfferActions(row, task, now),
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
  const offerRows = allOffers.filter((offer) => !blocked.includes(offer.helperUserId));
  const exactAddress = location[0] ? (JSON.parse(deps.cipher.decrypt(location[0].addressEnc)) as ExactAddress) : undefined;
  const bookingId = (await bookingIdsOf(deps.db, [taskId])).get(taskId);

  return {
    task: found.view,
    description: task.description,
    details: task.details,
    photos: photoRows.map(({ file }) => photoFromFile(file)),
    ...(exactAddress ? { exactAddress } : {}),
    ...(task.expenseAllowanceCents > 0
      ? { expenseAllowance: { amountCents: task.expenseAllowanceCents, description: task.expenseAllowanceNote ?? '' } }
      : {}),
    offers: await offerViews(deps, task, offerRows, now),
    actions: taskOwnerActions(task),
    ...(bookingId ? { bookingId } : {}),
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
  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ status: 'canceled', offerCount: 0, updatedAt: now, version: task.version + 1 }).where(eq(tasks.id, taskId));
    await tx
      .update(offers)
      .set({ status: 'declined', closedAt: now, updatedAt: now })
      .where(and(eq(offers.taskId, taskId), inArray(offers.status, ACTIVE)));
    await tx.insert(outboxEvents).values({
      id: newId('evt'),
      type: 'task.canceled',
      aggregateType: 'task',
      aggregateId: taskId,
      payload: { taskId, reason },
    });
    await tx.insert(auditLog).values({
      id: newId('aud'),
      actorId: userId,
      actorRole: 'user',
      action: 'task.canceled',
      targetType: 'task',
      targetId: taskId,
      reason,
    });
  });
  return { ok: true, code: 'canceled' };
}
