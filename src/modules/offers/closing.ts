import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import type { outboxEvents } from '@/platform/outbox/schema';
import { offers } from './schema';

/** What the rule needs of an offer row. */
type ClosedOffer = { id: string; taskId: string; status: string; closedAt: Date | null };

/**
 * The offers their task's cancellation declined (sweep D9): `declined`, on a task now canceled, unless another offer on
 * that task was accepted at the very same moment. Canceling an open task (offers/owner.ts cancelTask, or staff's
 * close_task) declines the offers still in play; booking an offer declines the rest in the same step, so an offer
 * declined at the moment another was accepted lost to it, and keeps saying so if the task is canceled later. One the
 * client declined before canceling counts as canceled too: nobody was chosen. Messages, the offer page and My offers
 * all say "the task was canceled" for these, never "declined" or "not selected".
 *
 * `taskStatus`: each offer's task status, by task id.
 */
export async function declinedByCancel(db: Pick<Db, 'select'>, rows: readonly ClosedOffer[], taskStatus: (taskId: string) => string | undefined): Promise<Set<string>> {
  const candidates = rows.filter((row) => row.status === 'declined' && taskStatus(row.taskId) === 'canceled');
  if (candidates.length === 0) return new Set();
  const taskIds = [...new Set(candidates.map((row) => row.taskId))];
  const accepted = await db
    .select({ taskId: offers.taskId, closedAt: offers.closedAt })
    .from(offers)
    .where(and(inArray(offers.taskId, taskIds), eq(offers.status, 'accepted')));
  const choices = new Set(accepted.flatMap((row) => (row.closedAt ? [`${row.taskId}@${row.closedAt.getTime()}`] : [])));
  return new Set(candidates.filter((row) => !(row.closedAt && choices.has(`${row.taskId}@${row.closedAt.getTime()}`))).map((row) => row.id));
}

/**
 * The outbox events for the offers a task's cancellation just declined (cancelTask, staff's close_task): one
 * `offer.declined` per offer with reason `task_canceled`, so each helper whose offer was still open hears the task was
 * canceled, once (notifications: `task_canceled`). Offers that had closed before aren't in `declined`.
 */
export function declinedForCancel(taskId: string, declined: readonly { id: string; helperUserId: string }[]): (typeof outboxEvents.$inferInsert)[] {
  return declined.map((offer) => ({
    id: newId('evt'),
    type: 'offer.declined',
    aggregateType: 'offer',
    aggregateId: offer.id,
    payload: { offerId: offer.id, taskId, helperUserId: offer.helperUserId, reason: 'task_canceled' },
  }));
}
