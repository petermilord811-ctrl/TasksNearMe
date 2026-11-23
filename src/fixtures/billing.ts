import type { PlanOffer, PlanPageData, StarterPlan } from '@/contracts';

/**
 * The plan page (completion plan 9.13; LinkedIn-Premium-style since 2026-11-23, a ladder since the owner's second
 * change that day), at the default policy's prices and allowances:
 * - Starter (no plan): AI search 3 a day and 50 a month; 3 new direct conversations a day (up to 60 with Sparks);
 *   10 saved searches and 10 instant alerts a day.
 * - Plus, $4.99 a month or $39.99 a year: AI search 5 a day and 150 a month; 25 new conversations a day; 25 saved
 *   searches and 25 instant alerts a day.
 * - Pro, $7.99 or $59.99: everything in Plus; no hold fee; unlimited AI search; 100 new conversations a day; 50 saved
 *   searches and 50 instant alerts a day; offers first with a Pro badge, and offer insights.
 */

export const starterPlanData: StarterPlan = { aiSearches: { perDay: 3, perMonth: 50 }, directChatsPerDay: 3, directChatsWithSparks: 60, savedSearches: 10, instantAlertsPerDay: 10 };
export const plusOfferData: PlanOffer = { plan: 'plus', monthlyCents: 499, yearlyCents: 3999, aiSearches: { perDay: 5, perMonth: 150 }, directChatsPerDay: 25, savedSearches: 25, instantAlertsPerDay: 25 };
export const proOfferData: PlanOffer = { plan: 'pro', monthlyCents: 799, yearlyCents: 5999, aiSearches: { perDay: null, perMonth: null }, directChatsPerDay: 100, savedSearches: 50, instantAlertsPerDay: 50 };

/** Midnight in Gainesville (America/New_York): today's AI searches renew. */
const TOMORROW = '2026-11-24T05:00:00.000Z';
/** The first of next month there: this month's renew. */
const NEXT_MONTH = '2026-12-01T05:00:00.000Z';

/** Without a plan (Starter): 1 of today's 3 AI searches used. */
export const planFreeClientData: PlanPageData = {
  offers: [plusOfferData, proOfferData],
  memberships: [],
  starter: starterPlanData,
  aiSearch: { allowed: true, remaining: 2, per: 'day', resetsAt: TOMORROW },
};

/** On Plus, monthly, back from checkout: Pro's buttons upgrade (Plus then stops renewing). */
export const planPlusMemberData: PlanPageData = {
  ...planFreeClientData,
  memberships: [{ plan: 'plus', interval: 'month', priceCents: 499, status: 'active', periodEnd: '2026-12-18T15:00:00.000Z', cancelAtPeriodEnd: false }],
  aiSearch: { allowed: true, remaining: 4, per: 'day', resetsAt: TOMORROW },
  upgradesPlus: true,
  notice: 'subscribed',
};

/** On Pro, monthly: Plus is included, and AI search is unlimited. */
export const planProMemberData: PlanPageData = {
  ...planFreeClientData,
  memberships: [{ plan: 'pro', interval: 'month', priceCents: 799, status: 'active', periodEnd: '2026-12-02T15:00:00.000Z', cancelAtPeriodEnd: false }],
  aiSearch: { allowed: true, remaining: null },
  plusIncluded: true,
};

/** On Pro, yearly, cancelled (it ends at the period's end, so Plus can be chosen for after). */
export const planProCancelingData: PlanPageData = {
  ...planFreeClientData,
  memberships: [{ plan: 'pro', interval: 'year', priceCents: 5999, status: 'active', periodEnd: '2027-03-02T15:00:00.000Z', cancelAtPeriodEnd: true }],
  aiSearch: { allowed: true, remaining: null },
};

/** On Pro, and the renewal payment failed (Stripe is retrying; the plan still counts). */
export const planPastDueData: PlanPageData = {
  ...planProMemberData,
  memberships: [{ plan: 'pro', interval: 'month', priceCents: 799, status: 'past_due', periodEnd: '2026-11-20T15:00:00.000Z', cancelAtPeriodEnd: false }],
};

/** Today's 3 AI searches used, back from a cancelled checkout. */
export const planAiUsedUpData: PlanPageData = { ...planFreeClientData, aiSearch: { allowed: false, reason: 'daily_limit', remaining: 0, per: 'day', resetsAt: TOMORROW }, notice: 'checkout_canceled' };

/** This month's 50 AI searches used (tomorrow doesn't renew them). */
export const planAiMonthUsedUpData: PlanPageData = { ...planFreeClientData, aiSearch: { allowed: false, reason: 'monthly_limit', remaining: 0, per: 'month', resetsAt: NEXT_MONTH } };

/** A production build without Stripe: the plans show without buttons. AI isn't set up either. */
export const planUnavailableData: PlanPageData = { ...planFreeClientData, unavailable: true, aiSearch: { allowed: false, reason: 'ai_off', remaining: null } };
