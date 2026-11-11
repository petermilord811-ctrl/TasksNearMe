import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { CategorySlug, CategoryView, MarketView } from '@/contracts';
import { CATEGORY_SLUGS } from '@/contracts';
import { db } from '@/platform/db/client';
import { areas, categories, featureFlags, marketCategories, marketPolicies, markets } from './schema';

/** The market the home page shows. Configurable so another city can launch without code changes. */
export const DEFAULT_MARKET_SLUG = process.env.DEFAULT_MARKET_SLUG ?? 'austin';

const PUBLIC_STATUSES = ['prelaunch', 'live'] as const;
const KM_PER_MILE = 1.609344;

export type MarketRow = typeof markets.$inferSelect;

/** A market people can see (pre-launch or live), or null. */
export async function findPublicMarket(slug: string): Promise<MarketRow | null> {
  const [row] = await db
    .select()
    .from(markets)
    .where(and(eq(markets.slug, slug), inArray(markets.status, [...PUBLIC_STATUSES])))
    .limit(1);
  return row ?? null;
}

export async function listPublicMarketSlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: markets.slug })
    .from(markets)
    .where(inArray(markets.status, [...PUBLIC_STATUSES]));
  return rows.map((row) => row.slug);
}

export async function getMarketView(market: MarketRow): Promise<MarketView> {
  const areaRows = await db
    .select({ name: areas.name })
    .from(areas)
    .where(eq(areas.marketId, market.id))
    .orderBy(asc(areas.name));
  return {
    slug: market.slug,
    name: market.name,
    state: market.state,
    status: market.status as MarketView['status'],
    areaNames: areaRows.map((row) => row.name),
    // "Within about N miles": round down so we never promise more than we cover.
    serviceRadiusMiles: Math.floor(market.serviceRadiusKm / KM_PER_MILE),
  };
}

function isCategorySlug(slug: string): slug is CategorySlug {
  return (CATEGORY_SLUGS as readonly string[]).includes(slug);
}

/** Categories enabled in the market, in display order. */
export async function listCategoryViews(marketId: string): Promise<CategoryView[]> {
  const rows = await db
    .select({ category: categories, priceGuidance: marketCategories.priceGuidance })
    .from(marketCategories)
    .innerJoin(categories, eq(categories.id, marketCategories.categoryId))
    .where(and(eq(marketCategories.marketId, marketId), eq(marketCategories.enabled, true), eq(categories.status, 'active')))
    .orderBy(asc(categories.sortOrder));

  return rows.flatMap(({ category, priceGuidance }) =>
    isCategorySlug(category.slug)
      ? [
          {
            slug: category.slug,
            name: category.name,
            inHome: category.inHome,
            remoteAllowed: category.remoteAllowed,
            requiresBackgroundCheck: category.requiresBackgroundCheck,
            defaultPricingType: category.defaultPricingType as CategoryView['defaultPricingType'],
            minPriceCents: category.minPriceCents,
            ...(category.minHours !== null ? { minHours: category.minHours } : {}),
            priceGuidance,
          },
        ]
      : [],
  );
}

/** The newest published policy version for the market. */
export async function getPublishedPolicy(marketId: string) {
  const [row] = await db
    .select()
    .from(marketPolicies)
    .where(and(eq(marketPolicies.marketId, marketId), eq(marketPolicies.status, 'published')))
    .orderBy(desc(marketPolicies.version))
    .limit(1);
  return row ?? null;
}

/** Feature flags for the market: a market-specific row overrides the global one. */
export async function getFlags(marketId: string): Promise<Record<string, boolean>> {
  const rows = await db
    .select({ key: featureFlags.key, marketId: featureFlags.marketId, enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(inArray(featureFlags.marketId, ['global', marketId]));
  const flags: Record<string, boolean> = {};
  for (const row of rows.filter((r) => r.marketId === 'global')) flags[row.key] = row.enabled;
  for (const row of rows.filter((r) => r.marketId !== 'global')) flags[row.key] = row.enabled;
  return flags;
}
