import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { bookings } from '@/modules/bookings/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { isSampleId } from '@/shared/sample-data';
import { tasks } from './schema';

/** A poster hears about a task that just ended unbooked, not one that ended long ago (the job's first run). */
const NOTICE_WINDOW_MS = 24 * 3_600_000;

/**
 * The job (sweep 2026-11-20, PT6): an open task whose window has ended with nobody booked becomes `expired`. Pages
 * already read such a task as expired; now the row says so too, so the poster's page offers Post again instead of
 * Invite and Cancel, it leaves invite pickers, and retention deletes its exact address on the usual timer
 * (src/modules/privacy/retention.ts keeps it while a case, a booking or a proposal still needs it). A task with a
 * booking that isn't canceled, its bank step under way included, follows the booking instead.
 * The poster hears it once ("post it again?"), for a task that ended within the last day, and never for sample rows.
 * `only`: these tasks alone (tests).
 */
export async function expireEndedTasks(db: Db, now: Date, { only }: { only?: string[] } = {}): Promise<number> {
  const expired = await db
    .update(tasks)
    .set({ status: 'expired', updatedAt: now, version: sql`${tasks.version} + 1` })
    .where(
      and(
        eq(tasks.status, 'open'),
        lte(tasks.windowEnd, now),
        ...(only ? [inArray(tasks.id, only)] : []),
        sql`not exists (select 1 from ${bookings} where ${bookings.taskId} = ${tasks.id} and ${bookings.status} <> 'canceled')`,
      ),
    )
    .returning({ id: tasks.id, posterUserId: tasks.posterUserId, windowEnd: tasks.windowEnd });
  const notices = expired.filter((task) => !isSampleId(task.id) && now.getTime() - task.windowEnd.getTime() <= NOTICE_WINDOW_MS);
  if (notices.length > 0) {
    await db.insert(outboxEvents).values(
      notices.map((task) => ({
        id: newId('evt'),
        type: 'task.expired',
        aggregateType: 'task',
        aggregateId: task.id,
        payload: { taskId: task.id, posterUserId: task.posterUserId },
      })),
    );
  }
  return expired.length;
}
