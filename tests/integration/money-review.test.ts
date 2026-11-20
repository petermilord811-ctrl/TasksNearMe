import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDevPaymentProvider, type PaymentProvider } from '@/integrations/payments';
import type { StripeConnect } from '@/integrations/payments/stripe-connect';
import { users } from '@/modules/accounts/schema';
import { confirmBooking, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookings } from '@/modules/bookings/schema';
import { creditRedemptions, posterCredits } from '@/modules/credits/schema';
import { availableCredit, redeemCredits } from '@/modules/credits/service';
import { requestInstantPayout } from '@/modules/earnings/instant';
import { earnings, payouts, transferReversals } from '@/modules/earnings/schema';
import { recordCompletionMoney } from '@/modules/earnings/service';
import { offers } from '@/modules/offers/schema';
import { handleConnectWebhook, runScheduledTransfers } from '@/modules/payments/connect';
import { reverseTransfer } from '@/modules/payments/reversals';
import { payments, refunds } from '@/modules/payments/schema';
import { cancelStaleCharges } from '@/modules/payments/stale-charges';
import { handleStripePaymentWebhook } from '@/modules/payments/stripe-webhooks';
import { supportCases } from '@/modules/support/schema';
import type { StaffActor } from '@/modules/support/staff';
import { staffRefund } from '@/modules/support/staff-money';
import { tasks } from '@/modules/tasks/schema';
import { payoutAccounts } from '@/modules/verification/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/**
 * The money review's medium and low rows (2026-11-18, MO7–MO13): transfers from one charge stay within it, money nothing
 * is owed for goes back on its own (MO8, in oncall.test.ts), a charge whose call never answered is finished by Stripe's
 * event or given up, staff forms sent twice move money once, a credit is spent once, one row per payout, and a payout
 * claims only the earnings its amount holds.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
const CLIENT = 'usr_tmp_mr_client';
const CLIENT_B = 'usr_tmp_mr_client_b';
const CLIENT_C = 'usr_tmp_mr_client_c';
const HELPER = 'usr_tmp_mr_helper';
const PAYEE = 'usr_tmp_mr_payee';
const ACCOUNT = 'acct_tmp_mr';
const PAYEE_ACCOUNT = 'acct_tmp_mr_payee';
const PAY_SECRET = 'whsec_money_review';
const CONNECT_SECRET = 'whsec_money_review_connect';
const pay = createDevPaymentProvider();
const deps = { db, payments: pay };
const now = new Date();
const MINUTE = 60_000;
const at = (ms: number) => new Date(now.getTime() + ms);
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const casey: StaffActor = { id: 'usr_casey', roles: ['finance'] };
const MIGRATION = readFileSync('db/migrations/0067_payouts_provider_ref_unique.sql', 'utf8').split('--> statement-breakpoint');
const statementOf = (marker: string) => MIGRATION.find((part) => part.includes(marker))!;

class RollBack extends Error {}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Runs `work` in a transaction that is always rolled back (the payout index is dropped inside it to seed duplicates). */
async function rolledBack(work: (tx: Tx) => Promise<void>): Promise<void> {
  await db
    .transaction(async (tx) => {
      await work(tx);
      throw new RollBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });
}

const transfers: Parameters<StripeConnect['transfer']>[0][] = [];
const charges: Record<string, { chargeId: string; amountCents: number }> = { pi_tmp_mr_7: { chargeId: 'ch_tmp_mr_7', amountCents: 6600 } };
let instant = { availableCents: 0, payoutId: '' };
const connect: StripeConnect = {
  provider: 'stripe',
  createAccount: vi.fn(),
  onboardingLink: vi.fn(),
  accountStatus: vi.fn(),
  chargeOf: vi.fn(async (intentId: string) => charges[intentId] ?? null),
  transfer: vi.fn(async (input) => {
    transfers.push(input);
    return { ok: true as const, transferId: `tr_tmp_mr_${transfers.length}` };
  }),
  instantAvailable: vi.fn(async () => instant.availableCents),
  reverseTransfer: vi.fn(),
  instantPayout: vi.fn(async () => ({ payoutId: instant.payoutId, arrivalDate: '2026-11-21' })),
  dashboardLink: vi.fn(),
};

