import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { PLAN_CODES, PLAN_INTERVALS, routes, type AiSearchAccess, type AiSearchBlock, type ActionResult, type Cents, type PlanCheckoutInput, type PlanCode, type PlanEstimate, type PlanMembership, type PlanPageData } from '@/contracts';
import { aiWritingSetUp } from '@/integrations/ai';
import type { BillingProvider, BillingSubscription } from '@/integrations/billing';
import { subscriptionFromStripe } from '@/integrations/billing/stripe-billing';
import { appUrl } from '@/integrations/oauth';
import type { PaymentProvider } from '@/integrations/payments';
import { verifyStripeSignature } from '@/integrations/stripe-identity';
import { users } from '@/modules/accounts/schema';
import { bookingCompletions, bookings, bookingTerms } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { DEFAULT_FEES, DEFAULT_PLANS } from '@/modules/markets/policy-defaults';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { marketPolicies, type FeeSchedule, type PlanPolicy } from '@/modules/markets/schema';
import { userTimeZone } from '@/modules/markets/time-zone';
import { payments, refunds } from '@/modules/payments/schema';
import { marketMonthStart, nextMarketMonthStart } from '@/modules/rewards/domain';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { marketDayKey } from '@/shared/format';
import { aiSearchLimit, bookingRebateCents, estimatedRebateCents, periodEndAfter, planCounts, planOffers, PLAN_PRODUCT_NAMES, subscriptionLive } from './domain';
import { aiUsage, billingCustomers, subscriptions } from './schema';

/**
 * Subscription plans (completion plan 9.13; decisions.md 2026-11-18): who holds which plan, what it allows, checkout
 * and the portal, Stripe's subscription events, and the fee rebates paid at completion.
 */

type SubscriptionRow = typeof subscriptions.$inferSelect;
const DAY = 86_400_000;

// ---- Policy ---------------------------------------------------------------------------------------------------

/** The plans and fees of a market's published policy (the defaults where it has none). */
export async function marketPlans(db: Db, marketId: string): Promise<{ plans: PlanPolicy; fees: FeeSchedule }> {
  const policy = await getPublishedPolicy(marketId, db);
  return { plans: policy?.plans ?? DEFAULT_PLANS, fees: policy?.fees ?? DEFAULT_FEES };
}

/** The plans of the policy version a booking was confirmed under. */
export async function versionPlans(db: Db, policyVersionId: string): Promise<PlanPolicy> {
  const [row] = await db.select({ plans: marketPolicies.plans }).from(marketPolicies).where(eq(marketPolicies.id, policyVersionId)).limit(1);
  return row?.plans ?? DEFAULT_PLANS;
}

// ---- Who holds what -------------------------------------------------------------------------------------------

/** The person's plans that count now, by plan (the latest subscription of each; a renewing one gets a short grace). */
export async function activePlans(db: Db, userId: string, now: Date): Promise<Map<PlanCode, SubscriptionRow>> {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.currentPeriodEnd));
  const held = new Map<PlanCode, SubscriptionRow>();
  for (const row of rows) {
    const plan = row.plan as PlanCode;
    if (!held.has(plan) && planCounts(row, now)) held.set(plan, row);
  }
  return held;
}

/** Subscriptions that haven't ended (counting, or waiting on a payment), newest first. */
async function liveRows(db: Pick<Db, 'select'>, userId: string): Promise<SubscriptionRow[]> {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.currentPeriodEnd));
  return rows.filter((row) => subscriptionLive(row.status));
}

