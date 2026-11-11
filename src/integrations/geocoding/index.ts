/**
 * Geocoding port (address autocomplete and lookup). Development and tests use a fixed list of
 * fictional addresses; production plugs in a real provider (Google Places or Mapbox) here once a
 * key exists (see blocked.md). Addresses never leave the server except to their owner.
 */
export interface GeoPlace {
  placeId: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
}

export interface Geocoder {
  readonly name: string;
  /** Up to 5 matches for what someone has typed. */
  search(query: string): Promise<GeoPlace[]>;
  resolve(placeId: string): Promise<GeoPlace | null>;
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
];

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

export function createGeocoder(): Geocoder {
  if (process.env.GOOGLE_MAPS_API_KEY || process.env.MAPBOX_TOKEN) {
    // TODO(integration): real geocoder adapter (Phase 10). Refuse to silently use fake data.
    throw new Error('A maps key is set but the geocoder adapter is not implemented yet.');
  }
  return createFakeGeocoder();
}
