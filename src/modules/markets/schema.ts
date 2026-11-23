import { boolean, doublePrecision, integer, jsonb, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { createdAt, tsz, updatedAt } from '../../platform/db/columns';

/**
 * Markets, areas, categories, versioned policies and feature flags (docs/blueprint/08 §3, markets).
 * Simplification for launch (decisions.md): a market is a center + radius; an area is a named
 * center point, and a location's area is the nearest area center.
 */

/**
 * One seasonal starter on Neighbors (plan 10.18): the months it shows in (1–12, the market's clock), the kind of post
 * it starts, its service (a category slug), and its words in each language (the post's title to begin from).
 */
export interface CommunityPromptConfig {
  months: number[];
  kind: 'recommendation' | 'question' | 'tip';
  category?: string;
  en: string;
  es: string;
}

export const markets = pgTable('markets', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  state: text('state').notNull(),
  timeZone: text('time_zone').notNull(),
  currency: text('currency').notNull().default('USD'),
  status: text('status').notNull(), // prelaunch | live | paused
  centerLat: doublePrecision('center_lat').notNull(),
  centerLng: doublePrecision('center_lng').notNull(),
  serviceRadiusKm: integer('service_radius_km').notNull(),
  /**
   * The ZIP3 prefixes (first three digits of a ZIP) the market covers, e.g. Austin's ["786", "787"]. Helpers and
   * waitlist entries elsewhere in the US are matched to a market by their ZIP (src/modules/markets/coverage.ts).
   */
  zipPrefixes: jsonb('zip_prefixes').$type<string[]>().notNull().default([]),
  /**
   * Neighbors' seasonal starters (plan 10.18): ideas the composer offers in the months they fit (a city's move-out
   * weeks, storm season, leaf season), in English and Spanish. Market configuration, so a new city is a data change.
   * Null: the general starters (src/modules/community/starters.ts).
   */
  communityPrompts: jsonb('community_prompts').$type<CommunityPromptConfig[]>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const areas = pgTable(
  'areas',
  {
    id: text('id').primaryKey(),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    centerLat: doublePrecision('center_lat').notNull(),
    centerLng: doublePrecision('center_lng').notNull(),
  },
  (t) => [uniqueIndex('areas_market_slug_idx').on(t.marketId, t.slug)],
);

export interface RequiredEvidence {
  photosMin: number;
  hours: boolean;
  receipts: boolean;
  remoteNote: boolean;
}

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  inHome: boolean('in_home').notNull(),
  remoteAllowed: boolean('remote_allowed').notNull(),
  requiresBackgroundCheck: boolean('requires_background_check').notNull(),
  defaultPricingType: text('default_pricing_type').notNull(), // fixed | hourly
  minPriceCents: integer('min_price_cents').notNull(),
  minHours: integer('min_hours'),
  requiredEvidence: jsonb('required_evidence').$type<RequiredEvidence>().notNull(),
  prohibitedKeywords: jsonb('prohibited_keywords').$type<string[]>().notNull(),
  status: text('status').notNull().default('active'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export interface PriceGuidance {
  lowCents: number;
  highCents: number;
  unit: 'item' | 'hour' | 'task';
}

export const marketCategories = pgTable(
  'market_categories',
  {
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    enabled: boolean('enabled').notNull().default(true),
    priceGuidance: jsonb('price_guidance').$type<PriceGuidance>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.marketId, t.categoryId] })],
);

export interface FeeSchedule {
  posterBps: number;
  posterMinCents: number;
  helperBps: number;
}

export interface CancellationPolicy {
  freeUntilHours: number;
  lateFeeBps: number;
  lateFeeMinCents: number;
}

export interface PolicyTimers {
  autoApproveHours: number;
  inviteTtlHours: number;
  pendingFundingMinutes: number;
  noShowMinutes: number;
  addressHideAfterHours: number;
  maxLeadDays: number;
  minLeadHours: number;
}

/**
 * The optional plans' prices and what they add (completion plan 9.13, decisions.md 2026-11-18 and 2026-11-23). Null on
 * a policy version means the defaults (`DEFAULT_PLANS`, policy-defaults.ts).
 *
 * AI search: `aiSearchesPerDay` and `aiSearchesPerMonth`, calendar days and months in the person's market zone; null
 * means unlimited, and a version from before the daily limits (no `aiSearchesPerDay`) has none a day.
 * `posterFeeRebateBps`, `helperFeeRebateBps` and `rebateMonthlyCapCents` paid part of the service fees back on
 * completed bookings until 2026-11-23 (0 since: there are no service fees).
 */
export interface PlanPolicy {
  /** Plus: more AI searches (and, before 2026-11-23, the client fee's rebate). */
  plus: { monthlyCents: number; yearlyCents: number; posterFeeRebateBps: number; rebateMonthlyCapCents: number; aiSearchesPerMonth: number | null; aiSearchesPerDay?: number | null };
  /** Pro: everything in Plus, no hold fee, unlimited AI search (and, before 2026-11-23, the helper fee's rebate). */
  pro: { monthlyCents: number; yearlyCents: number; helperFeeRebateBps: number; rebateMonthlyCapCents: number; aiSearchesPerMonth: number | null; aiSearchesPerDay?: number | null };
  /** Starter: without a plan. */
  free: { aiSearchesPerMonth: number; aiSearchesPerDay?: number | null };
}

/** Immutable once published; bookings reference the version they were confirmed under. */
export const marketPolicies = pgTable(
  'market_policies',
  {
    id: text('id').primaryKey(),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    version: integer('version').notNull(),
    status: text('status').notNull(), // draft | published | retired
    effectiveFrom: tsz('effective_from'),
    fees: jsonb('fees').$type<FeeSchedule>().notNull(),
    cancellation: jsonb('cancellation').$type<CancellationPolicy>().notNull(),
    timers: jsonb('timers').$type<PolicyTimers>().notNull(),
    /** Plan prices and benefits (9.13); null: `DEFAULT_PLANS`. */
    plans: jsonb('plans').$type<PlanPolicy>(),
    publishedBy: text('published_by'),
    publishedAt: tsz('published_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('market_policies_market_version_idx').on(t.marketId, t.version)],
);

/** marketId "global" applies everywhere unless a market-specific row exists. */
export const featureFlags = pgTable(
  'feature_flags',
  {
    key: text('key').notNull(),
    marketId: text('market_id').notNull().default('global'),
    enabled: boolean('enabled').notNull(),
    description: text('description').notNull().default(''),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.key, t.marketId] })],
);