async function homeMarketOf(db: Db, userId: string) {
  const [user] = await db.select({ marketId: users.homeMarketId, email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

// ---- AI search ------------------------------------------------------------------------------------------------

const AI_SEARCH = 'ai_search';

async function aiSearchState(db: Db, userId: string, now: Date) {
  const user = await homeMarketOf(db, userId);
  const timeZone = await userTimeZone(db, userId);
  const period = marketDayKey(now, timeZone).slice(0, 7);
  const [{ plans }, held] = await Promise.all([marketPlans(db, user?.marketId ?? ''), activePlans(db, userId, now)]);
  const limit = aiSearchLimit(plans, [...held.keys()]);
  const resetsAt = nextMarketMonthStart(now, timeZone).toISOString();
  return { period, limit, resetsAt, hasPlan: held.size > 0 };
}

const blocked = (limit: number, hasPlan: boolean): AiSearchBlock => (limit <= 0 && !hasPlan ? 'needs_plan' : 'monthly_limit');

/** Whether "describe what you need" can run for this person now, and how many searches are left this month. */
export async function aiSearchAccess(db: Db, userId: string, now: Date): Promise<AiSearchAccess> {
  if (!aiWritingSetUp()) return { allowed: false, reason: 'ai_off', remaining: null };
  const state = await aiSearchState(db, userId, now);
  const [row] = await db.select({ count: aiUsage.count }).from(aiUsage).where(and(eq(aiUsage.userId, userId), eq(aiUsage.feature, AI_SEARCH), eq(aiUsage.period, state.period))).limit(1);
  const remaining = Math.max(0, state.limit - (row?.count ?? 0));
  return remaining > 0 ? { allowed: true, remaining, resetsAt: state.resetsAt } : { allowed: false, reason: blocked(state.limit, state.hasPlan), remaining: 0, resetsAt: state.resetsAt };
}

/**
 * Counts one AI search, right before it runs: one statement checks the month's count against the limit and adds one,
 * so two tabs can't overspend. Not counted when refused.
 */
export async function consumeAiSearch(db: Db, userId: string, now: Date): Promise<{ ok: true; remaining: number | null } | { ok: false; reason: AiSearchBlock }> {
  if (!aiWritingSetUp()) return { ok: false, reason: 'ai_off' };
  const state = await aiSearchState(db, userId, now);
  if (state.limit <= 0) return { ok: false, reason: blocked(state.limit, state.hasPlan) };
  const [row] = await db
    .insert(aiUsage)
    .values({ userId, feature: AI_SEARCH, period: state.period, count: 1, updatedAt: now })
    .onConflictDoUpdate({ target: [aiUsage.userId, aiUsage.feature, aiUsage.period], set: { count: sql`${aiUsage.count} + 1`, updatedAt: now }, setWhere: sql`${aiUsage.count} < ${state.limit}` })
    .returning({ count: aiUsage.count });
  if (!row) return { ok: false, reason: blocked(state.limit, state.hasPlan) };
  return { ok: true, remaining: Math.max(0, state.limit - row.count) };
}

/**
 * Gives back the search just counted when it couldn't run (Claude unavailable, or it refused): an outage must not use
 * up a person's month (aa's sweep #3). Never below zero.
 */
export async function releaseAiSearch(db: Db, userId: string, now: Date): Promise<void> {
  const period = marketDayKey(now, await userTimeZone(db, userId)).slice(0, 7);
  await db
    .update(aiUsage)
    .set({ count: sql`greatest(${aiUsage.count} - 1, 0)`, updatedAt: now })
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.feature, AI_SEARCH), eq(aiUsage.period, period)));
}

// ---- Checkout and the portal ----------------------------------------------------------------------------------

const isPlan = (value: unknown): value is PlanCode => (PLAN_CODES as readonly unknown[]).includes(value);
const isInterval = (value: unknown): value is 'month' | 'year' => (PLAN_INTERVALS as readonly unknown[]).includes(value);

async function customerFor(db: Db, provider: BillingProvider, user: { id: string; email: string; name: string }): Promise<string> {
  const [existing] = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, user.id)).limit(1);
  if (existing && existing.provider === provider.name) return existing.providerCustomerId;
  const { customerId } = await provider.createCustomer({ userId: user.id, email: user.email, name: user.name });
  await db
    .insert(billingCustomers)
    .values({ userId: user.id, provider: provider.name, providerCustomerId: customerId })
    .onConflictDoUpdate({ target: billingCustomers.userId, set: { provider: provider.name, providerCustomerId: customerId } });
  return customerId;
}

