import { devHelpersOn } from '@/shared/dev-helpers';
import { isLocalRequest } from '@/shared/local-request';

/**
 * The market the home page shows. Configurable so another city can launch without code changes. Its own module (no
 * database) so the admin Markets section can name it too: pausing it leaves the home page without a city (launch rehearsal J-L1).
 */
export const DEFAULT_MARKET_SLUG = process.env.DEFAULT_MARKET_SLUG?.trim() || 'gainesville';

/**
 * A browser's override of the home page's market, for tests only: with the development helpers on (`next dev` and the
 * e2e build, src/shared/dev-helpers.ts) and a request made on this machine (the dev server is also reachable from the
 * internet, like the test clock and the stand-ins: src/shared/local-request.ts), a spec can show the home page as if
 * its city weren't open (a slug that isn't public) without pausing a seeded market under the specs running beside it.
 * It never shows a market that isn't public: such a slug just gets the home without a city. Ignored in every other
 * build, and for anyone reaching the dev server through its public address.
 */
export const HOME_MARKET_COOKIE = 'tnm_home_market';

/** Whether this request may name the home page's market (development helpers on, and made on this machine). */
export function homeMarketOverridable(env: { NODE_ENV?: string }, header: (name: string) => string | null | undefined): boolean {
  return devHelpersOn(env) && isLocalRequest(header);
}

/** The market the home page shows for a request: the default, or (when it may: `homeMarketOverridable`) the cookie's. */
export function homeMarketSlug(cookieValue: string | undefined, overridable: boolean): string {
  return overridable && cookieValue && /^[a-z0-9-]{1,40}$/.test(cookieValue) ? cookieValue : DEFAULT_MARKET_SLUG;
}
