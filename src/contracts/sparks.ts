import type { ActionHandler } from './actions';
import type { PlanCode } from './billing';
import type { Cents, ISODateTime } from './common';

/**
 * Sparks (owner, 2026-11-21; decisions.md): TasksNearMe's own score, like Reddit's karma. People earn Sparks by taking
 * part (community posts and replies, the Helpful and Thanks others give them, completed bookings, reviews they write)
 * and can also buy them. A higher level lets them start more direct conversations a day.
 *
 * Sparks are a community score, never a trust signal: they show only on a person's public profile and community card
 * (like karma on a Reddit profile), always with the bought part beside the total, and never change search order,
 * matching or helper cards in lists, or sit with ratings, reviews and verification (the trust signals). They buy
 * nothing and can't be spent, moved or cashed out.
 */

/**
 * Levels (the milestones) by total Sparks, lowest first. Six since 2026-11-24 (owner: "Make milestones by neighbor
 * score . maybe 5 or 6 milestones and name them"): Friendly face joined between Good neighbor and Pillar, and Pillar
 * moved from 1,000 to 2,000 so the top two take real time to earn.
 */
export const SPARK_LEVELS = ['newcomer', 'neighbor', 'good_neighbor', 'friendly_face', 'pillar', 'local_legend'] as const;
export type SparkLevel = (typeof SPARK_LEVELS)[number];

/** The total at which each level starts. */
export const SPARK_LEVEL_THRESHOLDS: Record<SparkLevel, number> = { newcomer: 0, neighbor: 50, good_neighbor: 250, friendly_face: 750, pillar: 2000, local_legend: 5000 };

/** New direct conversations a person can start in any 24 hours, by level. */
export const DIRECT_CHATS_PER_DAY: Record<SparkLevel, number> = { newcomer: 3, neighbor: 10, good_neighbor: 25, friendly_face: 30, pillar: 40, local_legend: 60 };

/**
 * The top two levels also see the email and phone number a helper chose to share on their profile (owner,
 * 2026-11-24: "last two top milestone can see helper's profile: email and phone number", shared only by helpers who
 * turn it on). Counted on **earned** Sparks only: a bought total raises the level and the chat allowance, but never
 * opens anyone's contact details.
 */
export const CONTACT_LEVELS = ['pillar', 'local_legend'] as const satisfies readonly SparkLevel[];
/** The earned Sparks that open shared contact details: where the lowest of `CONTACT_LEVELS` starts (2,000). */
export const HELPER_CONTACT_EARNED_MIN = SPARK_LEVEL_THRESHOLDS[CONTACT_LEVELS[0]];

/**
 * With a plan, at least this many (a plan never lowers a level's allowance): Plus 25, Pro 100 (the plans' ladder,
 * owner 2026-11-23: "Describe direct message limit").
 */
export const PLAN_DIRECT_CHATS_PER_DAY: Record<PlanCode, number> = { plus: 25, pro: 100 };

/** Where earned Sparks come from. */
export const SPARK_SOURCES = ['posts', 'replies', 'helpful', 'thanks', 'bookings', 'reviews'] as const;
export type SparkSource = (typeof SPARK_SOURCES)[number];

/**
 * What each thing earns. `dailyCap`: only that many a day count (in UTC days), so posting more to farm Sparks
 * doesn't pay. Posts and replies count while they're visible (one removed by its author or our team stops counting);
 * Helpful and Thanks count from other people only, and only from givers `SPARK_GIVER_RULES` accepts. `perGiver`: at
 * most that many of the kind count from any one person (sweep 2026-11-24 A2: two sock accounts marking every post and
 * reply reached the contact-details level in about three days).
 */
export const SPARK_RULES: Record<SparkSource, { points: number; dailyCap?: number; perGiver?: number }> = {
  posts: { points: 5, dailyCap: 3 },
  replies: { points: 2, dailyCap: 10 },
  helpful: { points: 3, perGiver: 5 },
  thanks: { points: 2, perGiver: 5 },
  bookings: { points: 10 },
  reviews: { points: 2 },
};

