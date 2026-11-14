import { z } from 'zod';
import type { ActionHandler, QueryHandler } from './actions';
import type { CategorySlug, Cents, ISODateTime } from './common';
import type { ContentBlock } from './content';
import { emailField, zipField } from './forms';
import type { PriceBreakdown, PricingInput } from './money';
import type { HelperSummary } from './people';
import type { WelcomeGiftCheck } from './rewards';
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
  /**
   * The $60 desk at the market's published fees (the fee engine's numbers): what the client pays and what
   * the helper earns. The landing page shows it as-is (UI-035); the UI never computes money.
   */
  feeExample: PriceBreakdown;
  /**
   * A few task prices at the same published fees, lowest first; one of them is `feeExample`. The pricing card
   * lets the visitor switch between them (the UI picks, the fee engine computed every number).
   */
  feeExamples: PriceBreakdown[];
  /**
   * The welcome gift card: every helper whose `checks` pass earns `amountCents` (blueprint 05 §2, 2026-11-14).
   * Absent when the program is off.
   */
  welcomeReward?: {
    amountCents: Cents;
    /** The checks that earn it, in order. */
    checks: readonly WelcomeGiftCheck[];
    /** @deprecated The gift card has no cohort since 2026-11-14; never set. Kept until the landing stops reading it. */
    cohortLimit?: number;
    /** @deprecated See `cohortLimit`; never set. */
    spotsClaimed?: number;
  };
  /** The landing page's map of open tasks (UI-036). */
  map: LandingMapData;
  /**
   * The market's `ai_drafting` flag, and the app can draft (a writer is set up): the hero's assistant may offer
   * "Draft it with AI", which carries the words to the posting wizard where the draft runs (signed in only).
   */
  aiDraftingEnabled: boolean;
  /**
   * Helpers in the market: active helpers with a verified ID, and how many of them have open time posted in the
   * next 7 days. Counts only (no names); the hero shows them when they aren't 0.
   */
  helpers: { verified: number; openThisWeek: number };
}

/** "Write it with AI" in the landing page's assistant: a title and a description written from the visitor's words. */
export interface LandingAiDraft {
  title: string;
  description: string;
}

/**
 * - `too_short`: fewer than 3 characters.
 * - `prohibited`: the words (or the request) are something that can't be posted.
 * - `rate_limited`: this visitor, or everyone today, has used up the free drafts.
 * - `unavailable`: AI drafting is off in this market, not set up, or failed.
 */
export type LandingAiSuggestResult =
  | { ok: true; draft: LandingAiDraft }
  | { ok: false; code: 'unavailable' | 'rate_limited' | 'prohibited' | 'too_short' };

/**
 * Handlers the landing page receives from its route (signed-out visitors). `onSuggestWithAi` runs only on an
 * explicit click (never per keystroke), is rate-limited per visitor and per day, and stores nothing it's given.
 * Absent (previews without a stand-in, tests): the assistant offers the wizard's "Draft it with AI" instead.
 */
export interface LandingHandlers {
  onSuggestWithAi?: QueryHandler<{ text: string; category: CategorySlug }, LandingAiSuggestResult>;
}

/**
 * An open task on the landing page's map. `point` is the task's public point, already moved 300–800 m from
 * the real place: draw it as a soft area (`radiusMeters`), never as an exact spot, and never show an address.
 */
export interface TaskMapPin {
  id: string;
  /** `routes.publicTask(slug)`. */
  slug: string;
  title: string;
  categorySlug: CategorySlug;
  areaName: string;
  point: { lat: number; lng: number };
  radiusMeters: number;
  budget: PricingInput;
  windowStart: ISODateTime;
  offerCount: number;
  /** When it was posted (the hero's line of new tasks says "12 min ago"). */
  postedAt: ISODateTime;
}

/** A neighborhood of the market, by its approximate center (for "go to a neighborhood" on the map). */
export interface MapArea {
  name: string;
  point: { lat: number; lng: number };
}

/**
 * The map on the landing page: the market's center and service radius (the first view, and what counts as
 * "near you"), the tile style the app chose (`styleUrl`, a MapLibre style; the tiles' attribution must stay
 * visible), the market's neighborhoods (alphabetical), and up to 60 open in-person tasks, newest first. The
 * visitor's own location, when they share it, stays in the browser: compare it with `distanceMiles` from
 * `@/shared/geo`.
 */
export interface LandingMapData {
  center: { lat: number; lng: number };
  serviceRadiusMiles: number;
  styleUrl: string;
  attribution: string;
  areas: MapArea[];
  pins: TaskMapPin[];
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
  /** Local substance for search and readers (SEO plan S3), in the page's language. Absent: the sections don't show. */
  seo?: CategorySeoContent;
}

/** A question people ask about a service, answered from the platform's rules and the page's own data. */
export interface FaqEntry {
  question: string;
  answer: string;
}

/** A link to a related page: other services in the city, its open tasks, pricing. */
export interface RelatedLink {
  label: string;
  href: string;
}

