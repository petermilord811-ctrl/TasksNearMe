import { createHmac } from 'node:crypto';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import type { StripeConnect } from '@/integrations/payments/stripe-connect';
import { users } from '@/modules/accounts/schema';
import { quoteChange } from '@/modules/bookings/changes';
import { recordMissingCompletionMoney } from '@/modules/bookings/completion-view';
import { confirmBooking, getBookingConfirmPage, settle } from '@/modules/bookings/confirm';
import { runBookingAction } from '@/modules/bookings/hub';
import { bookingCompletions, bookings, bookingTerms } from '@/modules/bookings/schema';
import { expireCantAccess, reportCantAccess, reportNoShow, reportRunningLate } from '@/modules/bookings/sheets';
import { earnings } from '@/modules/earnings/schema';
import { marketPolicies } from '@/modules/markets/schema';
import { planNotifications } from '@/modules/notifications/service';
import { offers } from '@/modules/offers/schema';
import { runScheduledTransfers } from '@/modules/payments/connect';
import { quoteBreakdown } from '@/modules/payments/fees';
import { payments, refunds } from '@/modules/payments/schema';
import { handleStripePaymentWebhook } from '@/modules/payments/stripe-webhooks';
import { applyResolutionMoney } from '@/modules/support/staff-money';
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
// A second client for the third batch: booking has a per-person limit (10 in 10 minutes).
const CLIENT_B = 'usr_tmp_br_client_b';
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

async function bookDesk(n: number, card: 'success' | 'requires_verification', client = CLIENT) {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  await db.insert(tasks).values({ ...desk!, id: `tsk_br_${n}`, slug: `tsk-br-${n}-slug`, posterUserId: client, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer!, id: `off_br_${n}`, taskId: `tsk_br_${n}`, status: 'pending', revision: 1, expiresAt: new Date(now.getTime() + 86_400_000) });
  const page = await getBookingConfirmPage(deps, client, `tsk_br_${n}`, `off_br_${n}`, now);
  if (page?.kind !== 'page') throw new Error('expected the confirm page');
  return confirmBooking(deps, client, `tsk_br_${n}`, `off_br_${n}`, { offerRevision: 1, payment: { kind: 'dev_card', card, save: false }, acceptTerms: true }, now);
}

async function bookedDesk(n: number, client = CLIENT): Promise<string> {
  const booked = await bookDesk(n, 'success', client);
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  return booked.redirectTo.split('/').pop()!;
}

const at = (ms: number) => new Date(now.getTime() + ms);
const MINUTE = 60_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `write` in a transaction that stays open until `during` has started and had time to reach the row: a write
 * landing at the same moment as `during`, to show which one wins.
 */
async function racing<T>(write: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<unknown>, during: () => Promise<T>): Promise<T> {
  let locked!: () => void;
  let release!: () => void;
  const isLocked = new Promise<void>((resolve) => (locked = resolve));
  const gate = new Promise<void>((resolve) => (release = resolve));
  const holder = db.transaction(async (tx) => {
    await write(tx);
    locked();
    await gate;
  });
  await isLocked;
  const running = during();
  await sleep(300);
  release();
  await holder;
  return running;
}

const statusOf = async (bookingId: string) => (await db.select().from(bookings).where(eq(bookings.id, bookingId)))[0]!;

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  await db.insert(users).values({ ...maya!, id: CLIENT, email: 'tmp-booking-review@example.test', phone: null, phoneVerifiedAt: null });
  await db.insert(users).values({ ...maya!, id: CLIENT_B, email: 'tmp-booking-review-b@example.test', phone: null, phoneVerifiedAt: null });
  for (const id of [STUCK, READY]) await db.insert(users).values({ ...jordan!, id, email: `${id}@example.test`, phone: null, phoneVerifiedAt: null });
  await db.insert(payoutAccounts).values([
    { userId: STUCK, provider: 'stripe', providerAccountId: 'acct_br_stuck', status: 'requirements_due', createdAt: now, updatedAt: now },
    { userId: READY, provider: 'stripe', providerAccountId: 'acct_br_ready', status: 'active', createdAt: now, updatedAt: now },
  ]);
});

afterAll(async () => {
  // Every desk copy here is off the board afterwards: an open one pushes other files' searches past the first page.
  await db.update(tasks).set({ status: 'canceled' }).where(like(tasks.id, 'tsk\\_br\\_%'));
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
    await db.update(bookings).set({ startAt: at(60 * MINUTE) }).where(eq(bookings.id, bookingId));
    expect(await reportRunningLate(db, 'usr_jordan', bookingId, 20, now)).toMatchObject({ ok: true });
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'booking.running_late'), eq(outboxEvents.aggregateId, bookingId))).orderBy(desc(outboxEvents.createdAt)).limit(1);
    expect(event).toBeTruthy();
    const planned = await planNotifications(db, event!);
    expect(planned).toEqual([expect.objectContaining({ userId: CLIENT, type: 'helper_running_late', params: { minutes: 20 } })]);
  });
});

