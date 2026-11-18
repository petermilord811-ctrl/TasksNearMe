import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevBilling } from '@/integrations/billing';
import { subscriptionFromStripe } from '@/integrations/billing/stripe-billing';
import { createDevPaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { aiUsage, billingCustomers, subscriptions } from '@/modules/billing/schema';
import { activePlans, aiSearchAccess, endSubscriptionsOf, openPortal, planPageData, startCheckout, syncSubscription, consumeAiSearch } from '@/modules/billing/service';
import { confirmBooking, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookings } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { getReceiptPage, recordCompletionMoney } from '@/modules/earnings/service';
import { DEFAULT_PLANS } from '@/modules/markets/policy-defaults';
import { marketPolicies } from '@/modules/markets/schema';
import { offers } from '@/modules/offers/schema';
import { refunds } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

/** The optional plans (completion plan 9.13): the stand-in checkout, AI search counts, and the fee rebates. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_tmp_plans_client';
const HELPER = 'usr_tmp_plans_helper';
const billing = createDevBilling();
const deps = { db, payments: createDevPaymentProvider() };
const now = new Date();
let policyVersionId = '';
let originalPlans: (typeof marketPolicies.$inferSelect)['plans'] = null;

async function copyDesk(taskId: string, offerId: string) {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  await db.insert(tasks).values({ ...desk!, id: taskId, slug: `${taskId}-slug`, posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer!, id: offerId, taskId, status: 'pending', revision: 1, expiresAt: new Date(now.getTime() + 86_400_000) });
}

/** Books a copy of the desk task and completes it with the temporary helper. */
async function completedBooking(n: number): Promise<string> {
  await copyDesk(`tsk_plans_${n}`, `off_plans_${n}`);
  const page = await getBookingConfirmPage(deps, CLIENT, `tsk_plans_${n}`, `off_plans_${n}`, now);
  if (page?.kind !== 'page') throw new Error('expected the confirm page');
  const booked = await confirmBooking(deps, CLIENT, `tsk_plans_${n}`, `off_plans_${n}`, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now);
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  const bookingId = booked.redirectTo.split('/').pop()!;
  await db.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: now, helperUserId: HELPER }).where(eq(bookings.id, bookingId));
  const [row] = await db.select({ policyVersionId: bookings.policyVersionId }).from(bookings).where(eq(bookings.id, bookingId));
  policyVersionId = row!.policyVersionId;
  return bookingId;
}

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  await db.insert(users).values({ ...maya!, id: CLIENT, email: 'tmp-plans-client@example.test', name: 'Pia P.', firstName: 'Pia', lastName: 'Park', phone: '+15125550671' });
  await db.insert(users).values({ ...jordan!, id: HELPER, email: 'tmp-plans-helper@example.test', name: 'Hal H.', firstName: 'Hal', lastName: 'Hart', phone: '+15125550672' });
});

afterAll(async () => {
  if (policyVersionId) await db.update(marketPolicies).set({ plans: originalPlans }).where(eq(marketPolicies.id, policyVersionId));
  await db.delete(subscriptions).where(inArray(subscriptions.userId, [CLIENT, HELPER]));
  await db.delete(billingCustomers).where(inArray(billingCustomers.userId, [CLIENT, HELPER]));
  await db.delete(aiUsage).where(inArray(aiUsage.userId, [CLIENT, HELPER]));
  await pool.end();
});