/**
 * Whose Helpful and Thanks count (sweep 2026-11-24 A2): an account in good standing now (active: not restricted,
 * suspended, banned or deleted, so a banned sock's reactions stop counting at once) that was at least
 * `minAccountDays` old when it reacted (a fresh account's reactions never count, even once it's older).
 */
export const SPARK_GIVER_RULES = { minAccountDays: 7 } as const;

/** Sparks for sale. */
export const SPARK_PACKS = ['small', 'medium', 'large'] as const;
export type SparkPack = (typeof SPARK_PACKS)[number];

export const SPARK_PACK_OFFERS: Record<SparkPack, { points: number; priceCents: Cents }> = {
  small: { points: 100, priceCents: 99 },
  medium: { points: 550, priceCents: 499 },
  large: { points: 1200, priceCents: 999 },
};

/**
 * Someone's Sparks as others see them: the total, the part they bought (always shown beside the total), and their
 * level. Absent for someone with none.
 */
export interface SparksSummary {
  total: number;
  bought: number;
  level: SparkLevel;
}

export interface SparkPurchaseView {
  id: string;
  pack: SparkPack;
  points: number;
  priceCents: Cents;
  /** `pending`: checkout opened, not paid (yet); `paid`: counted; `refunded`: taken back off the total. */
  status: 'pending' | 'paid' | 'refunded';
  createdAt: ISODateTime;
}

/** `/app/sparks`: the person's own Sparks, how they're earned, what levels unlock, and buying more. */
export interface SparksPageData {
  summary: SparksSummary;
  earned: number;
  /** Every source, in `SPARK_SOURCES` order: how many count and the Sparks they gave. */
  breakdown: { source: SparkSource; count: number; points: number }[];
  /** The next level and the total it starts at; absent at the top. */
  nextLevel?: { level: SparkLevel; at: number };
  /**
   * Every level, lowest first, with the direct conversations a day it allows. `helperContact`: the level also sees the
   * contact details helpers share (`CONTACT_LEVELS`), on earned Sparks.
   */
  levels: { level: SparkLevel; at: number; directChatsPerDay: number; helperContact?: true }[];
  /**
   * Seeing the contact details helpers share (2026-11-24): `at` the earned Sparks it takes (`HELPER_CONTACT_EARNED_MIN`),
   * `unlocked` once `earned` reaches it. Bought Sparks don't count toward it.
   */
  helperContact: { at: number; unlocked: boolean };
  /** The viewer's allowance now (their level, or their plan's when that's more). */
  directChatsPerDay: number;
  /** Plus and Pro allow at least this many each (`PLAN_DIRECT_CHATS_PER_DAY`). */
  planDirectChatsPerDay: Record<PlanCode, number>;
  hasPlan: boolean;
  /** With a plan: the least it allows a day (the viewer's highest plan's, `PLAN_DIRECT_CHATS_PER_DAY`). */
  yourPlanDirectChatsPerDay?: number;
  /** What earns Sparks (`SPARK_RULES`), in `SPARK_SOURCES` order. */
  rules: { source: SparkSource; points: number; dailyCap?: number; perGiver?: number }[];
  /** How old another person's account must have been when they reacted for their Helpful and Thanks to count. */
  giverMinAccountDays: number;
  packs: { pack: SparkPack; points: number; priceCents: Cents }[];
  /** Newest first, at most 20. */
  purchases: SparkPurchaseView[];
  /** Buying isn't offered here (no payment provider): the packs show without a Buy button. */
  unavailable?: true;
  /** Back from checkout: paid and counted, still confirming, or canceled with nothing charged. */
  notice?: 'purchased' | 'purchase_pending' | 'purchase_canceled';
}

/**
 * Handlers on `/app/sparks`.
 * - `onBuy`: ok `opened` with `redirectTo` the checkout (or, without a payment provider in development, back here
 *   with the pack counted). Errors: `not_allowed` (buying isn't offered), `rate_limited` (with `retryAt`), `unknown`.
 */
export interface SparksHandlers {
  onBuy: ActionHandler<{ pack: SparkPack }>;
}
