import { and, eq, like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { autoApproveDue } from '@/modules/bookings/completion-view';
import { confirmBooking } from '@/modules/bookings/confirm';
import { remindApprovalsDue } from '@/modules/bookings/reminders';
import { bookings } from '@/modules/bookings/schema';
import { notifications } from '@/modules/notifications/schema';
import { dispatchNotifications, getNotificationsPage } from '@/modules/notifications/service';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/** T-02: no response after the work is sent; reminders at 24 h and 4 h, then auto-approval at 72 h. Ana posts. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const deps = { db, payments: createDevPaymentProvider() };
const HOUR = 3_600_000;

/** A copy of the desk posted by Ana, booked with Jordan, with the work sent at `sentAt` (72 h to approve). */
async function submitted(id: string, sentAt: Date): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  const start = new Date(Date.now() + 2 * HOUR);
  await db.insert(tasks).values({ ...desk, id, slug: `${id}-slug`, posterUserId: 'usr_ana', status: 'open', offerCount: 1, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR) });
  await db.insert(offers).values({ ...offer, id: `off_${id}`, taskId: id, status: 'pending', revision: 1, proposedStart: start, expiresAt: start });
  const result = await confirmBooking(deps, 'usr_ana', id, `off_${id}`, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
  if (!result.ok || !result.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(result)}`);
  const bookingId = result.redirectTo.split('/').pop()!;
  await db
    .update(bookings)
    .set({ status: 'completion_submitted', arrivedAt: start, completionSubmittedAt: sentAt, approvalDueAt: new Date(sentAt.getTime() + 72 * HOUR) })
    .where(eq(bookings.id, bookingId));
  return bookingId;
}

const remindersOf = (bookingId: string) =>
  db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'booking.approval_reminder'), eq(outboxEvents.aggregateId, bookingId)));

describe('approval reminders', () => {
  it('reminds the client 24 h and 4 h before the work is approved automatically, once each', async () => {
    const sentAt = new Date(Date.now() + 5 * HOUR);
    const bookingId = await submitted('tsk_rem_desk', sentAt);
    const due = new Date(sentAt.getTime() + 72 * HOUR);
    const at = (hoursBefore: number) => new Date(due.getTime() - hoursBefore * HOUR);

    expect(await remindApprovalsDue(db, at(30), { bookingId })).toBe(0);
    expect(await remindApprovalsDue(db, at(24), { bookingId })).toBe(1);
    // The job runs every minute: still one.
    expect(await remindApprovalsDue(db, at(23.9), { bookingId })).toBe(0);
    expect(await remindApprovalsDue(db, at(4), { bookingId })).toBe(1);
    expect(await remindApprovalsDue(db, at(3), { bookingId })).toBe(0);
    expect((await remindersOf(bookingId)).map((event) => event.payload.hours).sort()).toEqual([24, 4].sort());

    // The client hears about both, on the booking.
    await dispatchNotifications(db, at(3), 10_000);
    const told = await db.select().from(notifications).where(and(eq(notifications.userId, 'usr_ana'), eq(notifications.type, 'approval_reminder')));
    const mine = told.filter((row) => row.target.kind === 'booking' && row.target.bookingId === bookingId);
    expect(mine.map((row) => row.params?.hours).sort()).toEqual([24, 4].sort());
    expect(mine[0]).toMatchObject({ actorName: 'Jordan T.' });

    // At 72 h it's approved automatically, and no more reminders.
    await autoApproveDue(db, due, { bookingId });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(row).toMatchObject({ status: 'completed', completedVia: 'auto' });
    expect(await remindApprovalsDue(db, due, { bookingId })).toBe(0);
  });

  it("makes the viewer's due reminder when they open their notifications", async () => {
    const sentAt = new Date(Date.now() + 5 * HOUR);
    const bookingId = await submitted('tsk_rem_page', sentAt);
    const page = await getNotificationsPage(db, 'usr_ana', new Date(sentAt.getTime() + 52 * HOUR));
    const reminder = page.notifications.find((item) => item.type === 'approval_reminder' && item.target.kind === 'booking' && item.target.bookingId === bookingId);
    expect(reminder).toMatchObject({ params: { hours: 20 }, actorName: 'Jordan T.' });
  });

  it('reminds again for a new deadline, and never for disputed or approved work', async () => {
    const sentAt = new Date(Date.now() + 5 * HOUR);
    const bookingId = await submitted('tsk_rem_extend', sentAt);
    const due = new Date(sentAt.getTime() + 72 * HOUR);
    expect(await remindApprovalsDue(db, new Date(due.getTime() - 3 * HOUR), { bookingId })).toBe(1);
    // Support extended the timer by a day: a new 4 h reminder before the new deadline.
    const extended = new Date(due.getTime() + 24 * HOUR);
    await db.update(bookings).set({ approvalDueAt: extended }).where(eq(bookings.id, bookingId));
    expect(await remindApprovalsDue(db, new Date(extended.getTime() - 3 * HOUR), { bookingId })).toBe(1);
    expect(await db.select().from(outboxEvents).where(like(outboxEvents.id, `evt_remind_${bookingId}_%`))).toHaveLength(2);

    await db.update(bookings).set({ status: 'disputed' }).where(eq(bookings.id, bookingId));
    expect(await remindApprovalsDue(db, new Date(extended.getTime() - 2 * HOUR), { bookingId })).toBe(0);
  });
});