/**
 * Starts a subscription: Stripe Checkout (its URL to go to), or, with the stand-in, the plan at once (back to the
 * plan page). Refused while the person has that plan live, here or at Stripe: a checkout that finished before its
 * webhook arrived, or one in another tab, must not become a second paid subscription (aa's sweep #1). What Stripe
 * holds is mirrored on the way.
 */
export async function startCheckout(db: Db, provider: BillingProvider | null, userId: string, input: PlanCheckoutInput, now: Date): Promise<ActionResult> {
  if (!provider || !isPlan(input?.plan) || !isInterval(input?.interval)) return { ok: false, code: 'not_allowed' };
  const user = await homeMarketOf(db, userId);
  if (!user) return { ok: false, code: 'not_allowed' };
  if ((await liveRows(db, userId)).some((row) => row.plan === input.plan)) return { ok: false, code: 'not_allowed' };
  const { plans } = await marketPlans(db, user.marketId);
  const priceCents = input.interval === 'year' ? plans[input.plan].yearlyCents : plans[input.plan].monthlyCents;
  const customerId = await customerFor(db, provider, { id: userId, email: user.email, name: user.name });
  if (provider.name === 'stripe') {
    const remote = await provider.listSubscriptions(customerId);
    for (const sub of remote) await syncLocked(db, sub, now);
    if (remote.some((sub) => sub.metadata.plan === input.plan && subscriptionLive(sub.status))) return { ok: false, code: 'not_allowed' };
  }

  if (provider.name === 'dev') {
    const id = newId('sub');
    await db.insert(subscriptions).values({
      id,
      userId,
      plan: input.plan,
      interval: input.interval,
      status: 'active',
      provider: 'dev',
      providerSubscriptionId: `devsub_${id.slice(4)}`,
      marketId: user.marketId,
      priceCents,
      currentPeriodEnd: periodEndAfter(now, input.interval),
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(auditLog).values({ id: newId('aud'), actorId: userId, actorRole: 'user', action: 'billing.subscribed', targetType: 'subscription', targetId: id, metadata: { plan: input.plan, interval: input.interval, priceCents, provider: 'dev' } });
    return { ok: true, code: 'updated', redirectTo: `${routes.app.plan()}?checkout=done&plan=${input.plan}` };
  }

  const base = `${appUrl()}${routes.app.plan()}`;
  const session = await provider.createCheckout({
    customerId,
    userId,
    plan: input.plan,
    interval: input.interval,
    priceCents,
    productName: PLAN_PRODUCT_NAMES[input.plan],
    marketId: user.marketId,
    successUrl: `${base}?checkout=done&plan=${input.plan}`,
    cancelUrl: `${base}?checkout=canceled`,
    // A double click within the minute opens the same session.
    idempotencyKey: `checkout:${userId}:${input.plan}:${input.interval}:${Math.floor(now.getTime() / 60_000)}`,
  });
  return { ok: true, code: 'updated', redirectTo: session.url };
}

/**
 * Manage or cancel: Stripe's customer portal, for anyone with a billing customer (an unpaid or paused plan's card, a
 * former subscriber's invoices: aa's sweep #7). The stand-in has no portal: it cancels the person's plans at the end
 * of their period, or, when they're already cancelling, keeps them (what the portal's two buttons do), and comes back.
 */
export async function openPortal(db: Db, provider: BillingProvider | null, userId: string, now: Date): Promise<ActionResult> {
  if (!provider) return { ok: false, code: 'not_allowed' };
  const [customer] = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, userId)).limit(1);
  if (!customer || customer.provider !== provider.name) return { ok: false, code: 'not_allowed' };
  if (provider.name === 'dev') {
    const held = [...(await activePlans(db, userId, now)).values()];
    if (held.length === 0) return { ok: false, code: 'not_allowed' };
    const cancel = held.some((row) => !row.cancelAtPeriodEnd);
    await db.update(subscriptions).set({ cancelAtPeriodEnd: cancel, updatedAt: now }).where(inArray(subscriptions.id, held.map((row) => row.id)));
    return { ok: true, code: 'updated', redirectTo: routes.app.plan() };
  }
  const portal = await provider.createPortal({
    customerId: customer.providerCustomerId,
    returnUrl: `${appUrl()}${routes.app.plan()}`,
    // A double click within the minute opens the same session.
    idempotencyKey: `portal:${userId}:${Math.floor(now.getTime() / 60_000)}`,
  });
  return { ok: true, code: 'updated', redirectTo: portal.url };
}