/**
 * What a category page adds for people arriving from search (docs/seo/PLAN.md S3). The counts are real rows only,
 * never sample data: the UI shows them only above 0. Every string is already in the page's language.
 */
export interface CategorySeoContent {
  /** Verified helpers offering this category in the city. */
  helperCount: number;
  /** Open tasks in this category in the city. */
  openTaskCount: number;
  /** A few paragraphs written for this city and category, when they exist in the page's language. */
  about?: ContentBlock[];
  faq: FaqEntry[];
  related: RelatedLink[];
}

/**
 * A city's cost guide for one service (docs/seo/PLAN.md S5): "How much does furniture assembly cost in Austin?",
 * answered with the same price guidance as the category page and worked examples from the fee engine.
 */
export interface CostGuidePageData {
  market: MarketView;
  /** Carries the typical price range (priceGuidance), the same numbers the category page shows. */
  category: CategoryView;
  /** The page's heading: the question people search, in the page's language. */
  question: string;
  /**
   * What a poster pays and what a helper earns at the low and the high end of the typical range: one item, one task,
   * or the category's minimum hours at the hourly rate.
   */
  examples: { low: PriceBreakdown; high: PriceBreakdown };
  /** The hours the hourly examples are worked out for (the category's minimum); absent for priced-per-item or per-task services. */
  exampleHours?: number;
  fees: { posterFeePercent: number; posterMinimumCents: Cents; helperFeePercent: number };
  /** The service's page, the city's open tasks and pricing, in the page's language. */
  related: RelatedLink[];
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
    /** What the poster paid for this task (the full refund when canceling in time). */
    posterPaidCents: Cents;
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
  /**
   * The welcome gift card for every helper whose `checks` pass (blueprint 05 §2, 2026-11-14). Absent when the
   * program is off.
   */
  welcomeReward?: {
    amountCents: Cents;
    /** The checks that earn it, in order. */
    checks: readonly WelcomeGiftCheck[];
    /** Days to redeem once our team's quick check is done. */
    redeemWithinDays: number;
    /** @deprecated The gift card has no cohort since 2026-11-14; never set. */
    cohortLimit?: number;
    /** @deprecated See `cohortLimit`; never set. */
    spotsClaimed?: number;
  };
  repeatReward?: {
    amountCents: Cents;
    /** The Nth paid booking with the same client… */
    bookingsNeeded: number;
    /** …within this many days of the first. */
    withinDays: number;
    /** Each booking counts when its task price is at least this much. */
    minTaskPriceCents: Cents;
    unlockDays: number;
    redeemWithinDays: number;
  };
  inHomeCategoriesRequireBackgroundCheck: boolean;
}

/**
 * How many people wait for us near a ZIP (owner, 2026-11-14: national, cities open in turn), by its ZIP3 prefix
 * (the first three digits: the USPS sectional center, about a metro area). Counts only, never who.
 * `waiting`: waitlist entries; `helpersWaiting`: helpers who signed up there and wait for the city to open.
 */
export interface WaitlistDemand {
  zip: string;
  /** Two-letter state code from the ZIP. */
  state: string;
  waiting: number;
  helpersWaiting: number;
}

/** A city people asked for, by the name they typed (cities with at least 3 people only). */
export interface WaitlistCity {
  city: string;
  state: string;
  /** Waitlist entries plus waiting helpers. */
  people: number;
  helpersWaiting: number;
}

/** `/waitlist`: people outside the cities we're open in leave their email, ZIP and city. */
export interface WaitlistPageData {
  /** Markets we serve or are about to open ("Already in Austin? See local help"). */
  markets: MarketView[];
  /** The most-asked-for cities we aren't in yet, most people first (up to 6). */
  comingNext: WaitlistCity[];
  /** `?zip=` from the link (posting's "We're not in Dallas yet"), to fill the form and show `demand`. */
  initialZip?: string;
  /** People already waiting near `initialZip`. */
  demand?: WaitlistDemand;
  /** Helpers anywhere in the US can get verified now and earn the welcome gift card (absent when the program is off). */
  helperReward?: { amountCents: Cents };
  /**
   * `beta`: sent here from an invite-only step (private beta, `routes.waitlist({ from: 'beta' })`), so the
   * page says the market is invite-only for now instead of "We're not in your city yet".
   */
  from?: 'beta';
}

export const WAITLIST_INTERESTS = ['need_help', 'give_help', 'both'] as const;
export type WaitlistInterest = (typeof WAITLIST_INTERESTS)[number];

export const waitlistInputSchema = z.object({
  email: emailField,
  zip: zipField,
  /** The city, as people call it (optional): groups demand by city on the waitlist page. */
  city: z.string().trim().max(60, 'too_long').optional(),
  interest: z.enum(WAITLIST_INTERESTS, 'required'),
});
export type WaitlistInput = z.input<typeof waitlistInputSchema>;

export interface WaitlistHandlers {
  /**
   * ok `submitted`: replace the form with the confirmation ("We'll email you when TasksNearMe
   * opens near 10001"). `validation_failed` + `fieldErrors`; `rate_limited` + `retryAt`.
   */
  onJoin: ActionHandler<WaitlistInput>;
}
