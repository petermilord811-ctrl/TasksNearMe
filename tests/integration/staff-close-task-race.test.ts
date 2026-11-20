import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StaffActor } from '@/modules/support/staff';
import { moderateTask } from '@/modules/tasks/moderation';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Staff closing a task that was booked after the page loaded (security review SEC24): the close checks the task as it
 * writes, so the booking keeps its task. The test holds the task's row while the close waits to write, and books
 * the task meanwhile.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
const TASK = 'tsk_close_race_test';
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };

beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  if (!desk) throw new Error('The seeded desk task is missing');
  await db.delete(tasks).where(eq(tasks.id, TASK));
  await db.insert(tasks).values({ ...desk, id: TASK, slug: 'close-race-desk', status: 'open', offerCount: 0, version: 1, hiddenAt: null });
});

afterAll(async () => {
  await db.delete(tasks).where(eq(tasks.id, TASK));
  await pool.end();
});

/** Waits until a connection waits to update a task (at most 10 s). */
async function waitingToUpdateTasks(): Promise<void> {
  for (let tries = 0; tries < 200; tries += 1) {
    const { rows } = await pool.query<{ waiting: number }>(
      `select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query ilike 'update "tasks"%'`,
    );
    if ((rows[0]?.waiting ?? 0) >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The close never reached the task row');
}

describe('closing a task', () => {
  it('leaves a task booked since the page loaded to its booking', async () => {
    const lock = await pool.connect();
    let closing: ReturnType<typeof moderateTask>;
    try {
      await lock.query('begin');
      await lock.query('select 1 from tasks where id = $1 for update', [TASK]);
      closing = moderateTask(db, morgan, TASK, { action: 'close_task', reason: 'A duplicate of the same poster’s desk task.' }, new Date());
      await waitingToUpdateTasks();
      // Booked meanwhile, as confirming a booking marks its task.
      await lock.query(`update tasks set status = 'assigned' where id = $1`, [TASK]);
    } finally {
      await lock.query('commit');
      lock.release();
    }
    expect((await closing).result).toEqual({ ok: false, code: 'version_conflict' });
    const [task] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, TASK));
    expect(task?.status).toBe('assigned');
  });
});
