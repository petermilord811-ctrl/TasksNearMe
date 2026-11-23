import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { confirmBooking, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { getBookingView, getBookingsPage } from '@/modules/bookings/hub';
import { bookings } from '@/modules/bookings/schema';
import { getPaymentsPage, getReceiptPage, recordCompletionMoney } from '@/modules/earnings/service';
import { offers } from '@/modules/offers/schema';
import { payments, refunds } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';

/**
 * Money as each page shows it after the booking moved on (aa's sweep D4–D6): a refunded charge still received and
 * dated when it was made, a change's charge counted with the booking's, and finished bookings at what actually moved.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_tmp_money_displays';
const deps = { db, payments: createDevPaymentProvider() };
const hub = { db, cipher: fieldCipherFromEnv() };
const now = new Date();
const HOUR = 3_600_000;

async function bookedDesk(n: number): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  await db.insert(tasks).values({ ...desk!, id: `tsk_md_${n}`, slug: `tsk-md-${n}-slug`, posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer!, id: `off_md_${n}`, taskId: `tsk_md_${n}`, status: 'pending', revision: 1, expiresAt: new Date(now.getTime() + 86_400_000) });
  const page = await getBookingConfirmPage(deps, CLIENT, `tsk_md_${n}`, `off_md_${n}`, now);
  if (page?.kind !== 'page') throw new Error('expected the confirm page');
  const booked = await confirmBooking(deps, CLIENT, `tsk_md_${n}`, `off_md_${n}`, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now);
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  return booked.redirectTo.split('/').pop()!;
}

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values({ ...maya!, id: CLIENT, email: 'tmp-money-displays@example.test', name: 'Mo D.', firstName: 'Mo', lastName: 'Diaz', phone: '+15125550688' });
});

afterAll(async () => {
  await pool.end();
});

describe('money displays', () => {
  it('keeps a refunded charge on the timeline, dated when it was charged, not when it was refunded (D4)', async () => {
    const bookingId = await bookedDesk(1);
    const [charge] = await db.select().from(payments).where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'booking_funding')));
    const later = new Date(charge!.createdAt.getTime() + 5 * HOUR);
    await db.update(payments).set({ status: 'partially_refunded', updatedAt: later }).where(eq(payments.id, charge!.id));
    await db.insert(refunds).values({ id: newId('ref'), paymentId: charge!.id, bookingId, amountCents: 1200, reason: 'cancellation', status: 'succeeded', providerRef: 'devre_md', idempotencyKey: `md:${bookingId}`, createdAt: later });
    const view = await getBookingView(hub, CLIENT, bookingId, now);
    const received = view?.timeline.find((event) => event.type === 'payment_succeeded');
    expect(received).toMatchObject({ params: { amountCents: 6300 } });
    expect(received?.at).toBe(charge!.createdAt.toISOString());
    expect(view?.payments?.find((line) => line.kind === 'charge')?.at).toBe(charge!.createdAt.toISOString());
    const row = (await getPaymentsPage(db, CLIENT)).receipts.find((receipt) => receipt.bookingId === bookingId);
    expect(row).toMatchObject({ paidAt: charge!.createdAt.toISOString(), chargedCents: 6300, refundedCents: 1200, netCents: 5100 });
  });

  it('counts a change’s charge with the booking’s on Payments and the receipt (D5)', async () => {
    const bookingId = await bookedDesk(2);
    const [charge] = await db.select().from(payments).where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'booking_funding')));
    await db.insert(payments).values({ ...charge!, id: newId('pay'), purpose: 'change_funding', amountCents: 2200, idempotencyKey: `md-change:${bookingId}`, createdAt: new Date(charge!.createdAt.getTime() + HOUR), updatedAt: new Date(charge!.createdAt.getTime() + HOUR) });
    const rows = (await getPaymentsPage(db, CLIENT)).receipts.filter((receipt) => receipt.bookingId === bookingId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ chargedCents: 8500, netCents: 8500 });
    const receipt = await getReceiptPage(db, CLIENT, bookingId);
    expect(receipt?.lines.filter((line) => line.kind === 'charge').map((line) => line.amountCents)).toEqual([6300, 2200]);
    expect(receipt?.netCents).toBe(8500);
  });

  it('shows finished bookings at what actually moved: a cancelled one fully refunded, a completed one at its earnings (D6)', async () => {
    const canceled = await bookedDesk(3);
    const [charge] = await db.select().from(payments).where(and(eq(payments.bookingId, canceled), eq(payments.purpose, 'booking_funding')));
    await db.update(bookings).set({ status: 'canceled', cancelReason: 'poster_early', canceledAt: now }).where(eq(bookings.id, canceled));
    await db.update(payments).set({ status: 'refunded' }).where(eq(payments.id, charge!.id));
    await db.insert(refunds).values({ id: newId('ref'), paymentId: charge!.id, bookingId: canceled, amountCents: 6300, reason: 'cancellation', status: 'succeeded', providerRef: 'devre_md3', idempotencyKey: `md:${canceled}`, createdAt: now });
    const completed = await bookedDesk(4);
    await db.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: now }).where(eq(bookings.id, completed));
    await recordCompletionMoney(db, completed, now, deps.payments);

    const client = await getBookingsPage(db, CLIENT, now);
    expect(client.past.find((row) => row.id === canceled)?.amountCents).toBe(0);
    expect(client.past.find((row) => row.id === completed)?.amountCents).toBe(6300);
    const helper = await getBookingsPage(db, 'usr_jordan', now);
    expect(helper.past.find((row) => row.id === canceled)?.amountCents).toBe(0);
    expect(helper.past.find((row) => row.id === completed)?.amountCents).toBe(6000);
  });
});
