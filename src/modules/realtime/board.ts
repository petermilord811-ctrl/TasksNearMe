import { eq } from 'drizzle-orm';
import type { TaskLiveState } from '@/contracts';
import { tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';

/**
 * A task's live state for its market's board (completion plan 7.6), read when the stream hears that its offers or
 * state changed. Public facts only: the count the board shows, and whether it still takes offers.
 */

/** Open, booked (assigned or done), or closed (canceled, expired, or hidden by staff). */
export function liveStateOf(task: { status: string; hiddenAt: Date | null }): TaskLiveState['state'] {
  if (task.hiddenAt) return 'closed';
  if (task.status === 'open') return 'open';
  if (task.status === 'assigned' || task.status === 'completed') return 'booked';
  return 'closed';
}

export async function findTaskLiveState(db: Db, taskId: string, now: Date = new Date()): Promise<TaskLiveState | null> {
  const [task] = await db
    .select({ id: tasks.id, status: tasks.status, offerCount: tasks.offerCount, hiddenAt: tasks.hiddenAt })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task || task.status === 'draft') return null;
  const state = liveStateOf(task);
  return { id: task.id, offerCount: state === 'open' ? task.offerCount : 0, state, readAt: now.toISOString() };
}
