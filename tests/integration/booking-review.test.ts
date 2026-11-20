import { createHmac } from 'node:crypto';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import type { StripeConnect } from '@/integrations/payments/stripe-connect';
import { users } from '@/modules/accounts/schema';
import { recordMissingCompletionMoney } from '@/modules/bookings/completion-view';
import { confirmBooking, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookingCompletions, bookings, bookingTerms } from '@/modules/bookings/schema';
import { reportRunningLate } from '@/modules/bookings/sheets';
import { earnings } from '@/modules/earnings/schema';
import { planNotifications } from '@/modules/notifications/service';
import { offers } from '@/modules/offers/schema';
import { runScheduledTransfers } from '@/modules/payments/connect';
import { payments, refunds } from '@/modules/payments/schema';
import { handleStripePaymentWebhook } from '@/modules/payments/stripe-webhooks';
import { tasks } from '@/modules/tasks/schema';
import { payoutAccounts } from '@/modules/verification/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * The booking review (2026-11-18): completion money that didn't finish is recorded by the sweep (money #5), helpers who
 * can't be paid don't hold up everyone else's transfers (money #6), a charge captured after we gave up on it goes back
 * (lifecycle #2), and the client hears "running late" (lifecycle #4).
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_tmp_booking_review';
const STUCK = 'usr_tmp_br_stuck';
const READY = 'usr_tmp_br_ready';
const SECRET = 'whsec_booking_review';
const deps = { db, payments: createDevPaymentProvider() };
const now = new Date();

const transfers: Parameters<StripeConnect['transfer']>[0][] = [];
const connect: StripeConnect = {
  provider: 'stripe',
  createAccount: vi.fn(),
  onboardingLink: vi.fn(),
  accountStatus: vi.fn(),
  chargeOf: vi.fn(async () => null),
  transfer: vi.fn(async (input) => {
    transfers.push(input);
    return { ok: true as const, transferId: `tr_br_${transfers.length}` };
  }),
  instantAvailable: vi.fn(async () => 0),
  reverseTransfer: vi.fn(),
  instantPayout: vi.fn(),
  dashboardLink: vi.fn(),
};

async function bookedDesk(n: number): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  await db.insert(tasks).values({ ...desk!, id: `tsk_br_${n}`, slug: `tsk-br-${n}-slug`, posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer!, id: `off_br_${n}`, taskId: `tsk_br_${n}`, status: 'pending', revision: 1, expiresAt: new Date(now.getTime() + 86_400_000) });
  const page = await getBookingConfirmPage(deps, CLIENT, `tsk_br_${n}`, `off_br_${n}`, now);
  if (page?.kind !== 'page') throw new Error('expected the confirm page');
  const booked = await confirmBooking(deps, CLIENT, `tsk_br_${n}`, `off_br_${n}`, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now);
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  return booked.redirectTo.split('/').pop()!;
}

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  await db.insert(users).values({ ...maya!, id: CLIENT, email: 'tmp-booking-review@example.test', phone: null, phoneVerifiedAt: null });
  for (const id of [STUCK, READY]) await db.insert(users).values({ ...jordan!, id, email: `${id}@example.test`, phone: null, phoneVerifiedAt: null });
  await db.insert(payoutAccounts).values([
    { userId: STUCK, provider: 'stripe', providerAccountId: 'acct_br_stuck', status: 'requirements_due', createdAt: now, updatedAt: now },
    { userId: READY, provider: 'stripe', providerAccountId: 'acct_br_ready', status: 'active', createdAt: now, updatedAt: now },
  ]);
});

afterAll(async () => {
  await db.delete(earnings).where(inArray(earnings.helperUserId, [STUCK, READY]));
  await db.delete(payoutAccounts).where(inArray(payoutAccounts.userId, [STUCK, READY]));
  await db.delete(refunds).where(like(refunds.paymentId, 'pay_tmp_br_%'));
  await db.delete(payments).where(like(payments.id, 'pay_tmp_br_%'));
  await db.delete(users).where(inArray(users.id, [STUCK, READY]));
  await pool.end();
});

