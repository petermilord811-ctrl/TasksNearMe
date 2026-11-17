import 'server-only';
import type { MetadataRoute } from 'next';
import { cacheLife, cacheTag } from 'next/cache';
import { listHelpArticleDates, listPublishedLegalDocs } from '@/modules/content/loaders';
import { marketTag } from '@/modules/marketing/queries';
import { DEFAULT_MARKET_SLUG, findPublicMarket, listCategoryViews, listPublicMarketSlugs } from '@/modules/markets/queries';
import { listPublicProfileDates } from '@/modules/profiles/queries';
import { listOpenTaskDates } from '@/modules/tasks/queries';
import { appUrl } from '@/integrations/oauth';
import { db } from '@/platform/db/client';
import { searchEngineRows, type RowScope } from '@/shared/sample-data';
import { marketPagesIndexable } from './indexable';
import { sitemapEntries, sitemapPages, type SitemapData } from './sitemap-entries';

/** Open tasks listed per market, newest first: with both languages, well under the 50,000-URL limit. */
const TASKS_PER_MARKET = 10_000;

/**
 * The sitemap's entries, straight from the database (no cache): for the IndexNow job, which runs outside requests.
 * `listings` adds the task pages and helper profiles (the `on` mode, src/shared/search-indexing.ts). Addresses are
 * absolute against APP_URL, the address canonical links use. `rows` is what search engines read, never a visitor's
 * scope: real rows only wherever samples are hidden (src/shared/sample-data.ts `searchEngineRows`); tests pass theirs.
 */
export async function loadSitemapEntries(options: { listings: boolean; rows?: RowScope }): Promise<{ entries: MetadataRoute.Sitemap; marketSlugs: string[] }> {
  const now = new Date();
  const rows = options.rows ?? searchEngineRows();
  const marketSlugs = await listPublicMarketSlugs();
  const markets = await Promise.all(
    marketSlugs.map(async (slug) => {
      const market = await findPublicMarket(slug);
      if (!market) return null;
      const [categories, tasks] = await Promise.all([
        listCategoryViews(market.id),
        listOpenTaskDates(db, { marketId: market.id, now, limit: TASKS_PER_MARKET, rows }),
      ]);
      return {
        slug: market.slug,
        indexable: marketPagesIndexable(market, DEFAULT_MARKET_SLUG),
        categorySlugs: categories.map((category) => category.slug),
        tasks: tasks.map((task) => ({ slug: task.slug, categorySlug: task.categorySlug, updatedAt: task.updatedAt.toISOString() })),
      };
    }),
  );
  // Open tasks are loaded either way: market and category pages take their dates from them.
  const helpers = options.listings ? await listPublicProfileDates(db, rows) : [];
  const data: SitemapData = {
    homeMarketSlug: DEFAULT_MARKET_SLUG,
    markets: markets.filter((market) => market !== null),
    helpers: helpers.map((helper) => ({ handle: helper.handle, updatedAt: helper.updatedAt.toISOString() })),
    helpArticles: listHelpArticleDates(),
    legalDocs: listPublishedLegalDocs(),
  };
  return { entries: sitemapEntries(appUrl(), sitemapPages(data, options)), marketSlugs };
}

/**
 * The entries of /sitemap.xml (src/app/sitemap.ts). Cached like the public pages: rebuilt at most hourly, and sooner
 * when tasks, helpers or markets change (the cache tags their writes update). `rows` as in loadSitemapEntries (an
 * argument, so it's in the cache key).
 */
export async function getSitemap(options: { listings: boolean; rows: RowScope }): Promise<MetadataRoute.Sitemap> {
  'use cache';
  cacheLife('hours');
  cacheTag('sitemap', 'markets', 'tasks', 'helpers');
  const { entries, marketSlugs } = await loadSitemapEntries(options);
  for (const slug of marketSlugs) cacheTag(marketTag(slug));
  return entries;
}
