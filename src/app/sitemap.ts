import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { getSitemap } from '@/modules/seo/sitemap';
import { searchEngineRows } from '@/shared/sample-data';
import { searchIndexing } from '@/shared/search-indexing';

/**
 * /sitemap.xml: every indexable public page in English and Spanish, with hreflang (src/modules/seo/sitemap-entries.ts).
 * Task pages and helper profiles are listed only in the `on` mode (src/shared/search-indexing.ts), which depends on
 * the server it runs on, so the route renders per request; the data behind it is cached. Never sample tasks or
 * people where samples are hidden, whoever asks (src/shared/sample-data.ts `searchEngineRows`).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  return getSitemap({ listings: searchIndexing() === 'on', rows: searchEngineRows() });
}