describe('the booking review', () => {
  it('records completion money that didn’t finish, once (money #5)', async () => {
    const bookingId = await bookedDesk(1);
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    const [terms] = await db.select().from(bookingTerms).where(and(eq(bookingTerms.bookingId, bookingId), eq(bookingTerms.version, booking!.termsVersion)));
    // Completed, but the money step never ran (a provider error stopped it).
    await db.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: new Date(now.getTime() - 10 * 60_000) }).where(eq(bookings.id, bookingId));
    await db.insert(bookingCompletions).values({ bookingId, submittedAt: now, note: '', hoursWorked: null, finalBreakdown: terms!.breakdown, checklist: {} });
    expect(await db.select().from(earnings).where(eq(earnings.bookingId, bookingId))).toHaveLength(0);
    await recordMissingCompletionMoney(db, now, 500);
    await recordMissingCompletionMoney(db, now, 500);
    const rows = await db.select().from(earnings).where(and(eq(earnings.bookingId, bookingId), eq(earnings.kind, 'earnings')));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amountCents).toBe(terms!.breakdown.helperEarningsCents);
  });

  it('never lets helpers who can’t be paid hold up the rest (money #6)', async () => {
    // More waiting rows than one batch, older than the ready helper's.
    const old = new Date(now.getTime() - 86_400_000);
    await db.insert(earnings).values(Array.from({ length: 60 }, (_, i) => ({ id: `ern_tmp_br_stuck_${i}`, bookingId: `bkg_tmp_br_stuck_${i}`, helperUserId: STUCK, kind: 'earnings', amountCents: 1000, status: 'scheduled', createdAt: old, updatedAt: old })));
    await db.insert(earnings).values({ id: 'ern_tmp_br_ready', bookingId: 'bkg_tmp_br_ready', helperUserId: READY, kind: 'earnings', amountCents: 5400, status: 'scheduled', createdAt: now, updatedAt: now });
    await runScheduledTransfers(db, connect, now);
    expect(transfers.some((input) => input.idempotencyKey === 'transfer:ern_tmp_br_ready' && input.accountId === 'acct_br_ready')).toBe(true);
    const [ready] = await db.select({ status: earnings.status }).from(earnings).where(eq(earnings.id, 'ern_tmp_br_ready'));
    expect(ready?.status).toBe('transferred');
  });

  it('gives back a charge captured after its booking was given up on (lifecycle #2)', async () => {
    await db.insert(payments).values({ id: 'pay_tmp_br_late', bookingId: 'bkg_tmp_br_gone', purpose: 'booking_funding', payerUserId: CLIENT, amountCents: 6600, status: 'canceled', provider: 'stripe', providerRef: 'pi_tmp_br_late', idempotencyKey: 'tmp-br-late', createdAt: now, updatedAt: now });
    const payload = JSON.stringify({ id: 'evt_tmp_br_late', type: 'payment_intent.succeeded', data: { object: { id: 'pi_tmp_br_late', object: 'payment_intent' } } });
    const t = Math.floor(now.getTime() / 1000);
    const signature = `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')}`;
    const outcome = await handleStripePaymentWebhook(deps, { payload, signature, secret: SECRET }, now);
    expect(outcome.status).toBe(200);
    // Again (Stripe retries): still one refund.
    await handleStripePaymentWebhook(deps, { payload, signature, secret: SECRET }, now);
    const back = await db.select().from(refunds).where(eq(refunds.paymentId, 'pay_tmp_br_late'));
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ amountCents: 6600, reason: 'late_capture', status: 'succeeded' });
    const [payment] = await db.select({ status: payments.status }).from(payments).where(eq(payments.id, 'pay_tmp_br_late'));
    expect(payment?.status).toBe('refunded');
  });

  it('tells the client the helper is running late (lifecycle #4)', async () => {
    const bookingId = await bookedDesk(2);
    expect(await reportRunningLate(db, 'usr_jordan', bookingId, 20, now)).toMatchObject({ ok: true });
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'booking.running_late'), eq(outboxEvents.aggregateId, bookingId))).orderBy(desc(outboxEvents.createdAt)).limit(1);
    expect(event).toBeTruthy();
    const planned = await planNotifications(db, event!);
    expect(planned).toEqual([expect.objectContaining({ userId: CLIENT, type: 'helper_running_late', params: { minutes: 20 } })]);
  });
});
