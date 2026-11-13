import type { Cents, CategorySlug, ISODateTime } from './common';
import type { RewardProgramCode } from './status';

/**
 * Market metrics for staff (B-067; blueprint 11 E7, the launch targets in 01 §9): the funnel from posting to
 * booking again, liquidity by category and area, the launch targets, daily figures, and reward spend against
 * each program's budget and the helpers' monthly cap. Every number is computed on the server; the UI formats.
 * Money (contribution, reward spend) reaches finance and admins only (blueprint 08: finance keeps the budgets
 * and sees payments in full).
 */

/** The period: the last N market days, today included (`routes.admin.metrics(days)`). */
export const METRICS_PERIODS = [7, 30, 90] as const;
export type MetricsPeriodDays = (typeof METRICS_PERIODS)[number];
export const DEFAULT_METRICS_PERIOD: MetricsPeriodDays = 30;

/** A part of a whole. `percent` has one decimal (76.1) and is absent when the whole is 0. */
export interface MetricShare {
  part: number;
  whole: number;
  percent?: number;
}

/** The launch targets (01 §9), in the brief's order. */
export const METRIC_TARGET_IDS = [
  'offer_within_2h',
  'posted_to_booked',
  'bookings_completed',
  'bookings_disputed',
  'helper_reliability',
  'rebook_60d',
  'contribution_per_booking',
  'helpers_id_verified',
  'address_incidents',
] as const;
export type MetricTargetId = (typeof METRIC_TARGET_IDS)[number];

export type MetricArea = 'liquidity' | 'quality' | 'reliability' | 'retention' | 'economics' | 'trust' | 'privacy';

/**
 * - `met` / `missed`: against the target.
 * - `no_data`: nothing to measure in the period yet.
 * - `restricted`: a money figure, for finance and admins only.
 * - `not_measured`: the app can't count it (address exposure incidents are logged by hand: docs/runbooks).
 */
export type MetricTargetStatus = 'met' | 'missed' | 'no_data' | 'restricted' | 'not_measured';

export type MetricTargetValue =
  | { kind: 'share'; share: MetricShare }
  /** Per booking, over `bookings` completed bookings. */
  | { kind: 'money_per_booking'; cents: Cents; bookings: number }
  | { kind: 'count'; count: number };

export interface MetricTarget {
  id: MetricTargetId;
  area: MetricArea;
  comparison: 'at_least' | 'at_most';
  /** Percent targets (70 = 70%), cents for money, a count for counts. */
  target: { kind: 'percent'; percent: number } | { kind: 'money'; cents: Cents } | { kind: 'count'; count: number };
  /** Absent when `restricted`, `not_measured`, or `no_data`. */
  value?: MetricTargetValue;
  status: MetricTargetStatus;
  /** Items in the period whose outcome isn't known yet (open tasks, bookings still under way, completions under 60 days old). */
  maturing?: number;
}

export const FUNNEL_STEPS = ['posted', 'offered', 'booked', 'completed', 'rebooked'] as const;
export type FunnelStepId = (typeof FUNNEL_STEPS)[number];

/**
 * Tasks posted in the period (a cohort), followed to where they got: posted, got an offer, became a confirmed
 * booking (or one booked now and charged later), completed, and the client booked again within 60 days of it.
 */
export interface MetricsFunnelStep {
  id: FunnelStepId;
  count: number;
  /** Of the tasks posted. */
  ofPosted: MetricShare;
  /** Of the step before (the first step: of itself). */
  ofPrevious: MetricShare;
}

export interface MetricsFunnel {
  steps: MetricsFunnelStep[];
  /** Completions under 60 days old: `rebooked` can still grow. */
  rebookMaturing: number;
}

/** One market day (America/Chicago). */
export interface MetricsDay {
  /** `YYYY-MM-DD`, market time. */
  day: string;
  /** The day's market midnight (format this, not `day`). */
  startsAt: ISODateTime;
  posted: number;
  offers: number;
  /** Bookings made (confirmed, or booked now and charged later). */
  booked: number;
  completed: number;
  /** Of `booked`, by a client who had a completed booking before. */
  repeat: number;
  /** Finance and admins only. */
  rewardsDeliveredCents?: Cents;
}

/** The period's sums of the daily figures. */
export type MetricsTotals = Omit<MetricsDay, 'day' | 'startsAt'>;

export interface LiquidityFigures {
  /** Tasks posted 7 am–9 pm market time, at least 2 h ago: with an offer within 2 h. */
  offerWithin2h: MetricShare;
  /** Tasks posted at least 24 h ago: with an offer within 24 h. */
  offerWithin24h: MetricShare;
  /** The middle time to the first offer, in minutes (no offers: absent). */
  medianFirstOfferMinutes?: number;
  /** Posted tasks that became bookings. */
  filled: MetricShare;
}

export interface LiquidityRow extends LiquidityFigures {
  /** A category slug, an area id, or `remote` (remote tasks have no area). */
  key: string;
  /** Empty for remote tasks (the UI names them). */
  name: string;
  posted: number;
}

export interface MetricsLiquidity {
  overall: LiquidityFigures;
  /** Most posted first. */
  byCategory: (LiquidityRow & { category: CategorySlug })[];
  /** Most posted first; remote tasks last. */
  byArea: (LiquidityRow & { remote?: true })[];
}

export interface RewardProgramSpend {
  program: RewardProgramCode;
  /** Programs without a budget run on the helpers' monthly cap alone. */
  budgetCents?: Cents;
  /** Everything not voided or expired: pending to delivered. */
  committedCents: Cents;
  deliveredCents: Cents;
  /** `budgetCents − committedCents`, never below 0 (no budget: absent). */
  remainingCents?: Cents;
  /** Of the budget, committed (no budget: absent). */
  budgetUsedPercent?: number;
  /** Granted in the period (not voided since). */
  periodGrantedCents: Cents;
  periodGrants: number;
  periodDeliveredCents: Cents;
  /** Voided in the period. */
  periodVoided: number;
  /** Waiting for a review now. */
  inReview: number;
}

export interface MetricsRewardSpend {
  programs: RewardProgramSpend[];
  periodDeliveredCents: Cents;
  /** Each helper's cap per calendar month across every program (blueprint 05 §1). */
  monthlyCapCents: Cents;
  /** Helpers whose live rewards this month reach the cap, and those at 80% or more of it. */
  helpersAtCap: number;
  helpersNearCap: number;
}

/** `/admin/metrics`: every staff role reads it; money only for finance and admins. */
export interface AdminMetricsPageData {
  days: MetricsPeriodDays;
  /** The first day's market midnight; the period runs to `generatedAt`. */
  from: ISODateTime;
  generatedAt: ISODateTime;
  canSeeMoney: boolean;
  targets: MetricTarget[];
  funnel: MetricsFunnel;
  /** Oldest first, one per market day of the period. */
  daily: MetricsDay[];
  totals: MetricsTotals;
  liquidity: MetricsLiquidity;
  /** Finance and admins only. */
  rewards?: MetricsRewardSpend;
}
