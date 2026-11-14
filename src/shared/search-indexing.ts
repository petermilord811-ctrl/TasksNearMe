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
 * The live site's choice, committed here so it ships with the code (no server setting). The owner's (2026-11-14):
 * `site` while the preview shows sample tasks and helpers. At launch, make it `on` and deploy.
 */
export const LIVE_SITE_INDEXING: SearchIndexing = 'site';

/** The live site's address. Every other copy of the app (development, the e2e build, a staging server) stays `off`. */
export const LIVE_SITE_HOST = 'tasksnearme.com';

/**
 * This server's mode (src/proxy.ts, src/app/robots.ts, src/app/sitemap.ts): LIVE_SITE_INDEXING in a production build
 * whose APP_URL is the live site, `off` anywhere else. SEARCH_INDEXING (off, site or on), if set where the server runs,
 * overrides that, for instance to see the sitemap with its listings on a development server; nothing requires it.
 * `build.production` follows how the app was built (Next inlines NODE_ENV; the e2e build is never deployed).
 */
export function searchIndexing(
  env: Record<string, string | undefined> = process.env,
  build: { production: boolean } = { production: process.env.NODE_ENV === 'production' && !E2E_BUILD },
): SearchIndexing {
  const setting = env.SEARCH_INDEXING?.trim().toLowerCase();
  if (setting === 'off' || setting === 'site' || setting === 'on') return setting;
  return build.production && hostOf(env.APP_URL) === LIVE_SITE_HOST ? LIVE_SITE_INDEXING : 'off';
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