// ---- Stripe's events ------------------------------------------------------------------------------------------

export const BILLING_EVENT_TYPES = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed'];

export function isBillingEvent(type: string | null): boolean {
  return type !== null && BILLING_EVENT_TYPES.includes(type);
}

/**
 * Mirrors one subscription from Stripe. Every event reads the subscription from Stripe itself, so duplicates, retries
 * and events out of order all end in Stripe's current state. Subscriptions that aren't ours (no `userId` or `plan` in
 * the metadata, or an unknown person) are ignored.
 */
export async function syncSubscription(db: Pick<Db, 'select' | 'insert' | 'update'>, sub: ReturnType<typeof subscriptionFromStripe>, now: Date): Promise<boolean> {
  const { userId, plan, marketId } = sub.metadata;
  if (!userId || !isPlan(plan) || !sub.id) return false;
  const [user] = await db.select({ id: users.id, marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return false;
  const interval = sub.interval ?? (isInterval(sub.metadata.interval) ? sub.metadata.interval : 'month');
  const values = {
    status: sub.status,
    interval,
    priceCents: sub.unitAmountCents ?? 0,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    endedAt: sub.endedAt,
    updatedAt: now,
  };
  const [existing] = await db.select({ id: subscriptions.id, status: subscriptions.status }).from(subscriptions).where(and(eq(subscriptions.provider, 'stripe'), eq(subscriptions.providerSubscriptionId, sub.id))).limit(1);
  if (existing) {
    await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
    if (existing.status !== sub.status) await db.insert(auditLog).values({ id: newId('aud'), actorId: null, actorRole: 'system', action: 'billing.status_changed', targetType: 'subscription', targetId: existing.id, metadata: { from: existing.status, to: sub.status } });
  } else {
    const id = newId('sub');
    await db
      .insert(subscriptions)
      .values({ id, userId, plan, provider: 'stripe', providerSubscriptionId: sub.id, marketId: marketId || user.marketId, createdAt: now, ...values })
      .onConflictDoNothing({ target: [subscriptions.provider, subscriptions.providerSubscriptionId] });
    await db.insert(auditLog).values({ id: newId('aud'), actorId: userId, actorRole: 'user', action: 'billing.subscribed', targetType: 'subscription', targetId: id, metadata: { plan, interval, status: sub.status, provider: 'stripe' } });
  }
  if (sub.customerId) {
    await db.insert(billingCustomers).values({ userId, provider: 'stripe', providerCustomerId: sub.customerId }).onConflictDoNothing();
  }
  return true;
}

/**
 * One subscription at a time (aa's sweep #5): the lock is taken before Stripe is read, so two events racing for the
 * same subscription write in turn, each with what Stripe says once it holds the lock, and the first sight inserts once.
 */
async function syncLocked(db: Db, sub: BillingSubscription, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`billing-sub:${sub.id}`}))`);
    return syncSubscription(tx, sub, now);
  });
}

export async function handleBillingWebhook(db: Db, provider: BillingProvider | null, input: { payload: string; signature: string | null; secret: string }, now: Date): Promise<{ status: number; body: { ok: boolean; ignored?: boolean } }> {
  if (!verifyStripeSignature({ payload: input.payload, header: input.signature, secret: input.secret, now })) return { status: 400, body: { ok: false } };
  let event: { type?: unknown; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(input.payload);
  } catch {
    return { status: 400, body: { ok: false } };
  }
  const object = event.data?.object ?? {};
  const subscriptionId =
    event.type === 'checkout.session.completed' ? (object.mode === 'subscription' && typeof object.subscription === 'string' ? object.subscription : null) : typeof object.id === 'string' ? object.id : null;
  if (!provider || provider.name !== 'stripe' || !subscriptionId) return { status: 200, body: { ok: true, ignored: true } };
  const synced = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`billing-sub:${subscriptionId}`}))`);
    return syncSubscription(tx, await provider.getSubscription(subscriptionId), now);
  });
  return { status: 200, body: synced ? { ok: true } : { ok: true, ignored: true } };
}