function signedPayment(event: unknown) {
  const payload = JSON.stringify(event);
  const t = Math.floor(now.getTime() / 1000);
  return { payload, signature: `t=${t},v1=${createHmac('sha256', PAY_SECRET).update(`${t}.${payload}`).digest('hex')}`, secret: PAY_SECRET };
}
function signedConnect(event: unknown) {
  const payload = JSON.stringify(event);
  const t = Math.floor(now.getTime() / 1000);
  return { payload, signature: `t=${t},v1=${createHmac('sha256', CONNECT_SECRET).update(`${t}.${payload}`).digest('hex')}`, secrets: [CONNECT_SECRET] };
}
const payoutEvent = (account: string, id: string, amount: number, status: string) => ({
  id: `evt_${id}_${status}`,
  type: `payout.${status}`,
  account,
  data: { object: { id, amount, status, arrival_date: Math.floor(now.getTime() / 1000) + 86_400, created: Math.floor(now.getTime() / 1000) + 60 } },
});

/** A booked copy of the seeded desk ($60, charged $66 by the development provider). */
async function bookedDesk(n: number, client: string): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  await db.insert(tasks).values({ ...desk!, id: `tsk_mr_${n}`, slug: `tsk-mr-${n}-slug`, posterUserId: client, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer!, id: `off_mr_${n}`, taskId: `tsk_mr_${n}`, status: 'pending', revision: 1, expiresAt: at(24 * 60 * MINUTE) });
  const page = await getBookingConfirmPage(deps, client, `tsk_mr_${n}`, `off_mr_${n}`, now);
  if (page?.kind !== 'page') throw new Error('expected the confirm page');
  const booked = await confirmBooking(deps, client, `tsk_mr_${n}`, `off_mr_${n}`, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now);
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  return booked.redirectTo.split('/').pop()!;
}
const chargeOf = async (bookingId: string) => (await db.select().from(payments).where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'booking_funding'))))[0]!;

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  for (const id of [CLIENT, CLIENT_B, CLIENT_C]) await db.insert(users).values({ ...maya!, id, email: `${id}@example.test`, phone: null, phoneVerifiedAt: null });
  for (const id of [HELPER, PAYEE]) await db.insert(users).values({ ...jordan!, id, email: `${id}@example.test`, phone: null, phoneVerifiedAt: null });
  await db.insert(payoutAccounts).values([
    { userId: HELPER, provider: 'stripe', providerAccountId: ACCOUNT, status: 'active', createdAt: now, updatedAt: now },
    { userId: PAYEE, provider: 'stripe', providerAccountId: PAYEE_ACCOUNT, status: 'active', createdAt: now, updatedAt: now },
  ]);
});

afterAll(async () => {
  // Off the board, and nothing left for other files' transfer runs.
  await db.update(tasks).set({ status: 'canceled' }).where(like(tasks.id, 'tsk\\_mr\\_%'));
  await db.delete(transferReversals).where(like(transferReversals.earningsId, 'ern\\_tmp\\_mr\\_%'));
  await db.delete(supportCases).where(eq(supportCases.id, 'case_tmp_mr_rev'));
  await db.delete(earnings).where(inArray(earnings.helperUserId, [HELPER, PAYEE]));
  await db.delete(earnings).where(like(earnings.id, 'ern\\_tmp\\_mr\\_%'));
  await db.delete(payouts).where(inArray(payouts.helperUserId, [HELPER, PAYEE]));
  await db.delete(payoutAccounts).where(inArray(payoutAccounts.userId, [HELPER, PAYEE]));
  await db.delete(refunds).where(like(refunds.paymentId, 'pay\\_tmp\\_mr\\_%'));
  await db.delete(payments).where(like(payments.id, 'pay\\_tmp\\_mr\\_%'));
  await db.delete(posterCredits).where(inArray(posterCredits.userId, [CLIENT_B, CLIENT_C]));
  await pool.end();
});

