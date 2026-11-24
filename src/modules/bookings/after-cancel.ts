import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { ActionResult } from '@/contracts';
import { routes } from '@/contracts';
import { markets } from '@/modules/markets/schema';
import { offers } from '@/modules/offers/schema';
import { markCaseRead } from '@/modules/support/service';
import { supportCases } from '@/modules/support/schema';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import type { BookingFacts } from './domain';
import type { bookings } from './schema';

/**
 * After a cancellation (blueprint 03 §4, blueprint 02 §4): the client reopens the task to find a
 * replacement, and the person reported as a no-show contests it (a support case).
 */

type BookingRow = typeof bookings.$inferSelect;

/** The facts the canceled-booking actions need: the task as it is now and an earlier contest. */
export async function canceledFacts(db: Db, booking: BookingRow, userId: string): Promise<Partial<BookingFacts>> {
  if (booking.status !== 'canceled') return {};
  const [[task], [contest]] = await Promise.all([
    db.select({ status: tasks.status, windowEnd: tasks.windowEnd, hiddenAt: tasks.hiddenAt, reopenedAt: tasks.reopenedAt, teamPartOf: tasks.teamPartOf }).from(tasks).where(eq(tasks.id, booking.taskId)).limit(1),
    contestOf(db, booking.id, userId),
  ]);
  return {
    cancelReason: booking.cancelReason,
    canceledAt: booking.canceledAt,
    ...(task ? { task: { status: task.status, windowEnd: task.windowEnd, hidden: task.hiddenAt !== null || task.teamPartOf !== null, reopened: task.reopenedAt !== null && booking.canceledAt !== null && task.reopenedAt >= booking.canceledAt } } : {}),
    contested: Boolean(contest),
  };
}

function contestOf(db: Pick<Db, 'select'>, bookingId: string, userId: string) {
  return db
    .select({ id: supportCases.id })
    .from(supportCases)
    .where(and(eq(supportCases.bookingId, bookingId), eq(supportCases.type, 'no_show'), eq(supportCases.openedByUserId, userId)))
    .limit(1);
}

/** The task a replacement search reopened, for refreshing the pages that list it. */
export interface ReopenedTask {
  id: string;
  slug: string;
  marketSlug?: string;
}

/**
 * **Find a replacement**: the task is open again with no offers (`reopenedAt`: earlier offers stay with the
 * canceled booking). Earlier offerers (not the helper who canceled) hear about it. Only the client, only
 * while the window is ahead.
 */
export async function reopenForReplacement(db: Db, userId: string, booking: BookingRow, now: Date, options: { automatic?: boolean } = {}): Promise<{ result: ActionResult; task?: ReopenedTask }> {
  const reopened = await db.transaction(async (tx) => {
    const [task] = await tx
      .update(tasks)
      .set({ status: 'open', offerCount: 0, reopenedAt: now, updatedAt: now, version: sql`${tasks.version} + 1` })
      // A team job's partner part (2026-11-24) is never reopened: the lead invites someone else instead.
      .where(and(eq(tasks.id, booking.taskId), eq(tasks.posterUserId, userId), eq(tasks.status, 'canceled'), gt(tasks.windowEnd, now), isNull(tasks.teamPartOf)))
      .returning({ id: tasks.id, slug: tasks.slug, marketId: tasks.marketId });
    if (!task) return null;
    const earlier = await tx
      .selectDistinct({ helperUserId: offers.helperUserId })
      .from(offers)
      .where(and(eq(offers.taskId, task.id), ne(offers.helperUserId, booking.helperUserId)));
    await tx.insert(outboxEvents).values({
      id: newId('evt'),
      type: 'task.reopened',
      aggregateType: 'task',
      aggregateId: task.id,
      payload: {
        taskId: task.id,
        bookingId: booking.id,
        posterUserId: userId,
        canceledHelperUserId: booking.helperUserId,
        helperUserIds: earlier.map((row) => row.helperUserId),
        ...(options.automatic ? { automatic: true } : {}),
      },
    });
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: options.automatic ? 'system' : userId, actorRole: options.automatic ? 'system' : 'user', action: 'task.reopened', targetType: 'task', targetId: task.id, reason: options.automatic ? 'replacement_automatic' : 'find_replacement' });
    const [market] = await tx.select({ slug: markets.slug }).from(markets).where(eq(markets.id, task.marketId)).limit(1);
    return { id: task.id, slug: task.slug, ...(market ? { marketSlug: market.slug } : {}) };
  });
  if (!reopened) return { result: { ok: false, code: 'version_conflict' } };
  return { result: { ok: true, code: 'updated', redirectTo: routes.app.task(reopened.id) }, task: reopened };
}

/** Automated replacement matching needs this much time before the start for someone new to come. */
export const AUTO_REPLACEMENT_LEAD_MS = 3 * 3_600_000;

/**
 * Automated replacement matching (blueprint 01 P2): when the helper cancels with at least 3 hours to spare, the
 * client's task opens for offers again on its own (they were refunded in full and can still cancel the task), the
 * earlier offerers hear it, and so do the most reliable helpers it suits. Not for a visit of regular visits.
 */
export async function reopenAfterHelperCancel(db: Db, booking: BookingRow, now: Date): Promise<void> {
  if (booking.seriesId || booking.startAt.getTime() - now.getTime() < AUTO_REPLACEMENT_LEAD_MS) return;
  await reopenForReplacement(db, booking.posterUserId, booking, now, { automatic: true });
}

/**
 * **Contest no-show report**: a high-priority no-show case for support, opened by the person reported,
 * with `opening` as their first message. Tapping again goes to the same case.
 */
export async function contestNoShow(db: Db, userId: string, booking: BookingRow, opening: string, now: Date): Promise<ActionResult> {
  const caseId = await db.transaction(async (tx) => {
    // One contest per person and booking, even when tapped twice at once.
    await tx.execute(sql`select id from bookings where id = ${booking.id} for update`);
    const [existing] = await contestOf(tx, booking.id, userId);
    if (existing) return existing.id;
    const id = newId('case');
    await tx.insert(supportCases).values({
      id,
      type: 'no_show',
      status: 'open',
      priority: 'high',
      bookingId: booking.id,
      openedByUserId: userId,
      reason: booking.cancelReason ?? 'no_show',
      description: opening,
      createdAt: now,
      updatedAt: now,
    });
    await markCaseRead(tx, id, userId, now);
    await tx.insert(outboxEvents).values({
      id: newId('evt'),
      type: 'support.case_opened',
      aggregateType: 'support_case',
      aggregateId: id,
      payload: { caseId: id, type: 'no_show', openedByUserId: userId, bookingId: booking.id },
    });
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: userId, actorRole: 'user', action: 'booking.no_show_contested', targetType: 'booking', targetId: booking.id, reason: booking.cancelReason });
    return id;
  });
  return { ok: true, code: 'submitted', redirectTo: routes.app.supportCase(caseId) };
}
