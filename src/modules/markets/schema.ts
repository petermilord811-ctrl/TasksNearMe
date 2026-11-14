import { boolean, doublePrecision, integer, jsonb, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { createdAt, tsz, updatedAt } from '../../platform/db/columns';

/**
 * Markets, areas, categories, versioned policies and feature flags (docs/blueprint/08 §3, markets).
 * Simplification for launch (decisions.md): a market is a center + radius; an area is a named
 * center point, and a location's area is the nearest area center.
 */

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
