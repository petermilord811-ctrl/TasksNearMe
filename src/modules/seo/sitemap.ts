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
import { sitemapEntries, sitemapPages, type SitemapData } from './sitemap-entries';

/** Open tasks listed per market, newest first: with both languages, well under the 50,000-URL limit. */
const TASKS_PER_MARKET = 10_000;

/**
 * The entries of /sitemap.xml (src/app/sitemap.ts). Cached like the public pages: rebuilt at most hourly, and sooner
 * when tasks, helpers or markets change (the cache tags their writes update). `listings` adds the task pages and
 * helper profiles (the `on` mode, src/shared/search-indexing.ts). Addresses are absolute against APP_URL, the address canonical links use.
 */
export async function getSitemap(options: { listings: boolean }): Promise<MetadataRoute.Sitemap> {
  'use cache';
  cacheLife('hours');
  cacheTag('sitemap', 'markets', 'tasks', 'helpers');
  const now = new Date();
  const markets = await Promise.all(
    (await listPublicMarketSlugs()).map(async (slug) => {
      cacheTag(marketTag(slug));
      const market = await findPublicMarket(slug);
      if (!market) return null;
      const [categories, tasks] = await Promise.all([
        listCategoryViews(market.id),
        listOpenTaskDates(db, { marketId: market.id, now, limit: TASKS_PER_MARKET }),
      ]);
      return {
        slug: market.slug,
        categorySlugs: categories.map((category) => category.slug),
        tasks: tasks.map((task) => ({ slug: task.slug, categorySlug: task.categorySlug, updatedAt: task.updatedAt.toISOString() })),
      };
    }),
  );
  // Open tasks are loaded either way: market and category pages take their dates from them.
  const helpers = options.listings ? await listPublicProfileDates() : [];
  const data: SitemapData = {
    homeMarketSlug: DEFAULT_MARKET_SLUG,
    markets: markets.filter((market) => market !== null),
    helpers: helpers.map((helper) => ({ handle: helper.handle, updatedAt: helper.updatedAt.toISOString() })),
    helpArticles: listHelpArticleDates(),
    legalDocs: listPublishedLegalDocs(),
  };
  return sitemapEntries(appUrl(), sitemapPages(data, options));
}
