import type { ISODateTime } from './common';

/**
 * Subscription plans (completion plan 9.13; the design is in docs/automation/decisions.md). Everything on the
 * site works without a plan and without AI; a plan adds AI help and conveniences, never ranking above trust signals.
 */
export const PLAN_CODES = ['client_plus', 'helper_pro'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/**
 * Why AI search isn't available to the viewer now. `ai_off`: no Claude here, so show only the plain search (no
 * upsell). `needs_plan`: it comes with a plan (link `routes.app.plan()`). `monthly_limit`: this month's searches
 * are used up (`resetsAt` says when they renew).
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
  /** When this month's searches renew. */
  resetsAt?: ISODateTime;
}