describe('the booking review, third batch', () => {
  it('never takes a no-show report on remote work (lifecycle #8)', async () => {
    const bookingId = await bookedDesk(3, CLIENT_B);
    await db.update(bookings).set({ startAt: at(-120 * MINUTE) }).where(eq(bookings.id, bookingId));
    await db.update(tasks).set({ mode: 'remote' }).where(eq(tasks.id, 'tsk_br_3'));
    expect(await reportNoShow(deps, CLIENT_B, bookingId, { note: '' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect((await statusOf(bookingId)).status).toBe('confirmed');
    await db.update(tasks).set({ mode: 'local' }).where(eq(tasks.id, 'tsk_br_3'));
    expect(await reportNoShow(deps, CLIENT_B, bookingId, { note: '' }, now)).toEqual({ ok: true, code: 'canceled' });
  });

  it('prices a change with the fees the booking was made under (lifecycle #9), and a new time only inside the window (#11)', async () => {
    const bookingId = await bookedDesk(4, CLIENT_B);
    const booking = await statusOf(bookingId);
    const [policy] = await db.select().from(marketPolicies).where(eq(marketPolicies.id, booking.policyVersionId));
    // Booked under fees the market has since changed.
    const fees = { ...policy!.fees, posterBps: policy!.fees.posterBps + 500 };
    await db.insert(marketPolicies).values({ ...policy!, id: 'mpol_tmp_br_earlier', version: 9001, status: 'retired', fees });
    const [terms] = await db.select().from(bookingTerms).where(and(eq(bookingTerms.bookingId, bookingId), eq(bookingTerms.version, booking.termsVersion)));
    const breakdown = quoteBreakdown(fees, { type: 'fixed', priceCents: terms!.priceCents! }, { expenseAllowanceCents: terms!.expenseAllowanceCents });
    await db.update(bookings).set({ policyVersionId: 'mpol_tmp_br_earlier' }).where(eq(bookings.id, bookingId));
    await db.update(bookingTerms).set({ breakdown, startAt: at(3 * 24 * 60 * MINUTE) }).where(and(eq(bookingTerms.bookingId, bookingId), eq(bookingTerms.version, booking.termsVersion)));

    const message = 'Could you also hang the shelf?';
    expect(await quoteChange(db, CLIENT_B, bookingId, { message, scopeText: 'Assemble the desk and hang the shelf above it.' }, now)).toMatchObject({ ok: true, differenceCents: 0 });
    expect(await quoteChange(db, CLIENT_B, bookingId, { message, start: at(-60 * MINUTE).toISOString() }, now)).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await quoteChange(db, CLIENT_B, bookingId, { message, start: at(45 * 24 * 60 * MINUTE).toISOString() }, now)).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await quoteChange(db, CLIENT_B, bookingId, { message, start: at(4 * 24 * 60 * MINUTE).toISOString() }, now)).toMatchObject({ ok: true });
  });

  it('never overwrites a booking canceled while its payment settles (lifecycle #10)', async () => {
    const pending = await bookDesk(5, 'requires_verification', CLIENT_B);
    expect(pending).toMatchObject({ ok: false, code: 'requires_bank_verification' });
    const [booking] = await db.select().from(bookings).where(eq(bookings.taskId, 'tsk_br_5'));
    const [payment] = await db.select().from(payments).where(eq(payments.bookingId, booking!.id));
    expect(booking?.status).toBe('pending_funding');
    // The hold runs out at the moment the bank's answer arrives.
    const result = await racing(
      (tx) => tx.update(bookings).set({ status: 'canceled', cancelReason: 'funding_failed', canceledAt: now }).where(eq(bookings.id, booking!.id)),
      () => settle(deps, CLIENT_B, payment!.id, { status: 'succeeded', providerRef: payment!.providerRef ?? 'devpi_tmp_br_5' }, now),
    );
    expect(result).toMatchObject({ ok: false, code: 'expired' });
    expect((await statusOf(booking!.id)).status).toBe('canceled');
    const [needed] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'payment.refund_needed'), eq(outboxEvents.aggregateId, payment!.id)));
    expect(needed).toBeTruthy();
  });

  it('takes one can’t-get-in report, and an “I’m here” that lands with the expiry wins (lifecycle #12)', async () => {
    const bookingId = await bookedDesk(6, CLIENT_B);
    await db.update(bookings).set({ status: 'in_progress', startAt: at(-30 * MINUTE), arrivedAt: at(-25 * MINUTE) }).where(eq(bookings.id, bookingId));
    expect(await reportCantAccess(db, 'usr_jordan', bookingId, { note: '' }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await reportCantAccess(db, 'usr_jordan', bookingId, { note: '' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await runBookingAction(db, CLIENT_B, bookingId, 'im_here', at(MINUTE))).toEqual({ ok: true, code: 'updated' });
    expect(await statusOf(bookingId)).toMatchObject({ status: 'in_progress', posterResponseDueAt: null });
    expect((await statusOf(bookingId)).cantAccessAt).toBeTruthy();
    // Answered: no second report, and the old clock never cancels.
    expect(await reportCantAccess(db, 'usr_jordan', bookingId, { note: '' }, at(2 * MINUTE))).toEqual({ ok: false, code: 'not_allowed' });
    await expireCantAccess(db, at(40 * MINUTE), { bookingId }, deps.payments);
    expect((await statusOf(bookingId)).status).toBe('in_progress');

    // The 30 minutes ran out just as the client answered.
    const raced = await bookedDesk(7, CLIENT_B);
    await db.update(bookings).set({ status: 'in_progress', startAt: at(-90 * MINUTE), arrivedAt: at(-85 * MINUTE), cantAccessAt: at(-31 * MINUTE), posterResponseDueAt: at(-MINUTE) }).where(eq(bookings.id, raced));
    await racing(
      (tx) => tx.update(bookings).set({ posterResponseDueAt: null }).where(eq(bookings.id, raced)),
      () => expireCantAccess(db, now, { bookingId: raced }, deps.payments),
    );
    expect((await statusOf(raced)).status).toBe('in_progress');
    expect(await db.select().from(refunds).where(eq(refunds.bookingId, raced))).toHaveLength(0);
  });

  it('settles or refunds a dispute only if the client’s approval didn’t land first (lifecycle #13)', async () => {
    const moved = { posterRefundCents: 1575, helperReceivesCents: 4500, platformKeepsCents: 225 };
    async function submitted(n: number): Promise<string> {
      const bookingId = await bookedDesk(n);
      const booking = await statusOf(bookingId);
      const [terms] = await db.select().from(bookingTerms).where(and(eq(bookingTerms.bookingId, bookingId), eq(bookingTerms.version, booking.termsVersion)));
      await db.update(bookings).set({ status: 'completion_submitted' }).where(eq(bookings.id, bookingId));
      await db.insert(bookingCompletions).values({ bookingId, submittedAt: now, note: '', hoursWorked: null, finalBreakdown: terms!.breakdown, checklist: {} });
      return bookingId;
    }
    const approve = (bookingId: string) => (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) =>
      tx.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: now }).where(and(eq(bookings.id, bookingId), eq(bookings.status, 'completion_submitted')));

    const settled = await submitted(8);
    const settling = await racing(approve(settled), () => applyResolutionMoney(db, deps.payments, { caseId: 'case_tmp_br_8', bookingId: settled, resolution: 'settle', moved, settlePriceCents: 4500, now }));
    expect(settling).toBe(false);
    expect(await statusOf(settled)).toMatchObject({ status: 'completed', completedVia: 'poster' });
    const [completion] = await db.select().from(bookingCompletions).where(eq(bookingCompletions.bookingId, settled));
    expect(completion?.finalBreakdown.taskPriceCents).toBe(6000);
    expect(await db.select().from(refunds).where(eq(refunds.bookingId, settled))).toHaveLength(0);

    const refunded = await submitted(9);
    const refunding = await racing(approve(refunded), () => applyResolutionMoney(db, deps.payments, { caseId: 'case_tmp_br_9', bookingId: refunded, resolution: 'refund_full', moved: { ...moved, posterRefundCents: 6300 }, now }));
    expect(refunding).toBe(false);
    expect((await statusOf(refunded)).status).toBe('completed');
    expect(await db.select().from(refunds).where(eq(refunds.bookingId, refunded))).toHaveLength(0);

    // Unraced, both still work.
    const fine = await submitted(10);
    expect(await applyResolutionMoney(db, deps.payments, { caseId: 'case_tmp_br_10', bookingId: fine, resolution: 'refund_full', moved: { ...moved, posterRefundCents: 6300 }, now })).toBe(true);
    expect(await statusOf(fine)).toMatchObject({ status: 'canceled', cancelReason: 'refunded_in_dispute' });
    expect((await db.select().from(refunds).where(eq(refunds.bookingId, fine))).map((row) => row.amountCents)).toEqual([6300]);
  });

  it('takes “running late” only on the day, before arriving, and not for remote work (lifecycle #14)', async () => {
    const bookingId = await bookedDesk(11, CLIENT_B);
    await db.update(bookings).set({ startAt: at(3 * 24 * 60 * MINUTE) }).where(eq(bookings.id, bookingId));
    expect(await reportRunningLate(db, 'usr_jordan', bookingId, 20, now)).toEqual({ ok: false, code: 'not_allowed' });
    await db.update(bookings).set({ startAt: at(60 * MINUTE) }).where(eq(bookings.id, bookingId));
    await db.update(tasks).set({ mode: 'remote' }).where(eq(tasks.id, 'tsk_br_11'));
    expect(await reportRunningLate(db, 'usr_jordan', bookingId, 20, now)).toEqual({ ok: false, code: 'not_allowed' });
    await db.update(tasks).set({ mode: 'local' }).where(eq(tasks.id, 'tsk_br_11'));
    expect(await reportRunningLate(db, 'usr_jordan', bookingId, 20, now)).toEqual({ ok: true, code: 'updated' });
  });
});