describe('plans', () => {
  it('subscribes at once with the stand-in, refuses the same plan twice, and lists it on the page', async () => {
    expect(await startCheckout(db, billing, CLIENT, { plan: 'plus', interval: 'month' }, now)).toEqual({ ok: true, code: 'updated', redirectTo: '/app/plan?checkout=done' });
    expect(await startCheckout(db, billing, CLIENT, { plan: 'plus', interval: 'year' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await startCheckout(db, null, CLIENT, { plan: 'pro', interval: 'month' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect([...(await activePlans(db, CLIENT, now)).keys()]).toEqual(['plus']);
    const page = await planPageData(db, billing, CLIENT, 'client', now);
    expect(page?.offers.map((offer) => offer.plan)).toEqual(['plus', 'pro']);
    expect(page?.memberships).toEqual([{ plan: 'plus', interval: 'month', priceCents: DEFAULT_PLANS.plus.monthlyCents, status: 'active', periodEnd: expect.any(String), cancelAtPeriodEnd: false, rebatedThisMonthCents: 0 }]);
    expect(page?.unavailable).toBeUndefined();
    expect((await planPageData(db, null, CLIENT, 'client', now))?.unavailable).toBe(true);
  });

  it('cancels at the end of the period with the stand-in portal, and keeps it when asked again', async () => {
    expect(await openPortal(db, billing, CLIENT, now)).toEqual({ ok: true, code: 'updated', redirectTo: '/app/plan' });
    expect((await activePlans(db, CLIENT, now)).get('plus')?.cancelAtPeriodEnd).toBe(true);
    await openPortal(db, billing, CLIENT, now);
    expect((await activePlans(db, CLIENT, now)).get('plus')?.cancelAtPeriodEnd).toBe(false);
    expect(await openPortal(db, billing, HELPER, now)).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('counts AI searches against the month’s allowance: 5 without a plan, 100 with one', async () => {
    const free = DEFAULT_PLANS.free.aiSearchesPerMonth;
    expect(await aiSearchAccess(db, HELPER, now)).toMatchObject({ allowed: true, remaining: free, resetsAt: expect.any(String) });
    for (let i = 1; i <= free; i += 1) expect(await consumeAiSearch(db, HELPER, now)).toEqual({ ok: true, remaining: free - i });
    expect(await consumeAiSearch(db, HELPER, now)).toEqual({ ok: false, reason: 'monthly_limit' });
    expect(await aiSearchAccess(db, HELPER, now)).toMatchObject({ allowed: false, reason: 'monthly_limit', remaining: 0 });
    // A refused search isn't counted.
    const [row] = await db.select({ count: aiUsage.count }).from(aiUsage).where(eq(aiUsage.userId, HELPER));
    expect(row?.count).toBe(free);
    // Pro raises it.
    await startCheckout(db, billing, HELPER, { plan: 'pro', interval: 'year' }, now);
    expect(await aiSearchAccess(db, HELPER, now)).toMatchObject({ allowed: true, remaining: DEFAULT_PLANS.pro.aiSearchesPerMonth - free });
  });

  it('pays half of each side’s fee back at completion, once, and says the cap on the receipt', async () => {
    const bookingId = await completedBooking(1);
    await recordCompletionMoney(db, bookingId, now, deps.payments);
    await recordCompletionMoney(db, bookingId, now, deps.payments);
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(booking).toBeTruthy();
    const back = await db.select().from(refunds).where(and(eq(refunds.bookingId, bookingId), eq(refunds.reason, 'plan_rebate')));
    expect(back).toHaveLength(1);
    // The desk task: $60, a $6 client fee and a $6 helper fee.
    expect(back[0]).toMatchObject({ amountCents: 300, status: 'succeeded', idempotencyKey: `plan_rebate:${bookingId}` });
    const rebate = await db.select().from(earnings).where(and(eq(earnings.bookingId, bookingId), eq(earnings.kind, 'fee_rebate')));
    expect(rebate).toHaveLength(1);
    expect(rebate[0]).toMatchObject({ helperUserId: HELPER, amountCents: 300 });
    const receipt = await getReceiptPage(db, CLIENT, bookingId);
    expect(receipt?.lines.find((line) => line.reason === 'plan_rebate')).toMatchObject({ kind: 'refund', amountCents: 300, rebateCapCents: DEFAULT_PLANS.plus.rebateMonthlyCapCents });
    const page = await planPageData(db, billing, HELPER, 'helper', now);
    expect(page?.memberships[0]).toMatchObject({ plan: 'pro', rebatedThisMonthCents: 300 });
    expect(page?.estimates.find((estimate) => estimate.plan === 'pro')).toMatchObject({ bookings: 1, savedCents: 300 });
  });

  it('stops at the month’s cap', async () => {
    // A small cap on this policy version for the test: 400 a month on each side, 300 already paid back.
    const [policy] = await db.select({ plans: marketPolicies.plans }).from(marketPolicies).where(eq(marketPolicies.id, policyVersionId));
    originalPlans = policy?.plans ?? null;
    await db.update(marketPolicies).set({ plans: { ...DEFAULT_PLANS, plus: { ...DEFAULT_PLANS.plus, rebateMonthlyCapCents: 400 }, pro: { ...DEFAULT_PLANS.pro, rebateMonthlyCapCents: 400 } } }).where(eq(marketPolicies.id, policyVersionId));
    const bookingId = await completedBooking(2);
    await recordCompletionMoney(db, bookingId, now, deps.payments);
    expect((await db.select().from(refunds).where(and(eq(refunds.bookingId, bookingId), eq(refunds.reason, 'plan_rebate'))))[0]?.amountCents).toBe(100);
    expect((await db.select().from(earnings).where(and(eq(earnings.bookingId, bookingId), eq(earnings.kind, 'fee_rebate'))))[0]?.amountCents).toBe(100);
    // At the cap: nothing more this month.
    const third = await completedBooking(3);
    await recordCompletionMoney(db, third, now, deps.payments);
    expect(await db.select().from(refunds).where(and(eq(refunds.bookingId, third), eq(refunds.reason, 'plan_rebate')))).toHaveLength(0);
    expect(await db.select().from(earnings).where(and(eq(earnings.bookingId, third), eq(earnings.kind, 'fee_rebate')))).toHaveLength(0);
  });

  it('mirrors Stripe’s subscription from its events, and ignores ones that aren’t ours', async () => {
    const stripeSub = (status: string, extra: Record<string, unknown> = {}) =>
      subscriptionFromStripe({ id: 'sub_test_plans', customer: 'cus_test_plans', status, cancel_at_period_end: false, metadata: { userId: CLIENT, plan: 'pro', interval: 'month', marketId: 'mkt_austin' }, items: { data: [{ current_period_end: Math.floor(now.getTime() / 1000) + 86_400 * 30, price: { unit_amount: 799, recurring: { interval: 'month' } } }] }, ...extra });
    expect(await syncSubscription(db, stripeSub('active'), now)).toBe(true);
    expect((await activePlans(db, CLIENT, now)).get('pro')).toMatchObject({ provider: 'stripe', priceCents: 799, status: 'active' });
    expect(await syncSubscription(db, stripeSub('canceled', { ended_at: Math.floor(now.getTime() / 1000) }), now)).toBe(true);
    expect((await activePlans(db, CLIENT, now)).has('pro')).toBe(false);
    expect(await db.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, 'sub_test_plans'))).toHaveLength(1);
    expect(await syncSubscription(db, subscriptionFromStripe({ id: 'sub_other', status: 'active', metadata: { plan: 'pro' } }), now)).toBe(false);
    expect(await syncSubscription(db, subscriptionFromStripe({ id: 'sub_other', status: 'active', metadata: { userId: 'usr_nobody', plan: 'pro' } }), now)).toBe(false);
  });

  it('ends every plan when the account is deleted', async () => {
    await endSubscriptionsOf(db, billing, HELPER, now);
    expect((await activePlans(db, HELPER, now)).size).toBe(0);
    expect((await db.select({ status: subscriptions.status }).from(subscriptions).where(eq(subscriptions.userId, HELPER))).map((row) => row.status)).toEqual(['canceled']);
  });
});
