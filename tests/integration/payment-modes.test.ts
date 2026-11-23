import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { confirmBooking, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookingCompletions, bookings, bookingTerms } from '@/modules/bookings/schema';
import { previewCancellation } from '@/modules/bookings/sheets';
import { earnings } from '@/modules/earnings/schema';
import { getEarningsPage, recordCompletionMoney } from '@/modules/earnings/service';
import { offers } from '@/modules/offers/schema';
import { payments, refunds } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

/**
 * No service fees (owner, 2026-11-23): an offer paid directly is booked with no payment, and nothing moves through
 * TasksNearMe afterwards; an offer paid upfront is held as before, with the client's hold fee.
 */

const { db } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_tmp_pm_client';
const deps = { db, payments: createDevPaymentProvider() };
const now = new Date();

/** A copy of the seeded desk (Jordan's $60 offer on it), posted by the temporary client, paid as `mode` says. */
async function copyDesk(n: number, mode: 'direct' | 'held') {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  const taskId = `tsk_pm_${n}`;
  const offerId = `off_pm_${n}`;
  await db.insert(tasks).values({ ...desk!, id: taskId, slug: `${taskId}-slug`, posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer!, id: offerId, taskId, status: 'pending', revision: 1, paymentMode: mode, expiresAt: new Date(now.getTime() + 86_400_000) });
  return { taskId, offerId };
}

async function bookDirect(n: number): Promise<string> {
  const { taskId, offerId } = await copyDesk(n, 'direct');
  const booked = await confirmBooking(deps, CLIENT, taskId, offerId, { offerRevision: 1, acceptTerms: true }, now);
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  return booked.redirectTo.split('/').pop()!;
}

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values({ ...maya!, id: CLIENT, email: 'tmp-pm-client@example.test', name: 'Paz M.', firstName: 'Paz', lastName: 'Mora', phone: '+15125550681' });
});

describe('paid directly', () => {
  it('books at once with no payment step and no fee: the offer accepted, the task assigned, nothing charged', async () => {
    const { taskId, offerId } = await copyDesk(1, 'direct');
    const page = await getBookingConfirmPage(deps, CLIENT, taskId, offerId, now);
    if (page?.kind !== 'page') throw new Error('expected the confirm page');
    expect(page.data.paymentMode).toBe('direct');
    expect(page.data.breakdown).toMatchObject({ taskPriceCents: 6000, posterFeeCents: 0, helperFeeCents: 0, posterTotalCents: 6000, helperEarningsCents: 6000 });
    expect(page.data.credit).toBeUndefined();

    const booked = await confirmBooking(deps, CLIENT, taskId, offerId, { offerRevision: 1, acceptTerms: true }, now);
    expect(booked).toMatchObject({ ok: true, code: 'booked', redirectTo: expect.stringMatching(/^\/app\/bookings\/bkg_/) });
    const bookingId = booked.ok ? booked.redirectTo!.split('/').pop()! : '';
    expect((await db.select().from(bookings).where(eq(bookings.id, bookingId)))[0]).toMatchObject({ paymentMode: 'direct', status: 'confirmed', helperUserId: 'usr_jordan', confirmedAt: expect.any(Date) });
    expect((await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, bookingId)))[0]?.breakdown).toMatchObject({ posterFeeCents: 0, posterTotalCents: 6000 });
    expect(await db.select().from(payments).where(eq(payments.bookingId, bookingId))).toHaveLength(0);
    expect((await db.select({ status: offers.status }).from(offers).where(eq(offers.id, offerId)))[0]?.status).toBe('accepted');
    expect((await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)))[0]?.status).toBe('assigned');
    // A second click lands on the same booking.
    expect(await confirmBooking(deps, CLIENT, taskId, offerId, { offerRevision: 1, acceptTerms: true }, now)).toMatchObject({ ok: true, redirectTo: `/app/bookings/${bookingId}` });
  });

  it('moves no money when the work is done, and stays out of the helper’s pending earnings', async () => {
    const bookingId = await bookDirect(2);
    const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, bookingId));
    await db.update(bookings).set({ status: 'completion_submitted', completionSubmittedAt: now }).where(eq(bookings.id, bookingId));
    await db.insert(bookingCompletions).values({ bookingId, submittedAt: now, note: 'Done.', hoursWorked: null, finalBreakdown: terms!.breakdown, checklist: {} });
    expect((await getEarningsPage(db, 'usr_jordan', now)).rows.some((row) => row.bookingId === bookingId)).toBe(false);

    await db.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: now }).where(eq(bookings.id, bookingId));
    await recordCompletionMoney(db, bookingId, now, deps.payments);
    expect(await db.select().from(earnings).where(eq(earnings.bookingId, bookingId))).toHaveLength(0);
    expect(await db.select().from(refunds).where(eq(refunds.bookingId, bookingId))).toHaveLength(0);
  });

  it('cancels with nothing to refund or pay; a helper who cancels late still gets a strike', async () => {
    const bookingId = await bookDirect(3);
    expect(await previewCancellation(db, CLIENT, bookingId, now)).toMatchObject({ by: 'poster', paidDirectly: true, posterRefundCents: 0, helperCompensationCents: 0 });
    // Starting in two hours: past the free window.
    await db.update(bookings).set({ startAt: new Date(now.getTime() + 2 * 3_600_000) }).where(eq(bookings.id, bookingId));
    expect(await previewCancellation(db, CLIENT, bookingId, now)).toMatchObject({ late: true, paidDirectly: true, posterRefundCents: 0, helperCompensationCents: 0 });
    expect(await previewCancellation(db, 'usr_jordan', bookingId, now)).toMatchObject({ by: 'helper', late: true, paidDirectly: true, posterRefundCents: 0, helperStrike: true });
  });
});

describe('paid upfront', () => {
  it('still asks for a card, and holds the price plus the hold fee', async () => {
    const { taskId, offerId } = await copyDesk(4, 'held');
    expect(await confirmBooking(deps, CLIENT, taskId, offerId, { offerRevision: 1, acceptTerms: true }, now)).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { payment: ['required'] } });
    const booked = await confirmBooking(deps, CLIENT, taskId, offerId, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now);
    if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
    const bookingId = booked.redirectTo.split('/').pop()!;
    expect((await db.select().from(bookings).where(eq(bookings.id, bookingId)))[0]?.paymentMode).toBe('held');
    expect((await db.select({ amountCents: payments.amountCents }).from(payments).where(and(eq(payments.bookingId, bookingId), eq(payments.status, 'succeeded'))))).toEqual([{ amountCents: 6300 }]);
  });
});
