import type { UsStateCode } from './us-zip';

/**
 * The 50 states and DC as `/cities/<slug>` pages (completion plan 8.7): one page per state, never one per city or
 * city × service without local helpers (Google's doorway and scaled-content policies). Names come from the copy
 * (`server.states.<code>`), so pages read them in their own language; slugs stay English in every language.
 */
export const DIRECTORY_STATES = [
  ['AL', 'alabama'], ['AK', 'alaska'], ['AZ', 'arizona'], ['AR', 'arkansas'], ['CA', 'california'], ['CO', 'colorado'],
  ['CT', 'connecticut'], ['DE', 'delaware'], ['DC', 'district-of-columbia'], ['FL', 'florida'], ['GA', 'georgia'],
  ['HI', 'hawaii'], ['ID', 'idaho'], ['IL', 'illinois'], ['IN', 'indiana'], ['IA', 'iowa'], ['KS', 'kansas'],
  ['KY', 'kentucky'], ['LA', 'louisiana'], ['ME', 'maine'], ['MD', 'maryland'], ['MA', 'massachusetts'], ['MI', 'michigan'],
  ['MN', 'minnesota'], ['MS', 'mississippi'], ['MO', 'missouri'], ['MT', 'montana'], ['NE', 'nebraska'], ['NV', 'nevada'],
  ['NH', 'new-hampshire'], ['NJ', 'new-jersey'], ['NM', 'new-mexico'], ['NY', 'new-york'], ['NC', 'north-carolina'],
  ['ND', 'north-dakota'], ['OH', 'ohio'], ['OK', 'oklahoma'], ['OR', 'oregon'], ['PA', 'pennsylvania'], ['RI', 'rhode-island'],
  ['SC', 'south-carolina'], ['SD', 'south-dakota'], ['TN', 'tennessee'], ['TX', 'texas'], ['UT', 'utah'], ['VT', 'vermont'],
  ['VA', 'virginia'], ['WA', 'washington'], ['WV', 'west-virginia'], ['WI', 'wisconsin'], ['WY', 'wyoming'],
] as const satisfies ReadonlyArray<readonly [UsStateCode, string]>;

export type DirectoryStateCode = (typeof DIRECTORY_STATES)[number][0];
export type DirectoryStateSlug = (typeof DIRECTORY_STATES)[number][1];

const BY_SLUG = new Map<string, DirectoryStateCode>(DIRECTORY_STATES.map(([code, slug]) => [slug, code]));
const BY_CODE = new Map<string, DirectoryStateSlug>(DIRECTORY_STATES.map(([code, slug]) => [code, slug]));

/** The state a `/cities/<slug>` page is about, or null for anything else. */
export function stateCodeOfSlug(slug: string): DirectoryStateCode | null {
  return BY_SLUG.get(slug) ?? null;
}

/** A state's `/cities/<slug>` slug, or null for territories and anything that isn't a state code. */
export function stateSlugOf(code: string): DirectoryStateSlug | null {
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

/**
 * Whether a state's page belongs in search: only with something real to show, a city we're open in (live or
 * pre-launch) or people who asked for one. Other state pages still work for visitors, with noindex.
 */
export function statePageIndexable(state: { openCities: number; peopleWaiting: number }): boolean {
  return state.openCities > 0 || state.peopleWaiting > 0;
}
