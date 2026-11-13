import type { CategorySlug, ISODateTime } from './common';

/**
 * Achievement badges (completion plan 6.4; the owner: "as GitHub, once they finish tasks, make some types of
 * special badges"). Verification badges stay `VerificationBadges` (src/contracts/people.ts). Achievements are
 * counted on the server from completed and paid bookings (never refunded or disputed, never between a pair
 * our reward risk checks flagged), recomputed when bookings, reviews and verification change, announced with a
 * `badge_earned` notification, and revocable by staff. The UI shows what it receives; it never counts.
 */

export const HELPER_BADGES = ['tasks_completed', 'five_star', 'on_time', 'repeat_clients', 'category_pro', 'regular_visits', 'founding_helper'] as const;
export const CLIENT_BADGES = ['client_bookings', 'client_regular', 'client_five_star'] as const;
export const BADGE_CODES = [...HELPER_BADGES, ...CLIENT_BADGES] as const;
export type BadgeCode = (typeof BADGE_CODES)[number];

/**
 * Each badge's tiers: what has to be counted to reach each one (the first tier is index 0). Single-tier badges
 * have one threshold.
 * - `tasks_completed`: bookings completed and paid, at most 3 per client (regulars have their own badges).
 * - `five_star`: five-star reviews from clients. `on_time`: arrivals at most 10 minutes after the start.
 * - `repeat_clients`: clients who booked the helper again. `category_pro`: bookings in one category, with a
 *   4.8 average from at least 5 reviews there. `regular_visits`: visits of regular-visit series.
 * - `founding_helper`: one of the market's first 100 verified helpers.
 * - Clients: `client_bookings` (bookings completed, at most 3 per helper), `client_regular` (a series with 4
 *   visits done), `client_five_star` (five-star reviews from helpers).
 */
export const BADGE_TIERS: Record<BadgeCode, readonly number[]> = {
  tasks_completed: [1, 10, 25, 50, 100],
  five_star: [5, 25, 100],
  on_time: [10, 25, 50],
  repeat_clients: [1, 5, 15],
  category_pro: [10, 25],
  regular_visits: [4, 12, 26],
  founding_helper: [1],
  client_bookings: [1, 5, 15],
  client_regular: [4],
  client_five_star: [3, 10],
};

/** One earned badge. */
export interface BadgeView {
  code: BadgeCode;
  /** 1-based: tier 1 is the first threshold. */
  tier: number;
  tierCount: number;
  /** What the tier took ("25" tasks). */
  threshold: number;
  /** `category_pro`: the category. */
  category?: CategorySlug;
  /** `founding_helper`: the helper's number ("Founding helper #12"). */
  foundingNumber?: number;
  /** When this tier was reached. */
  earnedAt: ISODateTime;
}

/** The person's own view adds the way to the next tier. */
export interface OwnBadgeView extends BadgeView {
  /** Absent at the top tier. */
  next?: { threshold: number; count: number };
}

/** A badge not earned yet, with how far along the person is (their own pages only). */
export interface BadgeProgressView {
  code: BadgeCode;
  category?: CategorySlug;
  threshold: number;
  count: number;
}

/** The account page and the profile editor: what's earned, and what's next. */
export interface OwnBadgesData {
  earned: OwnBadgeView[];
  /** The closest badges not earned yet (up to 3). */
  upNext: BadgeProgressView[];
}
