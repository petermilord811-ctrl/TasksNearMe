/**
 * Gainesville, FL: the first city (owner, 2026-11-17; completion plan 8.6), in Eastern time. Area centers are
 * approximate neighborhood centers (OpenStreetMap, 2026-11-17). Its categories and published policy start as copies of
 * Austin's: the same price guidance until Gainesville has bookings of its own.
 *
 * Production gets these rows from migration 0061 (fixed ids, so the seed and the migration agree); fresh databases get
 * them from the base seed. Ids are fixed seed ids like Austin's, which the sample-data rule never applies to markets.
 */
export const GAINESVILLE = {
  id: 'mkt_gainesville',
  slug: 'gainesville',
  name: 'Gainesville',
  state: 'FL',
  timeZone: 'America/New_York',
  currency: 'USD',
  // Pre-launch: the first city. Migration 0063 opened it in production (0061 put it in paused until plan 8.1 landed).
  status: 'prelaunch',
  centerLat: 29.6516,
  centerLng: -82.3248,
  serviceRadiusKm: 25,
} as const;

/** ZIP3 326: Gainesville and the rest of Alachua County (Alachua, Newberry, High Springs, Archer, Micanopy, Hawthorne). */
export const GAINESVILLE_ZIP_PREFIXES: string[] = ['326'];

/** Gainesville's published policy (v1), as of the day it became the first city. */
export const GAINESVILLE_POLICY_ID = 'pol_gainesville_v1';
export const GAINESVILLE_POLICY_EFFECTIVE_FROM = '2026-11-17T05:00:00.000Z';

export const GAINESVILLE_AREAS: Array<{ slug: string; name: string; lat: number; lng: number; zip: string }> = [
  { slug: 'downtown', name: 'Downtown', lat: 29.6516, lng: -82.3248, zip: '32601' },
  { slug: 'duckpond', name: 'Duckpond', lat: 29.6564, lng: -82.3197, zip: '32601' },
  { slug: 'pleasant-street', name: 'Pleasant Street', lat: 29.6557, lng: -82.3282, zip: '32601' },
  { slug: 'university-heights', name: 'University Heights', lat: 29.648, lng: -82.335, zip: '32601' },
  { slug: 'midtown', name: 'Midtown', lat: 29.6525, lng: -82.3445, zip: '32603' },
  { slug: 'golfview', name: 'Golfview', lat: 29.6463, lng: -82.3634, zip: '32608' },
  { slug: 'thornebrook', name: 'Thornebrook', lat: 29.6755, lng: -82.3876, zip: '32605' },
  { slug: 'millhopper', name: 'Millhopper', lat: 29.695, lng: -82.392, zip: '32606' },
  { slug: 'northeast', name: 'Northeast Gainesville', lat: 29.673, lng: -82.3002, zip: '32609' },
  { slug: 'southeast', name: 'Southeast Gainesville', lat: 29.64, lng: -82.3009, zip: '32641' },
  { slug: 'southwest', name: 'Southwest Gainesville', lat: 29.6233, lng: -82.3794, zip: '32608' },
  { slug: 'haile-plantation', name: 'Haile Plantation', lat: 29.6097, lng: -82.4382, zip: '32608' },
];

/** `area_gnv_<slug>`: Austin's areas are `area_<slug>`, and both cities have a Downtown. */
export function gainesvilleAreaId(slug: string): string {
  return `area_gnv_${slug.replaceAll('-', '_')}`;
}
