import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookings } from '@/modules/bookings/schema';
import { cancelTask } from '@/modules/offers/owner';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Canceling a task while a booking's payment is under way (sweep 2026-11-20, PT7): refused, since the bank step could
 * still confirm and book the task. Once it's over, the task cancels as usual. (settle()'s side: bookings/confirm.ts.)
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
const TASK = 'tsk_cancel_guard';
const BOOKING = 'bkg_cancel_guard';

beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [tv] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  if (!desk || !tv) throw new Error('The seeded desk or TV booking is missing');
  await db.insert(tasks).values({ ...desk, id: TASK, slug: 'cancel-guard-desk', posterUserId: 'usr_ruth', status: 'open', offerCount: 0, version: 1 });
  await db.insert(bookings).values({ ...tv, id: BOOKING, taskId: TASK, posterUserId: 'usr_ruth', status: 'pending_funding' });
});

afterAll(async () => {
  await db.delete(bookings).where(eq(bookings.id, BOOKING));
  await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, TASK));
  await db.delete(auditLog).where(inArray(auditLog.targetId, [TASK]));
  await db.delete(tasks).where(eq(tasks.id, TASK));
  await pool.end();
});

describe('canceling a task while a booking is paying', () => {
  it('is refused during the bank step, and goes through once it has ended', async () => {
    expect(await cancelTask(db, 'usr_ruth', TASK, 'other', new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, TASK)))[0]?.status).toBe('open');

    await db.update(bookings).set({ status: 'canceled' }).where(eq(bookings.id, BOOKING));
    expect(await cancelTask(db, 'usr_ruth', TASK, 'other', new Date())).toEqual({ ok: true, code: 'canceled' });
    expect((await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, TASK)))[0]?.status).toBe('canceled');
  });
});
