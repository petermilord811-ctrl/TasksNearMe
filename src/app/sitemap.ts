import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { currentSearchIndexing } from '@/modules/seo/indexing-setting';
import { getSitemap } from '@/modules/seo/sitemap';
import { searchEngineRows } from '@/shared/sample-data';

/**
 * /sitemap.xml: every indexable public page in English and Spanish, with hreflang (src/modules/seo/sitemap-entries.ts).
 * Task pages and helper profiles are listed only in the `on` mode (src/shared/search-indexing.ts), which depends on
 * the server it runs on and the admin search setting (read fresh), so the route renders per request; the data behind
 * it is cached, and changing the setting refreshes it. Never sample tasks or
 * people where samples are hidden, whoever asks (src/shared/sample-data.ts `searchEngineRows`).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  return getSitemap({ listings: (await currentSearchIndexing()) === 'on', rows: searchEngineRows() });
}