/**
 * An account being deleted: every subscription that hasn't ended ends now, counting or not (unpaid, paused, a second
 * one at Stripe), so nothing renews or charges after the account is gone (aa's sweep #1, #6).
 */
export async function endSubscriptionsOf(db: Db, provider: BillingProvider | null, userId: string, now: Date): Promise<void> {
  const stripe = provider?.name === 'stripe' ? provider : null;
  const ids = new Set<string>();
  if (stripe) {
    const [customer] = await db.select().from(billingCustomers).where(and(eq(billingCustomers.userId, userId), eq(billingCustomers.provider, 'stripe'))).limit(1);
    if (customer) for (const sub of await stripe.listSubscriptions(customer.providerCustomerId)) if (subscriptionLive(sub.status)) ids.add(sub.id);
  }
  for (const row of await liveRows(db, userId)) {
    if (row.provider === 'stripe') ids.add(row.providerSubscriptionId);
    await db.update(subscriptions).set({ status: 'canceled', cancelAtPeriodEnd: false, endedAt: now, updatedAt: now }).where(eq(subscriptions.id, row.id));
  }
  if (stripe) for (const id of ids) await stripe.cancelNow(id);
}

/**
 * A deletion was asked for: nothing renews while it waits (7 days, longer while something blocks it), so no new
 * period is charged and then lost (aa's sweep #6). Each plan ends with the period paid for; withdrawing the deletion
 * leaves them cancelling, and the person can keep them in the portal.
 */
export async function stopRenewalsOf(db: Db, provider: BillingProvider | null, userId: string, now: Date): Promise<void> {
  for (const row of await liveRows(db, userId)) {
    if (row.cancelAtPeriodEnd) continue;
    if (row.provider === 'stripe' && provider?.name === 'stripe') await provider.cancelAtPeriodEnd(row.providerSubscriptionId);
    await db.update(subscriptions).set({ cancelAtPeriodEnd: true, updatedAt: now }).where(eq(subscriptions.id, row.id));
  }
}

// ---- Fee rebates at completion --------------------------------------------------------------------------------

/** Serializes one person's rebates, so two completions at once can't both fit under the month's cap. */
export async function lockRebates(tx: Pick<Db, 'execute'>, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`plan-rebate:${userId}`}))`);
}

/** What the platform has already paid back to the client on a booking: the credit and the Plus rebate. */
async function paidBackOn(reader: Pick<Db, 'select'>, bookingId: string): Promise<Cents> {
  const [row] = await reader
    .select({ cents: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int` })
    .from(refunds)
    .where(and(eq(refunds.bookingId, bookingId), eq(refunds.status, 'succeeded'), inArray(refunds.reason, ['poster_credit', 'plan_rebate'])));
  return row?.cents ?? 0;
}

/**
 * Plus: part of the client service fee back on a booking completed while the client holds the plan, refunded to the
 * card it was paid with, within the month's cap and what the platform still has from the booking: `platformCents`
 * (what it earned, at most what the client paid) less the credit already paid back on it. Once per booking.
 */