describe('transfers from one charge (MO7)', () => {
  it('keep within the charge, counting what earlier transfers and refunds took from it', async () => {
    await db.insert(payments).values({ id: 'pay_tmp_mr_7', bookingId: 'bkg_tmp_mr_7', purpose: 'booking_funding', payerUserId: CLIENT, amountCents: 6600, status: 'partially_refunded', provider: 'stripe', providerRef: 'pi_tmp_mr_7', idempotencyKey: 'tmp-mr-7', createdAt: now, updatedAt: now });
    await db.insert(refunds).values({ id: 'ref_tmp_mr_7', paymentId: 'pay_tmp_mr_7', bookingId: 'bkg_tmp_mr_7', amountCents: 1000, reason: 'goodwill', status: 'succeeded', providerRef: 're_tmp_mr_7', idempotencyKey: 'tmp-mr-7-goodwill', createdAt: now });
    const row = (id: string, kind: string, amountCents: number, ago: number) => ({ id, bookingId: 'bkg_tmp_mr_7', helperUserId: HELPER, kind, amountCents, status: 'scheduled', createdAt: at(-ago), updatedAt: at(-ago) });
    await db.insert(earnings).values([row('ern_tmp_mr_7a', 'earnings', 5000, 2 * MINUTE), row('ern_tmp_mr_7b', 'reimbursement', 800, MINUTE)]);
    await runScheduledTransfers(db, connect, now);
    const byKey = Object.fromEntries(transfers.map((transfer) => [transfer.idempotencyKey, transfer]));
    // $66 charged, $10 refunded, $50 already tied to it: the $8 reimbursement goes out from the platform's balance.
    expect(byKey['transfer:ern_tmp_mr_7a']).toMatchObject({ amountCents: 5000, sourceChargeId: 'ch_tmp_mr_7' });
    expect(byKey['transfer:ern_tmp_mr_7b']).toMatchObject({ amountCents: 800 });
    expect(byKey['transfer:ern_tmp_mr_7b']?.sourceChargeId).toBeUndefined();
    const rows = await db.select({ id: earnings.id, source: earnings.sourcePaymentId }).from(earnings).where(inArray(earnings.id, ['ern_tmp_mr_7a', 'ern_tmp_mr_7b']));
    expect(Object.fromEntries(rows.map((r) => [r.id, r.source]))).toEqual({ ern_tmp_mr_7a: 'pay_tmp_mr_7', ern_tmp_mr_7b: null });
  });

  it('records the source of transfers made before 0067 from our own rows (the migration’s backfill)', async () => {
    await rolledBack(async (tx) => {
      await tx.insert(payments).values({ id: 'pay_tmp_mr_7old', bookingId: 'bkg_tmp_mr_7old', purpose: 'booking_funding', payerUserId: CLIENT, amountCents: 6600, status: 'succeeded', provider: 'stripe', providerRef: 'pi_tmp_mr_7old', idempotencyKey: 'tmp-mr-7old', createdAt: now, updatedAt: now });
      const old = (id: string, kind: string, amountCents: number) => ({ id, bookingId: 'bkg_tmp_mr_7old', helperUserId: HELPER, kind, amountCents, status: 'paid_out', transferRef: `tr_${id}`, transferredAt: now, createdAt: now, updatedAt: now });
      // The old code tied a transfer to the charge whenever the charge alone covered it.
      await tx.insert(earnings).values([old('ern_tmp_mr_7old', 'earnings', 5400), old('ern_tmp_mr_7big', 'reimbursement', 9000), { ...old('ern_tmp_mr_7wait', 'tip', 500), status: 'scheduled', transferRef: null, transferredAt: null }]);
      await tx.execute(sql.raw(statementOf('UPDATE "earnings" SET "source_payment_id"')));
      const rows = await tx.select({ id: earnings.id, source: earnings.sourcePaymentId }).from(earnings).where(like(earnings.id, 'ern\\_tmp\\_mr\\_7%'));
      expect(Object.fromEntries(rows.filter((r) => r.id.includes('7old') || r.id.includes('7big') || r.id.includes('7wait')).map((r) => [r.id, r.source]))).toEqual({
        ern_tmp_mr_7old: 'pay_tmp_mr_7old',
        ern_tmp_mr_7big: null,
        ern_tmp_mr_7wait: null,
      });
    });
  });
});

