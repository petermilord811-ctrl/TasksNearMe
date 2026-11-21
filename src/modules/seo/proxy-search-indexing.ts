import { followsSearchSetting, searchIndexing, SEARCH_LISTINGS_FLAG, storedSearchIndexing, type SearchIndexing, type SearchIndexingBuild, type StoredSearchIndexing } from '@/shared/search-indexing';
import { proxyDatabase, type ProxyDatabase } from './proxy-database';

/**
 * This server's search mode for the proxy's X-Robots-Tag (src/proxy.ts): the admin setting (the config page's "Search
 * engines") read through the proxy's own connection and kept for 15 seconds, so a change reaches every page within that
 * on each server, without a restart or a deploy. Only where the setting can change the mode (the live site, the e2e
 * build); everywhere else the mode comes from the build alone and nothing is read. If the database can't answer, the
 * last answer stands, or the code's default when there is none.
 */
const KEEP_MS = 15_000;

export function createProxySearchIndexing(
  database: ProxyDatabase,
  options: { now?: () => number; env?: Record<string, string | undefined>; build?: SearchIndexingBuild } = {},
): () => Promise<SearchIndexing> {
  const now = options.now ?? Date.now;
  let kept: { stored: StoredSearchIndexing | null; at: number } | null = null;
  return async function mode() {
    const env = options.env ?? process.env;
    if (!followsSearchSetting(env, options.build)) return searchIndexing(env, options.build);
    if (!kept || now() - kept.at >= KEEP_MS) {
      try {
        const { rows } = await database.run("select enabled from feature_flags where key = $1 and market_id = 'global' limit 1", [SEARCH_LISTINGS_FLAG]);
        kept = { stored: storedSearchIndexing(rows[0] ? rows[0].enabled === true : undefined), at: now() };
      } catch {
        if (!kept) return searchIndexing(env, options.build);
      }
    }
    return searchIndexing(env, options.build, kept.stored);
  };
}

let shared: (() => Promise<SearchIndexing>) | null = null;

/** The mode src/proxy.ts uses, over the proxy's own connection. */
export function proxySearchIndexing(): Promise<SearchIndexing> {
  shared ??= createProxySearchIndexing(proxyDatabase());
  return shared();
}
