import type { Cents, PlanCode, PlanOffer } from '@/contracts';
import type { PlanPolicy } from '@/modules/markets/schema';

/**
 * The plans' rules as pure functions (completion plan 9.13, decisions.md 2026-11-18).
 */

/** Stripe statuses in which a plan counts, while its paid period lasts (`past_due`: Stripe is retrying the payment). */
const COUNTING = new Set(['active', 'trialing', 'past_due']);
/** Subscriptions that haven't ended: they count, or wait on a payment (`unpaid`, `paused`, `incomplete`). */
const LIVE = new Set([...COUNTING, 'unpaid', 'paused', 'incomplete']);

/**
 * A renewing plan keeps counting this long past its period's end: Stripe's renewal event can lag (the webhook inbox
 * retries for up to 12 hours), and a booking made meanwhile would lose the plan's benefits for good (aa's sweep #2; the
 * hold fee Plus waives since 2026-11-23). Not for a plan set to cancel: it ends on time.
 */
export const RENEWAL_GRACE_MS = 3 * 86_400_000;

export function planCounts(subscription: { status: string; currentPeriodEnd: Date; cancelAtPeriodEnd?: boolean }, now: Date): boolean {
  if (!COUNTING.has(subscription.status)) return false;
  const end = subscription.currentPeriodEnd.getTime() + (subscription.cancelAtPeriodEnd ? 0 : RENEWAL_GRACE_MS);
  return end > now.getTime();
}

/** Not ended: Stripe still holds it (and may charge it). */
export function subscriptionLive(status: string): boolean {
  return LIVE.has(status);
}

/** The plan's name on Stripe's checkout, receipts and portal. */
export const PLAN_PRODUCT_NAMES: Record<PlanCode, string> = { plus: 'TasksNearMe Plus', pro: 'TasksNearMe Pro' };

const BPS = 10_000;

/**
 * What one side's fee rebate is worth: `rebateBps` of the fee (rounded half up). Rebates belong to the service fees
 * before 2026-11-23: policies since then pay back nothing (0 bps), and only bookings made under an older policy can
 * still have one.
 */
export function feeRebateCents(feeCents: Cents, rebateBps: number): Cents {
  if (feeCents <= 0 || rebateBps <= 0) return 0;
  return Math.floor((feeCents * rebateBps + BPS / 2) / BPS);
}

/**
 * A booking's rebate: the plan's share of the fee, within what's left of this month's cap and of what the platform
 * earned on the booking after the credits and rebates already paid back on it (the platform never pays out more than
 * it took).
 */
export function bookingRebateCents(input: { feeCents: Cents; rebateBps: number; capCents: Cents; rebatedThisMonthCents: Cents; platformRoomCents: Cents }): Cents {
  return Math.max(0, Math.min(feeRebateCents(input.feeCents, input.rebateBps), input.capCents - input.rebatedThisMonthCents, input.platformRoomCents));
}

/** The plans as offered under a policy, the viewer's side first. */
export function planOffers(plans: PlanPolicy, first: PlanCode): PlanOffer[] {
  const plus: PlanOffer = { plan: 'plus', monthlyCents: plans.plus.monthlyCents, yearlyCents: plans.plus.yearlyCents, aiSearchesPerMonth: plans.plus.aiSearchesPerMonth };
  const pro: PlanOffer = { plan: 'pro', monthlyCents: plans.pro.monthlyCents, yearlyCents: plans.pro.yearlyCents, aiSearchesPerMonth: plans.pro.aiSearchesPerMonth };
  return first === 'pro' ? [pro, plus] : [plus, pro];
}

/** The AI searches a month for someone holding these plans: the most generous of them, or the free allowance. */
export function aiSearchLimit(plans: PlanPolicy, held: readonly PlanCode[]): number {
  return Math.max(plans.free.aiSearchesPerMonth, ...held.map((plan) => plans[plan].aiSearchesPerMonth));
}

/** The end of a new stand-in subscription's first period: a month or a year on, on the same day or the month's last. */
export function periodEndAfter(start: Date, interval: 'month' | 'year'): Date {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  if (interval === 'year') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}