describe('a charge whose call never answered (MO9)', () => {
  it('is finished by Stripe’s event, found by the payment id on the intent', async () => {
    const bookingId = await bookedDesk(1, CLIENT);
    // The tip's charge call threw (a network error): the row has no intent id.
    await db.insert(payments).values({ id: 'pay_tmp_mr_tip', bookingId, purpose: 'tip', payerUserId: CLIENT, amountCents: 500, status: 'processing', provider: 'stripe', providerRef: null, idempotencyKey: 'tmp-mr-tip', createdAt: at(-5 * MINUTE), updatedAt: at(-5 * MINUTE) });
    const event = { id: 'evt_tmp_mr_tip', type: 'payment_intent.succeeded', data: { object: { id: 'pi_tmp_mr_tip', object: 'payment_intent', metadata: { payment_id: 'pay_tmp_mr_tip' } } } };
    expect(await handleStripePaymentWebhook(deps, signedPayment(event), now)).toEqual({ status: 200, body: { ok: true } });
    expect((await db.select().from(payments).where(eq(payments.id, 'pay_tmp_mr_tip')))[0]).toMatchObject({ status: 'succeeded', providerRef: 'pi_tmp_mr_tip' });
    const tips = await db.select({ amountCents: earnings.amountCents }).from(earnings).where(and(eq(earnings.bookingId, bookingId), eq(earnings.kind, 'tip')));
    expect(tips).toEqual([{ amountCents: 500 }]);
    // Stripe sends it again: nothing more happens.
    await handleStripePaymentWebhook(deps, signedPayment(event), now);
    expect(await db.select().from(earnings).where(and(eq(earnings.bookingId, bookingId), eq(earnings.kind, 'tip')))).toHaveLength(1);
  });

  it('is given up after an hour, and refunded if it went through after all', async () => {
    const [booking] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.taskId, 'tsk_mr_1'));
    const processing = (id: string, ago: number) => ({ id, bookingId: booking!.id, purpose: 'change_funding', payerUserId: CLIENT, amountCents: 1200, status: 'processing', provider: 'stripe', providerRef: null, idempotencyKey: `tmp-${id}`, createdAt: at(-ago), updatedAt: at(-ago) });
    await db.insert(payments).values([processing('pay_tmp_mr_chg', 2 * 60 * MINUTE), processing('pay_tmp_mr_chg_young', 10 * MINUTE)]);
    expect(await cancelStaleCharges(db, now)).toBeGreaterThanOrEqual(1);
    const status = async (id: string) => (await db.select({ status: payments.status }).from(payments).where(eq(payments.id, id)))[0]?.status;
    expect(await status('pay_tmp_mr_chg')).toBe('canceled');
    expect(await status('pay_tmp_mr_chg_young')).toBe('processing');
    // The charge had gone through: its late event finds the row, and the money goes straight back.
    const event = { id: 'evt_tmp_mr_chg', type: 'payment_intent.succeeded', data: { object: { id: 'pi_tmp_mr_chg', object: 'payment_intent', metadata: { payment_id: 'pay_tmp_mr_chg' } } } };
    await handleStripePaymentWebhook(deps, signedPayment(event), now);
    await handleStripePaymentWebhook(deps, signedPayment(event), now);
    expect((await db.select().from(refunds).where(eq(refunds.paymentId, 'pay_tmp_mr_chg'))).map((row) => [row.amountCents, row.reason, row.status])).toEqual([[1200, 'late_capture', 'succeeded']]);
    expect(await status('pay_tmp_mr_chg')).toBe('refunded');
  });
});

