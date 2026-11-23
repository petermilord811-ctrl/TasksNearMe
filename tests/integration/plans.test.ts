import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevBilling, type BillingProvider, type BillingSubscription } from '@/integrations/billing';
import { subscriptionFromStripe } from '@/integrations/billing/stripe-billing';
import { createDevPaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { aiUsage, billingCustomers, subscriptions } from '@/modules/billing/schema';
import { activePlans, aiSearchAccess, consumeAiSearch, endSubscriptionsOf, openPortal, planPageData, releaseAiSearch, startCheckout, stopRenewalsOf, syncSubscription } from '@/modules/billing/service';
import { confirmBooking, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookings, bookingTerms } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { getReceiptPage, recordCompletionMoney } from '@/modules/earnings/service';
import { legacyDeskBreakdown } from '@/fixtures';
import { DEFAULT_PLANS } from '@/modules/markets/policy-defaults';
import { marketPolicies } from '@/modules/markets/schema';
import { offers } from '@/modules/offers/schema';
import { refunds } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

/**
 * The optional plans (completion plan 9.13; LinkedIn-Premium-style since 2026-11-23): the stand-in checkout, AI search
 * counts, the Plus hold-fee waiver, and the fee rebates still owed on bookings made under the service fees before.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_tmp_plans_client';
const HELPER = 'usr_tmp_plans_helper';
const billing = createDevBilling();
const deps = { db, payments: createDevPaymentProvider() };
const now = new Date();
let policyVersionId = '';
const LEGACY_POLICY = 'pol_tmp_plans_legacy';

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
  // The legacy policy version goes, its bookings back on the current one.
  if (policyVersionId) await db.update(bookings).set({ policyVersionId }).where(eq(bookings.policyVersionId, LEGACY_POLICY));
  await db.delete(marketPolicies).where(eq(marketPolicies.id, LEGACY_POLICY));
  await db.delete(subscriptions).where(inArray(subscriptions.userId, [CLIENT, HELPER]));
  await db.delete(billingCustomers).where(inArray(billingCustomers.userId, [CLIENT, HELPER]));
  await db.delete(aiUsage).where(inArray(aiUsage.userId, [CLIENT, HELPER]));
  await pool.end();
});

describe('plans', () => {
  it('subscribes at once with the stand-in, refuses the same plan twice, and lists it on the page', async () => {
    expect(await startCheckout(db, billing, CLIENT, { plan: 'plus', interval: 'month' }, now)).toEqual({ ok: true, code: 'updated', redirectTo: '/app/plan?checkout=done&plan=plus' });
    expect(await startCheckout(db, billing, CLIENT, { plan: 'plus', interval: 'year' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await startCheckout(db, null, CLIENT, { plan: 'pro', interval: 'month' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect([...(await activePlans(db, CLIENT, now)).keys()]).toEqual(['plus']);
    const page = await planPageData(db, billing, CLIENT, 'client', now);
    expect(page?.offers.map((offer) => offer.plan)).toEqual(['plus', 'pro']);
    expect(page?.memberships).toEqual([{ plan: 'plus', interval: 'month', priceCents: DEFAULT_PLANS.plus.monthlyCents, status: 'active', periodEnd: expect.any(String), cancelAtPeriodEnd: false }]);
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

  it('a Plus member pays no hold fee, and nothing is paid back at completion (no service fees, 2026-11-23)', async () => {
    // The client holds Plus (the first test), the helper Pro: the desk is held by TasksNearMe, with no fee at all.
    const bookingId = await completedBooking(1);
    const [terms] = await db.select({ breakdown: bookingTerms.breakdown }).from(bookingTerms).where(eq(bookingTerms.bookingId, bookingId));
    expect(terms?.breakdown).toMatchObject({ taskPriceCents: 6000, posterFeeCents: 0, helperFeeCents: 0, posterTotalCents: 6000, helperEarningsCents: 6000 });
    await recordCompletionMoney(db, bookingId, now, deps.payments);
    expect(await db.select().from(refunds).where(and(eq(refunds.bookingId, bookingId), eq(refunds.reason, 'plan_rebate')))).toHaveLength(0);
    expect(await db.select().from(earnings).where(and(eq(earnings.bookingId, bookingId), eq(earnings.kind, 'fee_rebate')))).toHaveLength(0);
    // The helper gets the whole price.
    expect((await db.select().from(earnings).where(and(eq(earnings.bookingId, bookingId), eq(earnings.kind, 'earnings'))))[0]?.amountCents).toBe(6000);
    const page = await planPageData(db, billing, HELPER, 'helper', now);
    expect(page?.offers.map((offer) => offer.plan)).toEqual(['pro', 'plus']);
    expect(page?.memberships).toEqual([{ plan: 'pro', interval: 'year', priceCents: expect.any(Number), status: 'active', periodEnd: expect.any(String), cancelAtPeriodEnd: false }]);
    expect(page).not.toHaveProperty('estimates');
  });

  it('still pays back a booking made under the service fees before 2026-11-23, within the month’s cap', async () => {
    // A policy version from before: 10% each side, half back with a plan, up to $4 a month on each side.
    const [current] = await db.select().from(marketPolicies).where(eq(marketPolicies.id, policyVersionId));
    await db.insert(marketPolicies).values({
      ...current!,
      id: LEGACY_POLICY,
      version: 9_000,
      status: 'retired',
      fees: { posterBps: 1000, posterMinCents: 300, helperBps: 1000 },
      plans: { ...DEFAULT_PLANS, plus: { ...DEFAULT_PLANS.plus, posterFeeRebateBps: 5000, rebateMonthlyCapCents: 400 }, pro: { ...DEFAULT_PLANS.pro, helperFeeRebateBps: 5000, rebateMonthlyCapCents: 400 } },
    });
    const legacyBooking = async (n: number) => {
      const bookingId = await completedBooking(n);
      await db.update(bookings).set({ policyVersionId: LEGACY_POLICY }).where(eq(bookings.id, bookingId));
      await db.update(bookingTerms).set({ breakdown: legacyDeskBreakdown }).where(eq(bookingTerms.bookingId, bookingId));
      await recordCompletionMoney(db, bookingId, now, deps.payments);
      await recordCompletionMoney(db, bookingId, now, deps.payments);
      const back = await db.select().from(refunds).where(and(eq(refunds.bookingId, bookingId), eq(refunds.reason, 'plan_rebate')));
      const rebate = await db.select().from(earnings).where(and(eq(earnings.bookingId, bookingId), eq(earnings.kind, 'fee_rebate')));
      return { bookingId, back: back.map((row) => row.amountCents), rebate: rebate.map((row) => row.amountCents) };
    };
    // Half of each $6 fee, once.
    const first = await legacyBooking(2);
    expect(first).toMatchObject({ back: [300], rebate: [300] });
    const receipt = await getReceiptPage(db, CLIENT, first.bookingId);
    expect(receipt?.lines.find((line) => line.reason === 'plan_rebate')).toMatchObject({ kind: 'refund', amountCents: 300, rebateCapCents: 400 });
    // Then only what's left of the cap, then nothing this month.
    expect(await legacyBooking(3)).toMatchObject({ back: [100], rebate: [100] });
    expect(await legacyBooking(4)).toMatchObject({ back: [], rebate: [] });
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

  it('gives back a search that couldn’t run, never below zero', async () => {
    const before = (await aiSearchAccess(db, HELPER, now)).remaining ?? 0;
    expect(await consumeAiSearch(db, HELPER, now)).toMatchObject({ ok: true });
    await releaseAiSearch(db, HELPER, now);
    expect((await aiSearchAccess(db, HELPER, now)).remaining).toBe(before);
    await releaseAiSearch(db, CLIENT, now);
    const [row] = await db.select({ count: aiUsage.count }).from(aiUsage).where(eq(aiUsage.userId, CLIENT));
    expect(row?.count ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('with Stripe: a plan live at Stripe (paid before its webhook) blocks a second checkout and shows up mirrored', async () => {
    const live: BillingSubscription = { id: 'sub_fake_live', customerId: 'cus_fake', status: 'active', currentPeriodEnd: new Date(now.getTime() + 20 * 86_400_000), cancelAtPeriodEnd: false, endedAt: null, interval: 'month', unitAmountCents: 499, metadata: { userId: CLIENT, plan: 'plus', interval: 'month', marketId: 'mkt_austin' } };
    const remote: BillingSubscription[] = [live];
    const canceled: string[] = [];
    const renewalsStopped: string[] = [];
    let checkouts = 0;
    const stripe: BillingProvider = {
      name: 'stripe',
      createCustomer: async () => ({ customerId: 'cus_fake' }),
      createCheckout: async () => {
        checkouts += 1;
        return { url: 'https://checkout.stripe.test/cs', sessionId: 'cs_fake' };
      },
      createPortal: async () => ({ url: 'https://billing.stripe.test/p' }),
      getSubscription: async () => live,
      listSubscriptions: async () => remote,
      cancelAtPeriodEnd: async (id) => {
        renewalsStopped.push(id);
      },
      cancelNow: async (id) => {
        canceled.push(id);
      },
    };
    // The client's dev plans from the earlier tests are gone first, so only Stripe's matters here.
    await db.delete(subscriptions).where(eq(subscriptions.userId, CLIENT));
    await db.delete(billingCustomers).where(eq(billingCustomers.userId, CLIENT));
    expect(await startCheckout(db, stripe, CLIENT, { plan: 'plus', interval: 'year' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(checkouts).toBe(0);
    expect((await activePlans(db, CLIENT, now)).get('plus')).toMatchObject({ provider: 'stripe', providerSubscriptionId: 'sub_fake_live' });
    // Another plan still opens Checkout.
    expect(await startCheckout(db, stripe, CLIENT, { plan: 'pro', interval: 'month' }, now)).toEqual({ ok: true, code: 'updated', redirectTo: 'https://checkout.stripe.test/cs' });
    // The page: Plus is held; back from paying for Pro before its webhook, Pro shows as confirming.
    const page = await planPageData(db, stripe, CLIENT, 'client', now, { notice: 'subscribed', plan: 'pro' });
    expect(page?.confirming).toBe('pro');
    expect(page?.portal).toBe(true);
    // Once Stripe holds Pro, the return reads it from Stripe (2026-11-21): held at once, with no webhook at all.
    remote.push({ ...live, id: 'sub_fake_pro', unitAmountCents: 799, metadata: { userId: CLIENT, plan: 'pro', interval: 'month', marketId: 'mkt_austin' } });
    expect((await activePlans(db, CLIENT, now)).has('pro')).toBe(false);
    const back = await planPageData(db, stripe, CLIENT, 'client', now, { notice: 'subscribed', plan: 'pro' });
    expect(back?.confirming).toBeUndefined();
    expect(back?.memberships.find((membership) => membership.plan === 'pro')).toMatchObject({ status: 'active', priceCents: 799 });
    // A plain visit doesn't ask Stripe (only the return does).
    remote.length = 0;
    expect((await planPageData(db, stripe, CLIENT, 'client', now))?.memberships.map((membership) => membership.plan).sort()).toEqual(['plus', 'pro']);
    remote.push(live, { ...live, id: 'sub_fake_pro', unitAmountCents: 799, metadata: { userId: CLIENT, plan: 'pro', interval: 'month', marketId: 'mkt_austin' } });
    // A deletion asked for: nothing renews meanwhile. Done: everything live ends at Stripe.
    await stopRenewalsOf(db, stripe, CLIENT, now);
    expect(renewalsStopped.sort()).toEqual(['sub_fake_live', 'sub_fake_pro']);
    expect((await activePlans(db, CLIENT, now)).get('plus')?.cancelAtPeriodEnd).toBe(true);
    await endSubscriptionsOf(db, stripe, CLIENT, now);
    expect(canceled.sort()).toEqual(['sub_fake_live', 'sub_fake_pro']);
    expect((await activePlans(db, CLIENT, now)).size).toBe(0);
  });

  it('shows an unpaid plan as on hold, with Manage, and not as held', async () => {
    await syncSubscription(db, { id: 'sub_fake_unpaid', customerId: 'cus_fake', status: 'unpaid', currentPeriodEnd: new Date(now.getTime() + 86_400_000), cancelAtPeriodEnd: false, endedAt: null, interval: 'month', unitAmountCents: 799, metadata: { userId: CLIENT, plan: 'pro', interval: 'month', marketId: 'mkt_austin' } }, now);
    const page = await planPageData(db, billing, CLIENT, 'client', now);
    expect(page?.memberships.find((membership) => membership.plan === 'pro')).toMatchObject({ status: 'unpaid' });
    expect((await activePlans(db, CLIENT, now)).has('pro')).toBe(false);
    // Unpaid but live: no second checkout for it either.
    expect(await startCheckout(db, billing, CLIENT, { plan: 'pro', interval: 'month' }, now)).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('ends every plan when the account is deleted', async () => {
    await endSubscriptionsOf(db, billing, HELPER, now);
    expect((await activePlans(db, HELPER, now)).size).toBe(0);
    expect((await db.select({ status: subscriptions.status }).from(subscriptions).where(eq(subscriptions.userId, HELPER))).map((row) => row.status)).toEqual(['canceled']);
  });
});
