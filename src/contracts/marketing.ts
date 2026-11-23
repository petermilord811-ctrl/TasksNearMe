import { z } from 'zod';
import type { ActionHandler, ActionResult, QueryHandler } from './actions';
import type { PlanOffer } from './billing';
import type { CategorySlug, Cents, ISODateTime, TimeZone } from './common';
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
  /** Its IANA zone: its tasks' dates are shown, and its days start, on this clock (completion plan 8.1). */
  timeZone: TimeZone;
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

/**
 * One task price, paid both ways (no service fees since 2026-11-23): `direct`, to the helper after the task, with no
 * fees; `held`, upfront, which TasksNearMe holds until the client says the task is done (the client's hold fee).
 */
export interface FeeExample {
  direct: PriceBreakdown;
  held: PriceBreakdown;
}

export interface HomePageData {
  market: MarketView;
  categories: CategoryView[];
  recentTasks: TaskPublicView[];
  featuredHelpers: HelperSummary[];
  /**
   * The $60 desk held by TasksNearMe at the market's published fees (the fee engine's numbers): what the client pays
   * and what the helper gets. The landing page shows it as-is (UI-035); the UI never computes money.
   */
  feeExample: PriceBreakdown;
  /**
   * A few task prices, lowest first, each paid both ways; one of them is `feeExample`'s price. The pricing card lets
   * the visitor switch prices and ways to pay (the UI picks, the fee engine computed every number).
   */
  feeExamples: FeeExample[];
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
  /** The window's end (the map's Today / This weekend / This week keep a task whose window touches the range). */
  windowEnd: ISODateTime;
  offerCount: number;
  /** When it was posted (the hero's line of new tasks says "12 min ago"). */
  postedAt: ISODateTime;
}

/**
 * A neighborhood of the market, by its approximate center (for "go to a neighborhood" on the map). Each task is named
 * after the neighborhood whose center is nearest, so the map draws each one as the part of the city nearest its
 * center. `slug` is the board's `area` filter (and a saved search's). `helperCount`: active helpers with a verified ID
 * who work from it (a count only).
 */
export interface MapArea {
  name: string;
  slug: string;
  point: { lat: number; lng: number };
  helperCount: number;
}

/**
 * A signed-in helper's home on the landing page's map: the neighborhood of the home address they gave for their
 * address check (its center, never the address), shown only to them. The map starts from it instead of asking the
 * browser where they are.
 */
export interface MapHome {
  areaName: string;
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
  /** Every city open or opening, for the minimap's view of the country (the demo marketplace's only for testers). */
  cities: MapCity[];
}

/** A city TasksNearMe is open in or opening in, by its center: the landing map's minimap shows the country with them. */
export interface MapCity {
  slug: string;
  name: string;
  state: string;
  status: 'live' | 'prelaunch';
  point: { lat: number; lng: number };
}

export interface MarketPageData {
  market: MarketView;
  categories: CategoryView[];
  recentTasks: TaskPublicView[];
  featuredHelpers: HelperSummary[];
  /**
   * The city's own guide, in the page's language (content/cities): the area it covers, its year, prices and safety.
   * Absent: the section doesn't show.
   */
  about?: ContentBlock[];
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
   * What a client pays at the low and the high end of the typical range when the payment is held by TasksNearMe (the
   * hold fee; paid directly, it's just the price): one item, one task, or the category's minimum hours at the rate.
   * Helpers get the whole price either way (no service fees since 2026-11-23).
   */
  examples: { low: PriceBreakdown; high: PriceBreakdown };
  /** The hours the hourly examples are worked out for (the category's minimum); absent for priced-per-item or per-task services. */
  exampleHours?: number;
  /** The only fee: on a payment TasksNearMe holds, paid by the client. */
  holdFee: { percent: number; minimumCents: Cents };
  /** The service's page, the city's open tasks and pricing, in the page's language. */
  related: RelatedLink[];
}

/** Everything the pricing page shows. Computed by the app's fee engine; the UI only displays it. */
/**
 * `/pricing` (rewritten 2026-11-23, owner: "Totally remove service fee feature … Change the pricing page totally … deep
 * think about subscription plan (as LinkedIn premium)"). No service fees: posting, offers, messages and booking are
 * free, and a client pays the helper directly unless the helper asks to be paid upfront, when TasksNearMe holds the
 * money and the client pays the hold fee (none with Plus). Helpers pay nothing. Revenue is the plans.
 */
export interface PricingPageData {
  /** The only fee: on a held payment, paid by the client. */
  holdFee: { percent: number; minimumCents: Cents };
  /** The $60 desk: paid directly (no fee), and held (the price plus the hold fee; the helper gets the whole price). */
  examples: { direct: PriceBreakdown; held: PriceBreakdown };
  /** Held bookings only: free to cancel until `freeUntilHours` before the start; later, the helper gets `lateFeePercent`. */
  cancellation: { freeUntilHours: number; lateFeePercent: number; lateFeeMinimumCents: Cents };
  /** A held payment goes to the helper this long after the work is sent, unless the client answers first. */
  timers: { autoApproveHours: number };
  /** AI searches a month without a plan. */
  freeAiSearches: number;
  /** The plans, Plus first; absent where they aren't open (no Stripe here). */
  plans?: PlanOffer[];
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

/** A city we're in, about to open, or paused for now, for the home page when its own city isn't open. */
export interface CityStatus {
  slug: string;
  name: string;
  state: string;
  status: MarketView['status'];
}

/**
 * The home page when the default city isn't public (paused, or none open; launch rehearsal J-L1): no city's counts or
 * map, but every city with its status (live first; paused ones aren't linked, their pages answer 404), the waitlist
 * sign-up (its page's data), and how it works.
 */
export interface CitylessHomeData {
  cities: CityStatus[];
  waitlist: Omit<WaitlistPageData, 'initialZip' | 'demand' | 'from'>;
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
  /**
   * The city, as people call it (optional): groups demand by city on the waitlist page, which is public. Letters,
   * spaces and the punctuation of place names only, so it can't carry a number, an address or a link (security review).
   */
  city: z
    .string()
    .trim()
    .max(60, 'too_long')
    .regex(/^[\p{L}\p{M}\s.'’,()-]*$/u, 'invalid')
    .optional(),
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

/**
 * `routes.waitlistUnsubscribe(token)`: from the unsubscribe link in a waitlist email (the one telling someone their
 * city opened, completion plan 8.3), without signing in. `confirm` asks first; `unsubscribed`: they're already off
 * (offer to turn the emails back on); `invalid`: the link doesn't work (copied in part, or more than a year old). It
 * never says whose address it is.
 */
export interface WaitlistUnsubscribePageData {
  state: 'confirm' | 'unsubscribed' | 'invalid';
}

/** Both resolve with ok `updated`. Errors: `not_allowed` (a link that doesn't work), `rate_limited` with `retryAt`, `unknown`. */
export interface WaitlistUnsubscribeHandlers {
  onUnsubscribe: () => Promise<ActionResult>;
  onResubscribe: () => Promise<ActionResult>;
}