describe('a staff form sent twice (MO10)', () => {
  it('refunds once', async () => {
    const [booking] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.taskId, 'tsk_mr_1'));
    const input = { amountCents: 500, reason: 'goodwill' as const, note: 'A scratch found after the visit.' };
    const results = await Promise.all([staffRefund(db, pay, alex, booking!.id, input, now), staffRefund(db, pay, alex, booking!.id, input, now)]);
    expect(results).toEqual([{ ok: true, code: 'submitted' }, { ok: true, code: 'submitted' }]);
    const goodwill = () => db.select({ amountCents: refunds.amountCents }).from(refunds).where(and(eq(refunds.bookingId, booking!.id), eq(refunds.reason, 'goodwill')));
    expect(await goodwill()).toEqual([{ amountCents: 500 }]);
    // Sent again a moment later (a resend after a slow answer): still once.
    expect(await staffRefund(db, pay, alex, booking!.id, input, at(MINUTE))).toEqual({ ok: true, code: 'submitted' });
    expect(await goodwill()).toHaveLength(1);
    // A different refund is its own.
    expect(await staffRefund(db, pay, alex, booking!.id, { ...input, note: 'And the second shelf was bent too.' }, now)).toEqual({ ok: true, code: 'submitted' });
    expect((await goodwill()).map((row) => row.amountCents)).toEqual([500, 500]);
  });

  it('reverses a transfer once', async () => {
    const [booking] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.taskId, 'tsk_mr_1'));
    await db.insert(earnings).values({ id: 'ern_tmp_mr_rev', bookingId: booking!.id, helperUserId: 'usr_jordan', kind: 'earnings', amountCents: 5400, status: 'transferred', transferRef: 'tr_tmp_mr_rev', transferredAt: now, createdAt: now, updatedAt: now });
    await db.insert(supportCases).values({ id: 'case_tmp_mr_rev', type: 'dispute', status: 'open', bookingId: booking!.id, openedByUserId: CLIENT, description: 'Paid twice for the same work.' });
    const input = { earningsId: 'ern_tmp_mr_rev', amountCents: 1000, caseId: 'case_tmp_mr_rev', reason: 'Paid twice for the same work.' };
    const results = await Promise.all([reverseTransfer(db, null, casey, booking!.id, input, now), reverseTransfer(db, null, casey, booking!.id, input, now)]);
    expect(results).toEqual([{ ok: true, code: 'updated' }, { ok: true, code: 'updated' }]);
    expect(await db.select().from(transferReversals).where(eq(transferReversals.earningsId, 'ern_tmp_mr_rev'))).toHaveLength(1);
    expect((await db.select({ status: earnings.status }).from(earnings).where(eq(earnings.id, 'ern_tmp_mr_rev')))[0]?.status).toBe('partially_reversed');
  });
});

