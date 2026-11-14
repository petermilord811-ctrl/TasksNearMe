import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { appUrl } from '@/integrations/oauth';
import { robotsFile } from '@/modules/seo/robots';
import { searchIndexing } from '@/shared/search-indexing';

/**
 * /robots.txt (src/modules/seo/robots.ts). Rendered per request: whether crawlers are welcome depends on the server it
 * runs on (src/shared/search-indexing.ts: the live site's address, or an override), which a build can't know.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return robotsFile({ indexing: searchIndexing() !== 'off', baseUrl: appUrl() });
}
