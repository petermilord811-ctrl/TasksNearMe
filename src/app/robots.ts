import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { appUrl } from '@/integrations/oauth';
import { currentSearchIndexing } from '@/modules/seo/indexing-setting';
import { robotsFile } from '@/modules/seo/robots';

/**
 * /robots.txt (src/modules/seo/robots.ts). Rendered per request: whether crawlers are welcome depends on the server it
 * runs on (src/shared/search-indexing.ts: the live site's address, or an override), which a build can't know, and on
 * the admin search setting, read fresh each time.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return robotsFile({ indexing: (await currentSearchIndexing()) !== 'off', baseUrl: appUrl() });
}
