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

/**
 * The states each one borders on land (DC with Maryland and Virginia; Alaska and Hawaii with none), for a state page's
 * "Other states" (audit L26, 2026-11-18: Florida listed DC and Georgia, its alphabetical neighbors).
 */
export const STATE_NEIGHBORS: Record<DirectoryStateCode, readonly DirectoryStateCode[]> = {
  AL: ['FL', 'GA', 'MS', 'TN'], AK: [], AZ: ['CA', 'CO', 'NM', 'NV', 'UT'], AR: ['LA', 'MO', 'MS', 'OK', 'TN', 'TX'],
  CA: ['AZ', 'NV', 'OR'], CO: ['AZ', 'KS', 'NE', 'NM', 'OK', 'UT', 'WY'], CT: ['MA', 'NY', 'RI'], DE: ['MD', 'NJ', 'PA'],
  DC: ['MD', 'VA'], FL: ['AL', 'GA'], GA: ['AL', 'FL', 'NC', 'SC', 'TN'], HI: [], ID: ['MT', 'NV', 'OR', 'UT', 'WA', 'WY'],
  IL: ['IA', 'IN', 'KY', 'MO', 'WI'], IN: ['IL', 'KY', 'MI', 'OH'], IA: ['IL', 'MN', 'MO', 'NE', 'SD', 'WI'],
  KS: ['CO', 'MO', 'NE', 'OK'], KY: ['IL', 'IN', 'MO', 'OH', 'TN', 'VA', 'WV'], LA: ['AR', 'MS', 'TX'], ME: ['NH'],
  MD: ['DC', 'DE', 'PA', 'VA', 'WV'], MA: ['CT', 'NH', 'NY', 'RI', 'VT'], MI: ['IN', 'OH', 'WI'], MN: ['IA', 'ND', 'SD', 'WI'],
  MS: ['AL', 'AR', 'LA', 'TN'], MO: ['AR', 'IA', 'IL', 'KS', 'KY', 'NE', 'OK', 'TN'], MT: ['ID', 'ND', 'SD', 'WY'],
  NE: ['CO', 'IA', 'KS', 'MO', 'SD', 'WY'], NV: ['AZ', 'CA', 'ID', 'OR', 'UT'], NH: ['MA', 'ME', 'VT'], NJ: ['DE', 'NY', 'PA'],
  NM: ['AZ', 'CO', 'OK', 'TX', 'UT'], NY: ['CT', 'MA', 'NJ', 'PA', 'VT'], NC: ['GA', 'SC', 'TN', 'VA'], ND: ['MN', 'MT', 'SD'],
  OH: ['IN', 'KY', 'MI', 'PA', 'WV'], OK: ['AR', 'CO', 'KS', 'MO', 'NM', 'TX'], OR: ['CA', 'ID', 'NV', 'WA'],
  PA: ['DE', 'MD', 'NJ', 'NY', 'OH', 'WV'], RI: ['CT', 'MA'], SC: ['GA', 'NC'], SD: ['IA', 'MN', 'MT', 'ND', 'NE', 'WY'],
  TN: ['AL', 'AR', 'GA', 'KY', 'MO', 'MS', 'NC', 'VA'], TX: ['AR', 'LA', 'NM', 'OK'], UT: ['AZ', 'CO', 'ID', 'NM', 'NV', 'WY'],
  VT: ['MA', 'NH', 'NY'], VA: ['DC', 'KY', 'MD', 'NC', 'TN', 'WV'], WA: ['ID', 'OR'], WV: ['KY', 'MD', 'OH', 'PA', 'VA'],
  WI: ['IA', 'IL', 'MI', 'MN'], WY: ['CO', 'ID', 'MT', 'NE', 'SD', 'UT'],
};

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
