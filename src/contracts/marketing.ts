import type { CategorySlug, Cents } from './common';
import type { PriceBreakdown } from './money';
import type { HelperSummary } from './people';
import type { TaskPublicView } from './tasks';

export interface PriceGuidance {
  lowCents: Cents;
  highCents: Cents;
  unit: 'item' | 'hour' | 'task';
}

export interface MarketView {
  slug: string;
  name: string;
  state: string;
  status: 'prelaunch' | 'live' | 'paused';
  /** Neighborhood names, used as coverage examples. */
  areaNames: string[];
  serviceRadiusMiles: number;
}

export interface CategoryView {
  slug: CategorySlug;
  name: string;
  inHome: boolean;
  remoteAllowed: boolean;
  requiresBackgroundCheck: boolean;
  defaultPricingType: 'fixed' | 'hourly';
  minPriceCents: Cents;
  minHours?: number;
  priceGuidance: PriceGuidance;
}

export interface HomePageData {
  market: MarketView;
  categories: CategoryView[];
  recentTasks: TaskPublicView[];
  featuredHelpers: HelperSummary[];
}

export interface MarketPageData {
  market: MarketView;
  categories: CategoryView[];
  recentTasks: TaskPublicView[];
  featuredHelpers: HelperSummary[];
}

export interface CategoryPageData {
  market: MarketView;
  category: CategoryView;
  /** Open tasks in this category (may be empty). */
  recentTasks: TaskPublicView[];
  topHelpers: HelperSummary[];
}

/** Everything the pricing page shows. Computed by the app's fee engine; the UI only displays it. */
export interface PricingPageData {
  fees: { posterFeePercent: number; posterMinimumCents: Cents; helperFeePercent: number };
  cancellation: { freeUntilHours: number; lateFeePercent: number; lateFeeMinimumCents: Cents };
  timers: { autoApproveHours: number; inviteHoldHours: number };
  /** $60 desk. */
  fixedExample: PriceBreakdown;
  /** $25 task where the $3.00 minimum fee applies. */
  minimumFeeExample: PriceBreakdown;
  /** Moving help, $35/h with a 4 h cap: what's charged up front, then the final after 3.5 h. */
  hourlyExample: { funded: PriceBreakdown; final: PriceBreakdown };
  /** Desk with a $20 allowance and an $8 receipt. */
  expensesExample: PriceBreakdown;
  lateCancellationExample: {
    taskPriceCents: Cents;
    feeCents: Cents;
    posterRefundCents: Cents;
    helperReceivesCents: Cents;
  };
}

export interface BecomeHelperPageData {
  /** The $60 desk from the helper's side (use the helper variant). */
  exampleEarnings: PriceBreakdown;
  /** "Your first payout can take about N days." */
  firstPayoutDays: number;
  /** Absent when the program is off or the cohort is full. */
  welcomeReward?: {
    amountCents: Cents;
    cohortLimit: number;
    spotsClaimed: number;
    minTaskPriceCents: Cents;
    windowDays: number;
    unlockDays: number;
  };
  repeatReward?: { amountCents: Cents; bookingsNeeded: number; withinDays: number };
  inHomeCategoriesRequireBackgroundCheck: boolean;
}