describe('client credits (MO11)', () => {
  const credit = (userId: string) => ({ id: `crd_${userId}`, userId, kind: 'welcome', amountCents: 1000, remainingCents: 1000, expiresAt: at(30 * 24 * 60 * MINUTE), createdAt: now, updatedAt: now });

  it('are spent once when two bookings complete at the same moment', async () => {
    await db.insert(posterCredits).values(credit(CLIENT_B));
    const first = await bookedDesk(2, CLIENT_B);
    const second = await bookedDesk(3, CLIENT_B);
    await db.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: now }).where(inArray(bookings.id, [first, second]));
    await Promise.all([recordCompletionMoney(db, first, now, pay), recordCompletionMoney(db, second, now, pay)]);
    const used = await db.select({ amountCents: refunds.amountCents }).from(refunds).where(and(inArray(refunds.bookingId, [first, second]), eq(refunds.reason, 'poster_credit')));
    expect(used.reduce((sum, row) => sum + row.amountCents, 0)).toBe(1000);
    expect((await db.select({ remaining: posterCredits.remainingCents }).from(posterCredits).where(eq(posterCredits.userId, CLIENT_B)))[0]?.remaining).toBe(0);
  });

  it('come back when the refund fails, and leave room for what the platform already gave back', async () => {
    await db.insert(posterCredits).values(credit(CLIENT_C));
    const failing = await bookedDesk(4, CLIENT_C);
    const charge = await chargeOf(failing);
    const broken: PaymentProvider = { ...pay, refund: vi.fn(async () => Promise.reject(new Error('Stripe did not answer'))) };
    expect(await redeemCredits(db, broken, { bookingId: failing, posterUserId: CLIENT_C, charge: { id: charge.id, providerRef: charge.providerRef! }, capCents: 900 }, now)).toBe(0);
    expect(await availableCredit(db, CLIENT_C, now)).toMatchObject({ amountCents: 1000 });
    expect((await db.select({ status: refunds.status }).from(refunds).where(and(eq(refunds.bookingId, failing), eq(refunds.reason, 'poster_credit')))).map((row) => row.status)).toEqual(['failed']);
    expect(await db.select().from(creditRedemptions).where(eq(creditRedemptions.bookingId, failing))).toHaveLength(0);

    // $9.00 earned here, but $8.00 already went back from the platform's own funds: $1.00 of credit fits.
    const capped = await bookedDesk(5, CLIENT_C);
    const cappedCharge = await chargeOf(capped);
    await db.insert(refunds).values({ id: 'ref_tmp_mr_11', paymentId: cappedCharge.id, bookingId: capped, amountCents: 800, reason: 'goodwill', status: 'succeeded', providerRef: 're_tmp_mr_11', idempotencyKey: 'tmp-mr-11-goodwill', createdAt: now });
    expect(await redeemCredits(db, pay, { bookingId: capped, posterUserId: CLIENT_C, charge: { id: cappedCharge.id, providerRef: cappedCharge.providerRef! }, capCents: 900 }, now)).toBe(100);
    expect(await availableCredit(db, CLIENT_C, now)).toMatchObject({ amountCents: 900 });
  });
});

describe('one row per payout (MO12)', () => {
  const rowsFor = (ref: string) => db.select().from(payouts).where(eq(payouts.providerRef, ref));

  it('when Stripe’s event comes before the instant payout’s own row', async () => {
    expect(await handleConnectWebhook(db, signedConnect(payoutEvent(ACCOUNT, 'po_tmp_mr_a', 5000, 'paid')), now)).toEqual({ status: 200, body: { ok: true } });
    instant = { availableCents: 5000, payoutId: 'po_tmp_mr_a' };
    expect(await requestInstantPayout(db, connect, HELPER, now)).toEqual({ ok: true, code: 'submitted' });
    const rows = await rowsFor('po_tmp_mr_a');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'paid', method: 'instant', feeCents: 75, amountCents: 5000 });
  });

  it('when the instant payout’s row comes first', async () => {
    instant = { availableCents: 3000, payoutId: 'po_tmp_mr_b' };
    expect(await requestInstantPayout(db, connect, HELPER, now)).toEqual({ ok: true, code: 'submitted' });
    expect(await handleConnectWebhook(db, signedConnect(payoutEvent(ACCOUNT, 'po_tmp_mr_b', 3000, 'paid')), now)).toEqual({ status: 200, body: { ok: true } });
    const rows = await rowsFor('po_tmp_mr_b');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'paid', method: 'instant', feeCents: 50 });
  });

  it('merges rows recorded twice before 0067, and stops on rows that disagree (the migration)', async () => {
    const merge = statementOf('DO $$');
    const dup = (id: string, amountCents: number, extra: Partial<typeof payouts.$inferInsert>) => ({ id, helperUserId: PAYEE, amountCents, status: 'in_transit', arrivalDate: '2026-11-21', bankLast4: '', providerRef: 'po_tmp_mr_dup', createdAt: now, updatedAt: now, ...extra });
    await rolledBack(async (tx) => {
      await tx.execute(sql`drop index payouts_provider_ref_idx`);
      await tx.insert(payouts).values([dup('po_tmp_mr_dup_1', 3000, { method: 'instant', feeCents: 50, updatedAt: at(-MINUTE) }), dup('po_tmp_mr_dup_2', 3000, { status: 'paid' })]);
      await tx.insert(earnings).values({ id: 'ern_tmp_mr_dup', bookingId: 'bkg_tmp_mr_dup', helperUserId: PAYEE, kind: 'earnings', amountCents: 3000, status: 'paid_out', transferRef: 'tr_tmp_mr_dup', transferredAt: now, payoutId: 'po_tmp_mr_dup_1', createdAt: now, updatedAt: now });
      await tx.execute(sql.raw(merge));
      // The row Stripe updated last stays, with the instant payout's method and fee; the earnings follow it.
      expect(await tx.select({ id: payouts.id, status: payouts.status, method: payouts.method, feeCents: payouts.feeCents }).from(payouts).where(eq(payouts.providerRef, 'po_tmp_mr_dup'))).toEqual([
        { id: 'po_tmp_mr_dup_2', status: 'paid', method: 'instant', feeCents: 50 },
      ]);
      expect((await tx.select({ payoutId: earnings.payoutId }).from(earnings).where(eq(earnings.id, 'ern_tmp_mr_dup')))[0]?.payoutId).toBe('po_tmp_mr_dup_2');
      const [audited] = await tx.select().from(auditLog).where(eq(auditLog.action, 'payouts.duplicates_merged'));
      expect(audited?.metadata).toEqual({ merged: 1, references: ['po_tmp_mr_dup'] });
    });
    await rolledBack(async (tx) => {
      await tx.execute(sql`drop index payouts_provider_ref_idx`);
      await tx.insert(payouts).values([dup('po_tmp_mr_dup_3', 3000, {}), dup('po_tmp_mr_dup_4', 3100, {})]);
      await expect(tx.execute(sql.raw(merge))).rejects.toThrow(/different amounts/);
    });
    // The index is back after the rollback.
    const [index] = (await db.execute(sql`select indexdef from pg_indexes where indexname = 'payouts_provider_ref_idx'`)).rows as { indexdef: string }[];
    expect(index?.indexdef).toMatch(/UNIQUE INDEX .* WHERE \(provider_ref IS NOT NULL\)/);
  });
});

