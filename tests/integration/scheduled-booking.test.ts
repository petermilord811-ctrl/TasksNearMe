import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider, devCardRef } from '@/integrations/payments';
import { confirmBooking, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { chargeDueScheduled, expireUnpaidScheduled } from '@/modules/bookings/scheduled';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { cancelBookingBy, previewCancellation } from '@/modules/bookings/sheets';
import { offers } from '@/modules/offers/schema';
import { paymentMethods, payments } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * Bookings made more than 14 days ahead (blueprint 04, phase 2): booked now and paid later. Copies of the seeded
 * desk (Ana ↔ Jordan) a few weeks out: the card is kept, charged 72 h before (a retry at 48 h), and still unpaid
 * 24 h before, the booking is canceled and the task opens for offers again. Nothing this file makes is left behind.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const provider = createDevPaymentProvider();
const deps = { db, payments: provider };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RATE_KEYS = ['booking-confirm:usr_ana', 'booking-sheet:usr_ana'];
const now = new Date();
const madeTasks: string[] = [];
let cardsBefore: string[] = [];

/** A copy of the desk for Ana with Jordan's offer, starting `days` from now. */
async function farDesk(id: string, days: number): Promise<{ taskId: string; offerId: string; start: Date }> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  const start = new Date(now.getTime() + days * DAY);
  await db.insert(tasks).values({ ...desk, id, slug: `${id}-slug`, posterUserId: 'usr_ana', status: 'open', offerCount: 1, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR) });
  await db.insert(offers).values({ ...offer, id: `off_${id}`, taskId: id, status: 'pending', revision: 1, proposedStart: start, expiresAt: new Date(now.getTime() + DAY) });
  madeTasks.push(id);
  return { taskId: id, offerId: `off_${id}`, start };
}

const bookingOf = async (taskId: string) => (await db.select().from(bookings).where(eq(bookings.taskId, taskId)).orderBy(bookings.createdAt)).at(-1)!;

beforeAll(async () => {
  await db.delete(rateLimits).where(inArray(rateLimits.key, RATE_KEYS));
  cardsBefore = (await db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.userId, 'usr_ana'))).map((row) => row.id);
});

afterAll(async () => {
  try {
    const made = await db.select({ id: bookings.id }).from(bookings).where(inArray(bookings.taskId, madeTasks));
    const ids = made.map((row) => row.id);
    if (ids.length) {
      await db.delete(payments).where(inArray(payments.bookingId, ids));
      await db.delete(bookingTerms).where(inArray(bookingTerms.bookingId, ids));
      await db.delete(bookings).where(inArray(bookings.id, ids));
    }
    await db.delete(offers).where(inArray(offers.taskId, madeTasks));
    await db.delete(tasks).where(inArray(tasks.id, madeTasks));
    const cards = await db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.userId, 'usr_ana'));
    const added = cards.map((row) => row.id).filter((id) => !cardsBefore.includes(id));
    if (added.length) await db.delete(paymentMethods).where(inArray(paymentMethods.id, added));
    await db.delete(rateLimits).where(inArray(rateLimits.key, RATE_KEYS));
  } finally {
    await pool.end();
  }
});

describe('bookings made more than 14 days ahead', () => {
  it('books now, keeps the card, charges nothing, and charges it 72 h before', async () => {
    const { taskId, offerId, start } = await farDesk('tsk_far_paid', 20);
    const page = await getBookingConfirmPage(deps, 'usr_ana', taskId, offerId, now);
    expect(page?.kind === 'page' && page.data.paysLater).toEqual({ chargeAt: new Date(start.getTime() - 72 * HOUR).toISOString(), payBy: new Date(start.getTime() - 24 * HOUR).toISOString() });

    const booked = await confirmBooking(deps, 'usr_ana', taskId, offerId, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now);
    expect(booked).toMatchObject({ ok: true, code: 'booked' });
    const booking = await bookingOf(taskId);
    expect(booking).toMatchObject({ status: 'scheduled', fundingAttempts: 0 });
    expect(booking.fundingDueAt?.getTime()).toBe(start.getTime() - 72 * HOUR);
    expect(booking.fundingExpiresAt?.getTime()).toBe(start.getTime() - 24 * HOUR);
    const [card] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, booking.fundingMethodId!));
    expect(card).toMatchObject({ userId: 'usr_ana', providerRef: devCardRef('success') });
    expect(await db.select().from(payments).where(eq(payments.bookingId, booking.id))).toHaveLength(0);
    const [offer] = await db.select().from(offers).where(eq(offers.id, offerId));
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(offer?.status).toBe('accepted');
    expect(task?.status).toBe('assigned');

    await chargeDueScheduled(deps, new Date(start.getTime() - 71 * HOUR));
    expect(await bookingOf(taskId)).toMatchObject({ status: 'confirmed' });
  });

  it('retries once at 48 h, then cancels it 24 h before and opens the task again, with no fees', async () => {
    const { taskId, offerId, start } = await farDesk('tsk_far_unpaid', 21);
    await confirmBooking(deps, 'usr_ana', taskId, offerId, { offerRevision: 1, payment: { kind: 'dev_card', card: 'declined', save: false }, acceptTerms: true }, now);
    await chargeDueScheduled(deps, new Date(start.getTime() - 71 * HOUR));
    let booking = await bookingOf(taskId);
    expect(booking).toMatchObject({ status: 'scheduled', fundingFailure: 'payment_declined' });
    expect(booking.fundingDueAt?.getTime()).toBe(start.getTime() - 48 * HOUR);
    await chargeDueScheduled(deps, new Date(start.getTime() - 47 * HOUR));
    booking = await bookingOf(taskId);
    expect(booking).toMatchObject({ fundingAttempts: 2, fundingDueAt: null });
    await expireUnpaidScheduled(db, new Date(start.getTime() - 23 * HOUR));
    expect(await bookingOf(taskId)).toMatchObject({ status: 'canceled', cancelReason: 'funding_failed' });
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(task).toMatchObject({ status: 'open', offerCount: 0 });
    const succeeded = await db.select().from(payments).where(and(eq(payments.bookingId, booking.id), eq(payments.status, 'succeeded')));
    expect(succeeded).toHaveLength(0);
  });

  it('cancels free before it is paid: nothing was charged', async () => {
    const { taskId, offerId } = await farDesk('tsk_far_cancel', 22);
    await confirmBooking(deps, 'usr_ana', taskId, offerId, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now);
    const booking = await bookingOf(taskId);
    expect(await previewCancellation(db, 'usr_ana', booking.id, now)).toMatchObject({ late: false, posterRefundCents: 0, helperCompensationCents: 0, helperStrike: false, nothingCharged: true });
    expect(await cancelBookingBy(deps, 'usr_ana', booking.id, { reason: 'plans_changed', note: '' }, now)).toEqual({ ok: true, code: 'canceled' });
    expect(await bookingOf(taskId)).toMatchObject({ status: 'canceled', cancelReason: 'poster_early' });
  });
});
