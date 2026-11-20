import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookings } from '@/modules/bookings/schema';
import { planNotifications } from '@/modules/notifications/service';
import { expireEndedTasks } from '@/modules/tasks/expiry';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * The tasks.expire job (sweep 2026-11-20, PT6): an open task whose window ended with nobody booked becomes `expired`,
 * and its poster hears it once if it ended within the last day. Never a task still running, one with a booking under
 * way, a long-ago one (the job's first run), or a sample row.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const HOUR = 3_600_000;
const now = new Date();
const ids = { recent: newId('tsk'), old: newId('tsk'), running: newId('tsk'), funding: newId('tsk'), sample: 'tsk_expiry_sample' };
const all = Object.values(ids);
const FUNDING_BOOKING = 'bkg_expiry_funding';

beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [tv] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  if (!desk || !tv) throw new Error('The seeded desk or TV booking is missing');
  const at = (id: string, endsIn: number) => ({ ...desk, id, slug: `expiry-${id.slice(-8)}`, posterUserId: 'usr_ruth', status: 'open', offerCount: 0, version: 1, windowStart: new Date(now.getTime() + endsIn - 3 * HOUR), windowEnd: new Date(now.getTime() + endsIn) });
  await db.insert(tasks).values([at(ids.recent, -2 * HOUR), at(ids.old, -72 * HOUR), at(ids.running, 2 * HOUR), at(ids.funding, -HOUR), at(ids.sample, -HOUR)]);
  // Its bank step under way when the window ended: the booking decides, not the job.
  await db.insert(bookings).values({ ...tv, id: FUNDING_BOOKING, taskId: ids.funding, posterUserId: 'usr_ruth', status: 'pending_funding' });
});

afterAll(async () => {
  await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, all));
  await db.delete(bookings).where(eq(bookings.id, FUNDING_BOOKING));
  await db.delete(tasks).where(inArray(tasks.id, all));
  await pool.end();
});

describe('the tasks.expire job', () => {
  it('expires open tasks whose window ended unbooked, and tells the poster once about a recent one', async () => {
    expect(await expireEndedTasks(db, now, { only: all })).toBe(3);
    const status = new Map((await db.select({ id: tasks.id, status: tasks.status }).from(tasks).where(inArray(tasks.id, all))).map((row) => [row.id, row.status]));
    expect(Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, status.get(id)]))).toEqual({ recent: 'expired', old: 'expired', running: 'open', funding: 'open', sample: 'expired' });

    const events = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'task.expired'), inArray(outboxEvents.aggregateId, all)));
    expect(events.map((event) => event.aggregateId)).toEqual([ids.recent]);
    expect(await planNotifications(db, events[0]!)).toEqual([
      { userId: 'usr_ruth', type: 'task_expired', target: { kind: 'task', taskId: ids.recent }, title: expect.any(String) },
    ]);

    // Again: nothing more to do, and no second notice.
    expect(await expireEndedTasks(db, now, { only: all })).toBe(0);
    expect(await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'task.expired'), inArray(outboxEvents.aggregateId, all)))).toHaveLength(1);
  });
});
