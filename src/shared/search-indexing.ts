import { routes } from '@/contracts';
import { E2E_BUILD } from './dev-helpers';

/**
 * What search engines may index:
 * - `off`: nothing. robots.txt asks every crawler to stay out and every page answers `X-Robots-Tag: noindex, nofollow`.
 * - `site`: the site's own pages (home, markets, categories, task boards, how it works, pricing, becoming a helper,
 *   trust and safety, help, legal texts in effect), not the listings: task pages and helper profiles answer `noindex`
 *   and the sitemap leaves them out.
 * - `on`: every public page, listings included.
 * Each page's own robots metadata still applies on top (sign-in, the waitlist, closed tasks, draft legal texts).
 */
export type SearchIndexing = 'off' | 'site' | 'on';

/**
 * The live site's default, until an admin changes the setting below. The owner's (2026-11-14): `site` while the preview
 * shows sample tasks and helpers. On launch day staff open the listings from the config page (no deploy).
 */
export const LIVE_SITE_INDEXING: SearchIndexing = 'site';

/** The live site's address. Every other copy of the app (development, a staging server) stays `off`. */
export const LIVE_SITE_HOST = 'tasksnearme.com';

/**
 * The admin setting (the config page's "Search engines", src/modules/seo/indexing-setting.ts): whether task pages and
 * helper profiles join search, so opening them at launch needs no deploy (launch runbook, sweep J-L6). Kept as this
 * global feature flag, absent until an admin first changes it; every change is audited with its reason.
 */
export const SEARCH_LISTINGS_FLAG = 'search.listings';

/** The stored setting, from that flag: `on` when set, `site` when turned off, null when never set. */
export function storedSearchIndexing(listings: boolean | undefined): StoredSearchIndexing | null {
  return listings === undefined ? null : listings ? 'on' : 'site';
}
export type StoredSearchIndexing = Exclude<SearchIndexing, 'off'>;

export interface SearchIndexingBuild {
  /** A production build other than the e2e build (Next inlines NODE_ENV). */
  production: boolean;
  /** The e2e suite's production build (src/shared/dev-helpers.ts): never deployed, it serves this machine only. */
  e2e?: boolean;
}
const THIS_BUILD: SearchIndexingBuild = { production: process.env.NODE_ENV === 'production' && !E2E_BUILD, e2e: E2E_BUILD };

/** SEARCH_INDEXING (off, site or on), if set where the server runs. */
function forcedMode(env: Record<string, string | undefined>): SearchIndexing | null {
  const setting = env.SEARCH_INDEXING?.trim().toLowerCase();
  return setting === 'off' || setting === 'site' || setting === 'on' ? setting : null;
}

function isLiveSite(env: Record<string, string | undefined>, build: SearchIndexingBuild): boolean {
  return build.production && hostOf(env.APP_URL) === LIVE_SITE_HOST;
}

/** Whether this server's mode depends on the admin setting, so callers read it only then. */
export function followsSearchSetting(env: Record<string, string | undefined> = process.env, build: SearchIndexingBuild = THIS_BUILD): boolean {
  return forcedMode(env) === null && (isLiveSite(env, build) || build.e2e === true);
}

/**
 * This server's mode (src/proxy.ts, src/app/robots.ts, src/app/sitemap.ts, the IndexNow job), given the admin setting
 * (`stored`, null when never set): on the live site (a production build whose APP_URL is tasksnearme.com) the setting,
 * else LIVE_SITE_INDEXING; anywhere else `off`, so no other copy of the app is ever indexed, whatever its database
 * says. The e2e build follows the setting once a test sets it (seo.spec flips it), and is `off` otherwise.
 * SEARCH_INDEXING (off, site or on), if set where the server runs, overrides all of it, for instance to see the sitemap
 * with its listings on a development server; nothing requires it.
 */
export function searchIndexing(
  env: Record<string, string | undefined> = process.env,
  build: SearchIndexingBuild = THIS_BUILD,
  stored: StoredSearchIndexing | null = null,
): SearchIndexing {
  const forced = forcedMode(env);
  if (forced) return forced;
  if (isLiveSite(env, build)) return stored ?? LIVE_SITE_INDEXING;
  if (build.e2e) return stored ?? 'off';
  return 'off';
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Task pages and helper profiles: the listings `site` keeps out of search. */
const LISTING_PREFIXES = [routes.publicTask(''), routes.helperProfile('')];

function isUnder(path: string, section: string): boolean {
  return path === section || path.startsWith(`${section}/`);
}

/**
 * The X-Robots-Tag a page answers with, if any (src/proxy.ts), given its path without the language prefix.
 * Signed-in and staff pages never belong in search, whatever the mode and their own metadata say.
 */
export function robotsHeaderFor(mode: SearchIndexing, path: string): string | null {
  if (mode === 'off' || isUnder(path, '/app') || isUnder(path, '/admin')) return 'noindex, nofollow';
  // Crawlers may still follow a listing's links (its city, its category, similar tasks).
  if (mode === 'site' && LISTING_PREFIXES.some((prefix) => path.startsWith(prefix))) return 'noindex';
  return null;
}
