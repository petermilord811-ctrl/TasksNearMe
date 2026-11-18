import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { confirmBooking, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookingChangeRequests, bookingCompletions, bookings, bookingTerms } from '@/modules/bookings/schema';
import { cancelBookingBy } from '@/modules/bookings/sheets';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { offers } from '@/modules/offers/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { payments, refunds } from '@/modules/payments/schema';
import { bookingMoneyFacts } from '@/modules/support/staff';
import { resolutionMoney } from '@/modules/support/staff-domain';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * The booking-money review (2026-11-18): a cancellation refunds what's left across the booking's charges (#1, #2), a
 * settlement is measured from the submitted price (#3), and open changes end with the booking (#4).
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_tmp_money_review';
const deps = { db, payments: createDevPaymentProvider() };
const now = new Date();

async function bookedDesk(n: number): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  await db.insert(tasks).values({ ...desk!, id: `tsk_mr_${n}`, slug: `tsk-mr-${n}-slug`, posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer!, id: `off_mr_${n}`, taskId: `tsk_mr_${n}`, status: 'pending', revision: 1, expiresAt: new Date(now.getTime() + 86_400_000) });
  const page = await getBookingConfirmPage(deps, CLIENT, `tsk_mr_${n}`, `off_mr_${n}`, now);
  if (page?.kind !== 'page') throw new Error('expected the confirm page');
  const booked = await confirmBooking(deps, CLIENT, `tsk_mr_${n}`, `off_mr_${n}`, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now);
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  return booked.redirectTo.split('/').pop()!;
}

/** What the cancellation said the client gets back. */
async function refundOwed(bookingId: string): Promise<number> {
  const [event] = await db.select({ payload: outboxEvents.payload }).from(outboxEvents).where(and(eq(outboxEvents.type, 'booking.canceled'), eq(outboxEvents.aggregateId, bookingId))).orderBy(desc(outboxEvents.createdAt)).limit(1);
  return Number((event?.payload as { refundCents?: number } | undefined)?.refundCents ?? -1);
}

const cancellationRefunds = (bookingId: string) => db.select().from(refunds).where(and(eq(refunds.bookingId, bookingId), eq(refunds.reason, 'cancellation')));

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values({ ...maya!, id: CLIENT, email: 'tmp-money-review@example.test', name: 'Rae M.', firstName: 'Rae', lastName: 'Moss', phone: '+15125550689' });
});

afterAll(async () => {
  await pool.end();
});

