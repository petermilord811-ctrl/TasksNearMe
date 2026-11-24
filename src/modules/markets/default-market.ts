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

/**
 * The city a visitor picked in the landing map's city switcher (`loadLandingCity`), so the landing opens on it next
 * time (owner, 2026-11-23: "This platform is not for only Gainesville"). It holds the city's slug only, never a
 * location: the city a visitor's location falls in is worked out on their device and never stored. A year, like the
 * language.
 */
export const LANDING_CITY_COOKIE = 'tnm_city';
export const LANDING_CITY_COOKIE_OPTIONS = { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true } as const;

/** A slug as markets have them (lowercase letters, digits and hyphens): anything else from a cookie is ignored. */
export function validMarketSlug(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value);
}

/** Whether this request may name the home page's market (development helpers on, and made on this machine). */
export function homeMarketOverridable(env: { NODE_ENV?: string }, header: (name: string) => string | null | undefined): boolean {
  return devHelpersOn(env) && isLocalRequest(header);
}

/** The market the home page shows for a request: the default, or (when it may: `homeMarketOverridable`) the cookie's. */
export function homeMarketSlug(cookieValue: string | undefined, overridable: boolean): string {
  return homeMarketOverride(cookieValue, overridable) ?? DEFAULT_MARKET_SLUG;
}

/** A test's override of the home page's market (`HOME_MARKET_COOKIE`), when this request may name one. */
export function homeMarketOverride(cookieValue: string | undefined, overridable: boolean): string | null {
  return overridable && validMarketSlug(cookieValue) ? cookieValue : null;
}

/**
 * The cities the landing may open on, best first: the one the visitor picked (`LANDING_CITY_COOKIE`), then a signed-in
 * person's own city, then the default. The page shows the first that's open or opening (and visible to the visitor),
 * so a picked city that has since paused falls back by itself.
 */
export function landingCityCandidates(picked: string | null | undefined, own: string | null | undefined): string[] {
  return [...new Set([picked, own, DEFAULT_MARKET_SLUG].filter(validMarketSlug))];
}
