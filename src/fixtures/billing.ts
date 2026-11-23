import type { PlanOffer, PlanPageData } from '@/contracts';

/**
 * The plan page (completion plan 9.13; LinkedIn-Premium-style since 2026-11-23), at the default policy's prices:
 * Plus $4.99 a month or $39.99 a year (no hold fee on payments TasksNearMe holds); Pro $7.99 or $59.99 (offers
 * first, a Pro badge, offer insights); 100 AI searches a month with a plan, 5 without.
 */

const plus: PlanOffer = { plan: 'plus', monthlyCents: 499, yearlyCents: 3999, aiSearchesPerMonth: 100 };
const pro: PlanOffer = { plan: 'pro', monthlyCents: 799, yearlyCents: 5999, aiSearchesPerMonth: 100 };
const RESETS = '2026-12-01T05:00:00.000Z';

/** A client without a plan. */
export const planFreeClientData: PlanPageData = {
  offers: [plus, pro],
  memberships: [],
  freeAiSearchesPerMonth: 5,
  aiSearch: { allowed: true, remaining: 3, resetsAt: RESETS },
};

/** A client on Plus, monthly, back from checkout. */
export const planPlusMemberData: PlanPageData = {
  ...planFreeClientData,
  memberships: [{ plan: 'plus', interval: 'month', priceCents: 499, status: 'active', periodEnd: '2026-12-18T15:00:00.000Z', cancelAtPeriodEnd: false }],
  aiSearch: { allowed: true, remaining: 88, resetsAt: RESETS },
  notice: 'subscribed',
};

/** A helper on Pro, yearly, cancelled (it ends at the period's end). */
export const planProCancelingData: PlanPageData = {
  offers: [pro, plus],
  memberships: [{ plan: 'pro', interval: 'year', priceCents: 5999, status: 'active', periodEnd: '2027-03-02T15:00:00.000Z', cancelAtPeriodEnd: true }],
  freeAiSearchesPerMonth: 5,
  aiSearch: { allowed: true, remaining: 61, resetsAt: RESETS },
};

/** A helper on Pro whose renewal payment failed (Stripe is retrying). */
export const planPastDueData: PlanPageData = {
  ...planProCancelingData,
  memberships: [{ plan: 'pro', interval: 'month', priceCents: 799, status: 'past_due', periodEnd: '2026-11-20T15:00:00.000Z', cancelAtPeriodEnd: false }],
};

/** No AI searches left this month, back from a cancelled checkout. */
export const planAiUsedUpData: PlanPageData = { ...planFreeClientData, aiSearch: { allowed: false, reason: 'monthly_limit', remaining: 0, resetsAt: RESETS }, notice: 'checkout_canceled' };

/** A production build without Stripe: the plans show without buttons. AI isn't set up either. */
export const planUnavailableData: PlanPageData = { ...planFreeClientData, unavailable: true, aiSearch: { allowed: false, reason: 'ai_off', remaining: null } };
