import {
  DIRECT_CHATS_PER_DAY,
  INSTANT_ALERT_LIMITS,
  PLAN_DIRECT_CHATS_PER_DAY,
  SAVED_SEARCH_LIMITS,
  type AiSearchAllowance,
  type Cents,
  type PlanCode,
  type PlanOffer,
  type PlanTier,
  type StarterPlan,
  type TimeZone,
} from '@/contracts';
import type { PlanPolicy } from '@/modules/markets/schema';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';

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

/** A tier's AI searches a day and a month (null: unlimited; no daily figure on an older policy: none a day). */
export function aiAllowanceOf(plans: PlanPolicy, tier: PlanTier): AiSearchAllowance {
  const entry = plans[tier];
  return { perDay: entry.aiSearchesPerDay ?? null, perMonth: entry.aiSearchesPerMonth ?? null };
}

/** The more generous of two limits (null: unlimited). */
const roomier = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : Math.max(a, b));

/**
 * The AI searches a day and a month for someone holding these plans: the most generous of Starter's and theirs, each
 * on its own (null: unlimited).
 */
export function aiSearchAllowance(plans: PlanPolicy, held: readonly PlanCode[]): AiSearchAllowance {
  return held.reduce<AiSearchAllowance>((best, plan) => {
    const next = aiAllowanceOf(plans, plan);
    return { perDay: roomier(best.perDay, next.perDay), perMonth: roomier(best.perMonth, next.perMonth) };
  }, aiAllowanceOf(plans, 'free'));
}

/** The highest tier among these plans (Pro has everything in Plus), or Starter. */
export function topTier(held: Iterable<PlanCode>): PlanTier {
  const codes = new Set(held);
  return codes.has('pro') ? 'pro' : codes.has('plus') ? 'plus' : 'free';
}

/** Saved searches someone holding these plans can keep. */
export function savedSearchLimit(held: Iterable<PlanCode>): number {
  return SAVED_SEARCH_LIMITS[topTier(held)];
}

/** Instant alerts a day for someone holding these plans. */
export function instantAlertLimit(held: Iterable<PlanCode>): number {
  return INSTANT_ALERT_LIMITS[topTier(held)];
}

/** The plans as offered under a policy: Plus, then Pro (each has everything in the one before). */
export function planOffers(plans: PlanPolicy): PlanOffer[] {
  return (['plus', 'pro'] as const).map((plan) => ({
    plan,
    monthlyCents: plans[plan].monthlyCents,
    yearlyCents: plans[plan].yearlyCents,
    aiSearches: aiAllowanceOf(plans, plan),
    directChatsPerDay: PLAN_DIRECT_CHATS_PER_DAY[plan],
    savedSearches: SAVED_SEARCH_LIMITS[plan],
    instantAlertsPerDay: INSTANT_ALERT_LIMITS[plan],
  }));
}

/** Starter, everything without a plan, under a policy. */
export function starterPlan(plans: PlanPolicy): StarterPlan {
  return {
    aiSearches: aiAllowanceOf(plans, 'free'),
    directChatsPerDay: DIRECT_CHATS_PER_DAY.newcomer,
    directChatsWithSparks: Math.max(...Object.values(DIRECT_CHATS_PER_DAY)),
    savedSearches: SAVED_SEARCH_LIMITS.free,
    instantAlertsPerDay: INSTANT_ALERT_LIMITS.free,
  };
}

/** The start of the next calendar day in a market's zone: when today's AI searches renew. */
export function nextMarketDayStart(now: Date, timeZone: TimeZone): Date {
  const [year, month, day] = marketDayKey(now, timeZone).split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return new Date(marketLocalToUtc(next, '00:00', timeZone));
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
