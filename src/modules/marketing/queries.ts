import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import type {
  BecomeHelperPageData,
  CategoryPageData,
  CategorySlug,
  HomePageData,
  ISODateTime,
  MarketPageData,
  PricingPageData,
} from '@/contracts';
import {
  DEFAULT_MARKET_SLUG,
  findPublicMarket,
  getFlags,
  getMarketView,
  getPublishedPolicy,
  listCategoryViews,
} from '@/modules/markets/queries';
import { countFoundingHelpers, listPublicHelpers } from '@/modules/profiles/queries';
import { buildBecomeHelperPageData, buildPricingPageData } from './page-data';

/**
 * Public marketing page data. Cached (Cache Components) so the pages prerender and stay fast;
 * tagged per market so admin changes to policies, flags, or helpers can refresh them.
 * `now` is captured with the data so relative times ("Posted 2 hours ago") match it.
 */

export const marketTag = (slug: string) => `market:${slug}`;

export interface WithNow<T> {
  data: T;
  now: ISODateTime;
}

const FEATURED_HELPERS = 3;

async function loadMarketPage(slug: string): Promise<WithNow<MarketPageData> | null> {
  const market = await findPublicMarket(slug);
  if (!market) return null;
  const [view, categories, featuredHelpers] = await Promise.all([
    getMarketView(market),
    listCategoryViews(market.id),
    listPublicHelpers({ marketId: market.id, limit: FEATURED_HELPERS }),
  ]);
  return {
    // Open tasks arrive with the tasks module (Phase 2); until then the empty state shows.
    data: { market: view, categories, recentTasks: [], featuredHelpers },
    now: new Date().toISOString(),
  };
}

export async function getHomePageData(): Promise<WithNow<HomePageData> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(marketTag(DEFAULT_MARKET_SLUG));
  return loadMarketPage(DEFAULT_MARKET_SLUG);
}

export async function getMarketPageData(slug: string): Promise<WithNow<MarketPageData> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(marketTag(slug));
  return loadMarketPage(slug);
}

export async function getCategoryPageData(
  marketSlug: string,
  categorySlug: string,
): Promise<WithNow<CategoryPageData> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(marketTag(marketSlug));
  const market = await findPublicMarket(marketSlug);
  if (!market) return null;
  const [view, categories] = await Promise.all([getMarketView(market), listCategoryViews(market.id)]);
  const category = categories.find((c) => c.slug === categorySlug);
  if (!category) return null;
  const topHelpers = await listPublicHelpers({
    marketId: market.id,
    categorySlug: category.slug as CategorySlug,
    limit: FEATURED_HELPERS,
  });
  return { data: { market: view, category, recentTasks: [], topHelpers }, now: new Date().toISOString() };
}

/** Category slugs per public market, for generateStaticParams. */
export async function listCategorySlugs(marketSlug: string): Promise<string[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(marketTag(marketSlug));
  const market = await findPublicMarket(marketSlug);
  return market ? (await listCategoryViews(market.id)).map((c) => c.slug) : [];
}

async function defaultMarketPolicy() {
  const market = await findPublicMarket(DEFAULT_MARKET_SLUG);
  if (!market) throw new Error(`Default market "${DEFAULT_MARKET_SLUG}" is missing. Run npm run db:seed.`);
  const policy = await getPublishedPolicy(market.id);
  if (!policy) throw new Error(`Market "${market.slug}" has no published policy.`);
  return { market, policy };
}

export async function getPricingPageData(): Promise<PricingPageData> {
  'use cache';
  cacheLife('hours');
  cacheTag(marketTag(DEFAULT_MARKET_SLUG));
  const { policy } = await defaultMarketPolicy();
  return buildPricingPageData(policy);
}

export async function getBecomeHelperPageData(): Promise<BecomeHelperPageData> {
  'use cache';
  cacheLife('hours');
  cacheTag(marketTag(DEFAULT_MARKET_SLUG));
  const { market, policy } = await defaultMarketPolicy();
  const [flags, foundingSpotsClaimed] = await Promise.all([getFlags(market.id), countFoundingHelpers(market.id)]);
  return buildBecomeHelperPageData({ fees: policy.fees, flags, foundingSpotsClaimed });
}
