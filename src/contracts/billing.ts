import type { ActionResult } from './actions';
import type { Cents, ISODateTime } from './common';

/**
 * Subscription plans (completion plan 9.13; the design is in docs/automation/decisions.md, 2026-11-18). Everything on
 * the site works without a plan and without AI; a plan adds money back on fees and AI search, never ranking, a badge
 * or a trust signal.
 * - `plus`: for clients. Part of the client service fee back on each completed booking, up to a monthly cap.
 * - `pro`: for helpers. Part of the helper fee back on each completed booking, up to a monthly cap.
 */
export const PLAN_CODES = ['plus', 'pro'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const PLAN_INTERVALS = ['month', 'year'] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

/**
 * Why AI search isn't available to the viewer now. `ai_off`: no Claude here, so show only the plain search (no
 * upsell). `needs_plan`: it comes with a plan (link `routes.app.plan()`). `monthly_limit`: this month's searches
 * are used up (`resetsAt` says when they renew; a plan has more).
 */
export const AI_SEARCH_BLOCKS = ['ai_off', 'needs_plan', 'monthly_limit'] as const;
export type AiSearchBlock = (typeof AI_SEARCH_BLOCKS)[number];

/** Whether "describe what you need" (AI search) can run for the viewer, from `aiSearchAccess` (src/modules/billing). */
export interface AiSearchAccess {
  allowed: boolean;
  /** Set when `allowed` is false. */
  reason?: AiSearchBlock;
  /** Searches left this month; null when not counted. */
  remaining: number | null;
  /** When this month's searches renew (the first of next month in the person's market zone). */
  resetsAt?: ISODateTime;
}

/** A plan as offered in the person's market (its policy's prices). */
export interface PlanOffer {
  plan: PlanCode;
  monthlyCents: Cents;
  /** Billed once a year. */
  yearlyCents: Cents;
  /** The share of that side's service fee paid back, in basis points (5,000: half). */
  rebateBps: number;
  /** The most paid back in one calendar month (the same on yearly plans). */
  rebateMonthlyCapCents: Cents;
  aiSearchesPerMonth: number;
  /** Booked (Plus) or earned (Pro) in a month at which the money back equals the monthly price, rounded up to $10. */
  breakEvenMonthlyCents: Cents;
}

/** One of the person's plans. */
export interface PlanMembership {
  plan: PlanCode;
  interval: PlanInterval;
  priceCents: Cents;
  /** `past_due`: the last payment failed and Stripe is retrying; the plan still counts meanwhile. */
  status: 'active' | 'past_due';
  /** When it renews, or ends when `cancelAtPeriodEnd`. */
  periodEnd: ISODateTime;
  cancelAtPeriodEnd: boolean;
  /** Paid back so far this calendar month, against the plan's cap. */
  rebatedThisMonthCents: Cents;
}

/**
 * An honest estimate from the person's own last 30 days: what the plan's money back would have been on the bookings
 * they completed (cap included). Absent when they completed none.
 */
export interface PlanEstimate {
  plan: PlanCode;
  bookings: number;
  savedCents: Cents;
}

/** `/app/plan`. */
export interface PlanPageData {
  /** In the order to show: the viewer's side first. */
  offers: PlanOffer[];
  memberships: PlanMembership[];
  estimates: PlanEstimate[];
  /** AI searches a month without a plan. */
  freeAiSearchesPerMonth: number;
  /** This month's AI search allowance. */
  aiSearch: AiSearchAccess;
  /**
   * Subscribing isn't possible here (a production build without Stripe's keys): show the plans without the buttons,
   * and say they're coming.
   */
  unavailable?: true;
  /**
   * Back from Checkout: `subscribed` (the plan shows once Stripe confirms it, usually within seconds; `memberships`
   * may not have it yet), `checkout_canceled` (nothing was charged).
   */
  notice?: 'subscribed' | 'checkout_canceled';
}

export interface PlanCheckoutInput {
  plan: PlanCode;
  interval: PlanInterval;
}

export interface PlanHandlers {
  /**
   * Subscribe: ok with `redirectTo`, Stripe Checkout (a full page load, `window.location.assign`) or, with the
   * stand-in, back to the plan page. `not_allowed`: already on that plan, or subscribing isn't available here.
   */
  onSubscribe: (input: PlanCheckoutInput) => Promise<ActionResult>;
  /** Manage or cancel: ok with `redirectTo`, Stripe's customer portal (a full page load). `not_allowed`: no plan. */
  onManage: () => Promise<ActionResult>;
}
