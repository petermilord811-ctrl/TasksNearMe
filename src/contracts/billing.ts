import type { ActionResult } from './actions';
import type { Cents, ISODateTime } from './common';

/**
 * Subscription plans (completion plan 9.13; LinkedIn-Premium-style since 2026-11-23, docs/automation/decisions.md).
 * Everything on the site works without a plan and without AI, and there are no service fees to pay back. Since the
 * owner's second change that day the plans are a ladder, for anyone, each with everything in the one before:
 * - Starter (no plan, free): AI search 3 a day and 50 a month; 3 new direct conversations a day (more with Sparks).
 * - `plus`: AI search 5 a day and 150 a month; more new direct conversations, saved searches and instant alerts.
 * - `pro`: everything in Plus; the only plan with no hold fee (owner: "Pro only no fee"); unlimited AI search; the most
 *   new direct conversations, saved searches and instant alerts; and for helpers, offers first on a client's list
 *   with a Pro badge, and offer insights on every task.
 * Reviews, checks and the verified badge are earned the same way by everyone.
 */
export const PLAN_CODES = ['plus', 'pro'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** Starter (`free`, no plan) and the plans, lowest first. */
export type PlanTier = 'free' | PlanCode;

export const PLAN_INTERVALS = ['month', 'year'] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

/**
 * Why AI search isn't available to the viewer now. `ai_off`: no Claude here, so show only the plain search (no
 * upsell). `needs_plan`: it comes with a plan (link `routes.app.plan()`). `daily_limit`: today's searches are used up
 * (they renew at midnight, `resetsAt`). `monthly_limit`: this month's are (they renew on the 1st). A plan has more.
 */
export const AI_SEARCH_BLOCKS = ['ai_off', 'needs_plan', 'daily_limit', 'monthly_limit'] as const;
export type AiSearchBlock = (typeof AI_SEARCH_BLOCKS)[number];

/** Which allowance a count is about: today's (a calendar day) or this month's, in the person's market zone. */
export type AiSearchPeriod = 'day' | 'month';

/** AI searches a day and a month; null: unlimited (Pro). */
export interface AiSearchAllowance {
  perDay: number | null;
  perMonth: number | null;
}

/** Whether "describe what you need" (AI search) can run for the viewer, from `aiSearchAccess` (src/modules/billing). */
export interface AiSearchAccess {
  allowed: boolean;
  /** Set when `allowed` is false. */
  reason?: AiSearchBlock;
  /** Searches the viewer can run now: the fewer of today's and this month's left; null when unlimited or not counted. */
  remaining: number | null;
  /** Which allowance `remaining` (or the block) is about. */
  per?: AiSearchPeriod;
  /** When that allowance renews: midnight, or the first of next month, in the person's market zone. */
  resetsAt?: ISODateTime;
}

/** What a tier adds, as numbers: the same for Starter (`StarterPlan`) and each plan (`PlanOffer`). */
export interface PlanAllowances {
  aiSearches: AiSearchAllowance;
  /**
   * New direct conversations a day (any 24 hours). Starter's is the newcomer level's: Sparks levels raise it, up to
   * `StarterPlan.directChatsWithSparks`, and a plan never lowers a level's.
   */
  directChatsPerDay: number;
  /** Saved searches at once. */
  savedSearches: number;
  /** Instant alerts a day for new matching tasks (more wait for the morning digest). */
  instantAlertsPerDay: number;
}

/** A plan as offered in the person's market: its policy's prices, and what it adds. */
export interface PlanOffer extends PlanAllowances {
  plan: PlanCode;
  monthlyCents: Cents;
  /** Billed once a year. */
  yearlyCents: Cents;
}

/** Starter: everything without a plan. */
export interface StarterPlan extends PlanAllowances {
  /** The most new direct conversations a day Sparks levels give without a plan. */
  directChatsWithSparks: number;
}

/** One of the person's plans. */
export interface PlanMembership {
  plan: PlanCode;
  interval: PlanInterval;
  priceCents: Cents;
  /**
   * `past_due`: the last payment failed and Stripe is retrying; the plan still counts meanwhile. `unpaid`: it's on
   * hold (unpaid, paused or not yet paid) and doesn't count until a payment goes through: say so, with Manage.
   */
  status: 'active' | 'past_due' | 'unpaid';
  /** When it renews, or ends when `cancelAtPeriodEnd`. */
  periodEnd: ISODateTime;
  cancelAtPeriodEnd: boolean;
}

/** `/app/plan`. */
export interface PlanPageData {
  /** Plus, then Pro (each has everything in the one before). */
  offers: PlanOffer[];
  memberships: PlanMembership[];
  /** Everything without a plan. */
  starter: StarterPlan;
  /** The viewer's AI search allowance now (today's and this month's). */
  aiSearch: AiSearchAccess;
  /**
   * The viewer has a Pro plan that renews: Plus is part of it, so Plus shows as included, with no buttons (subscribing
   * to Plus is refused meanwhile).
   */
  plusIncluded?: true;
  /**
   * The viewer has a Plus plan that renews: Pro's buttons upgrade, and once Pro starts, Plus stops renewing and ends
   * with the period already paid for (say so beside Pro's buttons).
   */
  upgradesPlus?: true;
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
  /** Back from paying for this plan, before Stripe's confirmation arrived: show it as confirming, with no buttons. */
  confirming?: PlanCode;
  /** The person has billing history (a customer at Stripe): Manage (invoices, the card) is offered even without a plan. */
  portal?: true;
}

export interface PlanCheckoutInput {
  plan: PlanCode;
  interval: PlanInterval;
}

export interface PlanHandlers {
  /**
   * Subscribe: ok with `redirectTo`, Stripe Checkout (a full page load, `window.location.assign`) or, with the
   * stand-in, back to the plan page. `not_allowed`: already on that plan, Plus while Pro renews, or subscribing
   * isn't available here.
   */
  onSubscribe: (input: PlanCheckoutInput) => Promise<ActionResult>;
  /** Manage or cancel: ok with `redirectTo`, Stripe's customer portal (a full page load). `not_allowed`: no plan. */
  onManage: () => Promise<ActionResult>;
}