describe('a paid payout (MO13)', () => {
  it('claims only the earnings its amount holds, and a bounce gives back exactly those', async () => {
    const row = (id: string, amountCents: number, ago: number) => ({ id, bookingId: `bkg_${id}`, helperUserId: PAYEE, kind: 'earnings', amountCents, status: 'transferred', transferRef: `tr_${id}`, transferredAt: at(-ago), createdAt: at(-ago), updatedAt: at(-ago) });
    await db.insert(earnings).values([row('ern_tmp_mr_13a', 3000, 180 * MINUTE), row('ern_tmp_mr_13b', 2000, 120 * MINUTE), row('ern_tmp_mr_13c', 4000, 60 * MINUTE)]);
    const states = async () =>
      Object.fromEntries(
        (await db.select({ id: earnings.id, status: earnings.status, payoutId: earnings.payoutId }).from(earnings).where(like(earnings.id, 'ern\\_tmp\\_mr\\_13%'))).map((r) => [r.id, `${r.status}${r.payoutId ? ' (linked)' : ''}`]),
      );
    await handleConnectWebhook(db, signedConnect(payoutEvent(PAYEE_ACCOUNT, 'po_tmp_mr_13', 5000, 'paid')), now);
    expect(await states()).toEqual({ ern_tmp_mr_13a: 'paid_out (linked)', ern_tmp_mr_13b: 'paid_out (linked)', ern_tmp_mr_13c: 'transferred' });
    // The bank returned it: the two it carried are waiting again, and the third never left.
    await handleConnectWebhook(db, signedConnect(payoutEvent(PAYEE_ACCOUNT, 'po_tmp_mr_13', 5000, 'failed')), now);
    expect(await states()).toEqual({ ern_tmp_mr_13a: 'transferred', ern_tmp_mr_13b: 'transferred', ern_tmp_mr_13c: 'transferred' });
  });
});