describe('the booking-money review', () => {
  it('refunds a cancellation from a charge already partly refunded (#1)', async () => {
    const bookingId = await bookedDesk(1);
    const [charge] = await db.select().from(payments).where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'booking_funding')));
    // A goodwill refund (or a lower price after a change) left the charge partly refunded.
    await db.update(payments).set({ status: 'partially_refunded' }).where(eq(payments.id, charge!.id));
    await db.insert(refunds).values({ id: newId('ref'), paymentId: charge!.id, bookingId, amountCents: 1100, reason: 'goodwill', status: 'succeeded', providerRef: 'devre_mr1', idempotencyKey: `mr:goodwill:${bookingId}`, createdAt: now });
    expect(await cancelBookingBy(deps, CLIENT, bookingId, { reason: 'plans_changed', note: '' }, now)).toMatchObject({ ok: true });
    const owed = await refundOwed(bookingId);
    const back = await cancellationRefunds(bookingId);
    expect(owed).toBeGreaterThan(0);
    expect(back.reduce((sum, row) => sum + row.amountCents, 0)).toBe(Math.min(owed, 6600 - 1100));
    expect(back.every((row) => row.status === 'succeeded')).toBe(true);
  });

  it('spreads a cancellation refund over the booking’s payment and a paid change (#2)', async () => {
    const bookingId = await bookedDesk(2);
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    const [terms] = await db.select().from(bookingTerms).where(and(eq(bookingTerms.bookingId, bookingId), eq(bookingTerms.version, booking!.termsVersion)));
    const [charge] = await db.select().from(payments).where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'booking_funding')));
    // A change raised the price to $80 ($88 for the client), paid as its own $22 charge.
    await db.insert(bookingTerms).values({ ...terms!, id: newId('btm'), version: booking!.termsVersion + 1, priceCents: 8000, breakdown: quoteBreakdown(DEFAULT_FEES, { type: 'fixed', priceCents: 8000 }), createdAt: now });
    await db.update(bookings).set({ termsVersion: booking!.termsVersion + 1 }).where(eq(bookings.id, bookingId));
    const changeCharge = newId('pay');
    await db.insert(payments).values({ ...charge!, id: changeCharge, purpose: 'change_funding', amountCents: 2200, providerRef: `devpi_${changeCharge}`, idempotencyKey: `mr-change:${bookingId}`, createdAt: new Date(charge!.createdAt.getTime() + 60_000), updatedAt: now });
    expect(await cancelBookingBy(deps, CLIENT, bookingId, { reason: 'plans_changed', note: '' }, now)).toMatchObject({ ok: true });
    const owed = await refundOwed(bookingId);
    const back = await cancellationRefunds(bookingId);
    expect(back.reduce((sum, row) => sum + row.amountCents, 0)).toBe(owed);
    // The first charge gives what it has; anything above it comes off the change's charge, never more than either holds.
    expect(back.find((row) => row.paymentId === charge!.id)?.amountCents).toBe(Math.min(owed, 6600));
    if (owed > 6600) expect(back.find((row) => row.paymentId === changeCharge)?.amountCents).toBe(owed - 6600);
  });

  it('ends open changes with the booking (#4)', async () => {
    const bookingId = await bookedDesk(3);
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    const before = quoteBreakdown(DEFAULT_FEES, { type: 'fixed', priceCents: 6000 });
    const after = quoteBreakdown(DEFAULT_FEES, { type: 'fixed', priceCents: 8000 });
    const changeId = newId('chg');
    await db.insert(bookingChangeRequests).values({ id: changeId, bookingId, proposedByUserId: booking!.helperUserId, status: 'proposed', types: ['price'], fromVersion: booking!.termsVersion, pricingType: 'fixed', priceCents: 8000, startAt: booking!.startAt, scopeText: 'Assemble the desk', message: 'It’s a bigger desk.', beforeBreakdown: before, afterBreakdown: after, differenceCents: after.posterTotalCents - before.posterTotalCents, expiresAt: new Date(now.getTime() + 86_400_000), createdAt: now, updatedAt: now });
    expect(await cancelBookingBy(deps, CLIENT, bookingId, { reason: 'plans_changed', note: '' }, now)).toMatchObject({ ok: true });
    const [change] = await db.select({ status: bookingChangeRequests.status }).from(bookingChangeRequests).where(eq(bookingChangeRequests.id, changeId));
    expect(change?.status).toBe('expired');
  });

  it('measures a settlement from the submitted price, so unused hours aren’t given back twice (#3)', async () => {
    const bookingId = await bookedDesk(4);
    // The work came in under the agreed price ($50 of $60, as unused hours would): that's what a settlement starts from.
    await db.update(bookings).set({ status: 'completion_submitted', completionSubmittedAt: now }).where(eq(bookings.id, bookingId));
    const final = quoteBreakdown(DEFAULT_FEES, { type: 'fixed', priceCents: 5000 });
    await db.insert(bookingCompletions).values({ bookingId, submittedAt: now, note: '', hoursWorked: null, finalBreakdown: { ...final, posterChargedCents: 6600, posterRefundCents: 6600 - final.posterTotalCents }, checklist: {} });
    const money = await bookingMoneyFacts(db, bookingId);
    expect(money?.priceCents).toBe(5000);
    // Settling at $40: $11 more comes back ($55 → $44), on top of the $11 already due, $22 in all, not $33.
    expect(resolutionMoney('settle', money!, { settlePriceCents: 4000 })).toMatchObject({ posterRefundCents: 1100 });
    expect(resolutionMoney('settle', money!, { settlePriceCents: 5500 })).toBe('out_of_range');
  });
});
