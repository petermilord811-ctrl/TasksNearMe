import { createMapboxGeocoder } from './mapbox';
import { GeocoderUnavailableError, type GeoPlace, type Geocoder } from './types';
import { devHelpersOn } from '@/shared/dev-helpers';

/**
 * Geocoding port (address autocomplete and lookup). With `MAPBOX_TOKEN`, Mapbox suggests real addresses and
 * confirms the chosen one on "Post" (`mapbox.ts`). Without it, development and tests use a fixed list of
 * fictional addresses, and production has no address search. Addresses never leave the server except to their
 * owner.
 *
 * Tests must never reach Mapbox, even where a token is set: a browser with the `tnm_geo_stand_in=1` cookie gets
 * the sample addresses (never in production), like the AI and sign-in stand-ins.
 */

export { GeocoderUnavailableError } from './types';
export type { GeoPlace, GeoSearchOptions, Geocoder } from './types';

export const GEO_STAND_IN_COOKIE = 'tnm_geo_stand_in';

/** Whether this request asked for the sample addresses. `cookieValue` is its `tnm_geo_stand_in` cookie. */
export function wantsGeoStandIn(cookieValue: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return devHelpersOn(env) && cookieValue === '1';
}

/** Fictional streets placed near Austin neighborhoods, plus two places outside the service area. */
export const FAKE_PLACES: readonly GeoPlace[] = [
  { placeId: 'plc_mueller_1234', line1: '1234 Example Lane', city: 'Austin', state: 'TX', zip: '78723', lat: 30.2985, lng: -97.7042 },
  { placeId: 'plc_mueller_1240', line1: '1240 Example Lane', city: 'Austin', state: 'TX', zip: '78723', lat: 30.2988, lng: -97.7039 },
  { placeId: 'plc_crestview_88', line1: '88 Sample Street', city: 'Austin', state: 'TX', zip: '78757', lat: 30.3466, lng: -97.7241 },
  { placeId: 'plc_windsor_300', line1: '300 Sample Street', city: 'Austin', state: 'TX', zip: '78723', lat: 30.3112, lng: -97.6935 },
  { placeId: 'plc_hydepark_402', line1: '402 Placeholder Avenue', city: 'Austin', state: 'TX', zip: '78751', lat: 30.3055, lng: -97.7279 },
  { placeId: 'plc_east_77', line1: '77 Demo Court', city: 'Austin', state: 'TX', zip: '78702', lat: 30.2625, lng: -97.7203 },
  { placeId: 'plc_travis_19', line1: '19 Fiction Road', city: 'Austin', state: 'TX', zip: '78704', lat: 30.2468, lng: -97.7455 },
  { placeId: 'plc_zilker_12', line1: '12 Example Lane', city: 'Austin', state: 'TX', zip: '78704', lat: 30.2605, lng: -97.7688 },
  { placeId: 'plc_circlec_510', line1: '510 Mock Trail', city: 'Austin', state: 'TX', zip: '78739', lat: 30.1866, lng: -97.8842 },
  { placeId: 'plc_roundrock_44', line1: '44 Sample Way', city: 'Round Rock', state: 'TX', zip: '78664', lat: 30.5083, lng: -97.6789 },
  { placeId: 'plc_waco_100', line1: '100 Example Road', city: 'Waco', state: 'TX', zip: '76701', lat: 31.5493, lng: -97.1467 },
  // Gainesville, FL, the first city (owner, 2026-11-17): the base seed's few tasks there.
  { placeId: 'plc_duckpond_2201', line1: '2201 Example Lane', city: 'Gainesville', state: 'FL', zip: '32601', lat: 29.6566, lng: -82.3193 },
  { placeId: 'plc_midtown_2207', line1: '2207 Sample Street', city: 'Gainesville', state: 'FL', zip: '32603', lat: 29.6528, lng: -82.3441 },
  { placeId: 'plc_haile_2213', line1: '2213 Placeholder Avenue', city: 'Gainesville', state: 'FL', zip: '32608', lat: 29.6101, lng: -82.4377 },
  { placeId: 'plc_gnv_northeast_2219', line1: '2219 Demo Court', city: 'Gainesville', state: 'FL', zip: '32609', lat: 29.6733, lng: -82.2998 },
];

const SAMPLE_PLACE_PREFIX = 'plc_';

export function createFakeGeocoder(places: readonly GeoPlace[] = FAKE_PLACES): Geocoder {
  return {
    name: 'fake',
    async search(query) {
      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return [];
      return places
        .filter((place) => {
          const text = `${place.line1} ${place.city} ${place.state} ${place.zip}`.toLowerCase();
          return tokens.every((token) => text.includes(token));
        })
        .slice(0, 5);
    },
    async resolve(placeId) {
      return places.find((place) => place.placeId === placeId) ?? null;
    },
  };
}

/** Outside production the sample places still resolve beside Mapbox, so seeded tasks and saved test drafts work. */
function withSamplePlaces(real: Geocoder, samples: Geocoder = createFakeGeocoder()): Geocoder {
  return {
    name: real.name,
    search: (query, options) => real.search(query, options),
    resolve: (placeId) => (placeId.startsWith(SAMPLE_PLACE_PREFIX) ? samples.resolve(placeId) : real.resolve(placeId)),
  };
}

/** Production without a token: no address search, rather than fictional addresses. */
const noAddressSearch: Geocoder = {
  name: 'none',
  async search() {
    throw new GeocoderUnavailableError('Address search is not set up: add MAPBOX_TOKEN.');
  },
  async resolve() {
    throw new GeocoderUnavailableError('Address search is not set up: add MAPBOX_TOKEN.');
  },
};

export function createGeocoder(env: Record<string, string | undefined> = process.env): Geocoder {
  const token = env.MAPBOX_TOKEN?.trim();
  if (token) {
    const secret = env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error('MAPBOX_TOKEN needs BETTER_AUTH_SECRET, which signs the addresses people choose.');
    const mapbox = createMapboxGeocoder({ token, secret });
    return !devHelpersOn(env) ? mapbox : withSamplePlaces(mapbox);
  }
  if (env.GOOGLE_MAPS_API_KEY?.trim()) {
    // TODO(integration): a Google Places adapter. Refuse to silently use fake data.
    throw new Error('GOOGLE_MAPS_API_KEY is set, but only the Mapbox adapter is built: use MAPBOX_TOKEN, or leave both empty.');
  }
  return !devHelpersOn(env) ? noAddressSearch : createFakeGeocoder();
}