export async function payPosterRebate(
  db: Db,
  payments_: PaymentProvider,
  input: { bookingId: string; posterUserId: string; policyVersionId: string; feeCents: Cents; platformCents: Cents; charge: { id: string; providerRef: string } },
  now: Date,
): Promise<Cents> {
  const idempotencyKey = `plan_rebate:${input.bookingId}`;
  const [done] = await db.select({ id: refunds.id }).from(refunds).where(eq(refunds.idempotencyKey, idempotencyKey)).limit(1);
  if (done) return 0;
  if (!(await activePlans(db, input.posterUserId, now)).has('plus')) return 0;
  const plans = await versionPlans(db, input.policyVersionId);
  const monthStart = marketMonthStart(now, await userTimeZone(db, input.posterUserId));
  return db.transaction(async (tx) => {
    await lockRebates(tx, input.posterUserId);
    const [used] = await tx
      .select({ cents: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int` })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .where(and(eq(refunds.reason, 'plan_rebate'), eq(refunds.status, 'succeeded'), eq(payments.payerUserId, input.posterUserId), gte(refunds.createdAt, monthStart)));
    const platformRoomCents = input.platformCents - (await paidBackOn(tx, input.bookingId));
    const amount = bookingRebateCents({ feeCents: input.feeCents, rebateBps: plans.plus.posterFeeRebateBps, capCents: plans.plus.rebateMonthlyCapCents, rebatedThisMonthCents: used?.cents ?? 0, platformRoomCents });
    if (amount <= 0) return 0;
    const result = await payments_.refund({ chargeRef: input.charge.providerRef, amountCents: amount, idempotencyKey });
    await tx.insert(refunds).values({ id: newId('ref'), paymentId: input.charge.id, bookingId: input.bookingId, amountCents: amount, reason: 'plan_rebate', status: result.status, providerRef: result.refundRef, idempotencyKey, createdAt: now });
    return result.status === 'succeeded' ? amount : 0;
  });
}

/**
 * Pro: part of the helper fee back on a booking completed while the helper holds the plan, paid with the earnings
 * (`fee_rebate`). `helperRebateTerms` checks the plan (outside any transaction); the earnings module then takes the
 * helper's rebate lock, asks `helperRebateAmount` (within the month's cap and what the platform still has from the
 * booking) and records the transfer, once per booking.
 */
export async function helperRebateTerms(db: Db, input: { bookingId: string; helperUserId: string; policyVersionId: string }, now: Date): Promise<{ rebateBps: number; capCents: Cents; monthStart: Date } | null> {
  const [done] = await db.select({ id: earnings.id }).from(earnings).where(and(eq(earnings.bookingId, input.bookingId), eq(earnings.kind, 'fee_rebate'))).limit(1);
  if (done || !(await activePlans(db, input.helperUserId, now)).has('pro')) return null;
  const plans = await versionPlans(db, input.policyVersionId);
  return { rebateBps: plans.pro.helperFeeRebateBps, capCents: plans.pro.rebateMonthlyCapCents, monthStart: marketMonthStart(now, await userTimeZone(db, input.helperUserId)) };
}

/** `platformCents`: what the platform earned on the booking; the client's credit and Plus rebate on it come off first. */
export async function helperRebateAmount(tx: Pick<Db, 'select'>, input: { bookingId: string; helperUserId: string; feeCents: Cents; platformCents: Cents }, terms: { rebateBps: number; capCents: Cents; monthStart: Date }): Promise<Cents> {
  const [used] = await tx
    .select({ cents: sql<number>`coalesce(sum(${earnings.amountCents}), 0)::int` })
    .from(earnings)
    .where(and(eq(earnings.helperUserId, input.helperUserId), eq(earnings.kind, 'fee_rebate'), gte(earnings.createdAt, terms.monthStart)));
  const platformRoomCents = input.platformCents - (await paidBackOn(tx, input.bookingId));
  return bookingRebateCents({ feeCents: input.feeCents, rebateBps: terms.rebateBps, capCents: terms.capCents, rebatedThisMonthCents: used?.cents ?? 0, platformRoomCents });
}

// ---- The plan page --------------------------------------------------------------------------------------------

async function rebatedThisMonth(db: Db, userId: string, plan: PlanCode, monthStart: Date): Promise<Cents> {
  if (plan === 'plus') {
    const [row] = await db
      .select({ cents: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int` })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .where(and(eq(refunds.reason, 'plan_rebate'), eq(refunds.status, 'succeeded'), eq(payments.payerUserId, userId), gte(refunds.createdAt, monthStart)));
    return row?.cents ?? 0;
  }
  const [row] = await db
    .select({ cents: sql<number>`coalesce(sum(${earnings.amountCents}), 0)::int` })
    .from(earnings)
    .where(and(eq(earnings.helperUserId, userId), eq(earnings.kind, 'fee_rebate'), gte(earnings.createdAt, monthStart)));
  return row?.cents ?? 0;
}

/** What each plan would have paid back on the bookings the person completed in the last 30 days (cap included). */
async function estimatesFor(db: Db, userId: string, plans: PlanPolicy, now: Date): Promise<PlanEstimate[]> {
  const rows = await db
    .select({ posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId, terms: bookingTerms.breakdown, final: bookingCompletions.finalBreakdown })
    .from(bookings)
    .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
    .leftJoin(bookingCompletions, eq(bookingCompletions.bookingId, bookings.id))
    .where(and(eq(bookings.status, 'completed'), gte(bookings.completedAt, new Date(now.getTime() - 30 * DAY)), sql`(${bookings.posterUserId} = ${userId} or ${bookings.helperUserId} = ${userId})`));
  const asClient = rows.filter((row) => row.posterUserId === userId).map((row) => (row.final ?? row.terms).posterFeeCents);
  const asHelper = rows.filter((row) => row.helperUserId === userId).map((row) => (row.final ?? row.terms).helperFeeCents);
  const estimates: PlanEstimate[] = [];
  if (asClient.length > 0) estimates.push({ plan: 'plus', bookings: asClient.length, savedCents: estimatedRebateCents(asClient, plans.plus.posterFeeRebateBps, plans.plus.rebateMonthlyCapCents) });
  if (asHelper.length > 0) estimates.push({ plan: 'pro', bookings: asHelper.length, savedCents: estimatedRebateCents(asHelper, plans.pro.helperFeeRebateBps, plans.pro.rebateMonthlyCapCents) });
  return estimates;
}

/**
 * `/app/plan`. `returned`: Stripe's return (`checkout=done&plan=…` or `checkout=canceled`); a plan just paid for shows as
 * confirming, with no buttons, until its webhook lands (aa's sweep #1).
 */
export async function planPageData(
  db: Db,
  provider: BillingProvider | null,
  userId: string,
  mode: 'client' | 'helper',
  now: Date,
  returned: { notice?: PlanPageData['notice']; plan?: string } = {},
): Promise<PlanPageData | null> {
  const user = await homeMarketOf(db, userId);
  if (!user) return null;
  const [{ plans, fees }, held, live, timeZone, aiSearch, [customer]] = await Promise.all([
    marketPlans(db, user.marketId),
    activePlans(db, userId, now),
    liveRows(db, userId),
    userTimeZone(db, userId),
    aiSearchAccess(db, userId, now),
    db.select({ provider: billingCustomers.provider }).from(billingCustomers).where(eq(billingCustomers.userId, userId)).limit(1),
  ]);
  const monthStart = marketMonthStart(now, timeZone);
  // The plans that count, then any that wait on a payment (unpaid, paused, incomplete): those say so, with Manage.
  const shown = [...held.values()];
  for (const row of live) if (!shown.some((other) => other.plan === row.plan)) shown.push(row);
  const memberships: PlanMembership[] = await Promise.all(
    shown.map(async (row) => ({
      plan: row.plan as PlanCode,
      interval: row.interval === 'year' ? ('year' as const) : ('month' as const),
      priceCents: row.priceCents,
      status: !held.has(row.plan as PlanCode) ? ('unpaid' as const) : row.status === 'past_due' ? ('past_due' as const) : ('active' as const),
      periodEnd: row.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      rebatedThisMonthCents: await rebatedThisMonth(db, userId, row.plan as PlanCode, monthStart),
    })),
  );
  const notice = returned.notice;
  const confirming = notice === 'subscribed' && isPlan(returned.plan) && !memberships.some((membership) => membership.plan === returned.plan) ? returned.plan : undefined;
  return {
    offers: planOffers(plans, fees, mode === 'helper' ? 'pro' : 'plus'),
    memberships,
    estimates: await estimatesFor(db, userId, plans, now),
    freeAiSearchesPerMonth: plans.free.aiSearchesPerMonth,
    aiSearch,
    ...(provider ? {} : { unavailable: true as const }),
    ...(notice ? { notice } : {}),
    ...(confirming ? { confirming } : {}),
    ...(provider && customer?.provider === provider.name ? { portal: true as const } : {}),
  };
}
