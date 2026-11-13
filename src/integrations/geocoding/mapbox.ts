import { createHmac, timingSafeEqual } from 'node:crypto';
import { GeocoderUnavailableError, type GeoPlace, type GeoSearchOptions, type Geocoder } from './types';

/**
 * Address search with Mapbox (Geocoding API v6, temporary results: free up to 100,000 requests a month).
 *
 * Mapbox's terms (Product Terms 2.7.2) forbid storing or caching temporary results and showing their
 * coordinates to people. So suggestions show the address only, the coordinates are used once on the server
 * (service area, neighborhood) and dropped, and the place id the browser holds is the address itself, signed so
 * `resolve` only takes addresses this app suggested.
 *
 * Only known address points are offered: "interpolated" results are positions guessed along a street, and their
 * house number may not exist. On "Post", `resolve` looks the address up again as a full address, which confirms
 * it: the same house number and street, in the same city or ZIP, must match a known address point. The address
 * comes back as Mapbox has it, so a wrong ZIP or a variant spelling ("W. Second St") is corrected.
 */

const ENDPOINT = 'https://api.mapbox.com/search/geocode/v6/forward';
const ADDRESS_POINTS = new Set(['rooftop', 'parcel', 'point']);
const CONFIDENT = new Set(['exact', 'high']);
const PLACE_ID_PREFIX = 'mbx1.';
const MAX_RESULTS = 5;

export interface MapboxGeocoderOptions {
  token: string;
  /** Signs place ids (the app's BETTER_AUTH_SECRET). */
  secret: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface Address {
  line1: string;
  city: string;
  state: string;
  zip: string;
}

interface MapboxFeature {
  properties?: {
    feature_type?: string;
    name?: string;
    coordinates?: { latitude?: number; longitude?: number; accuracy?: string };
    match_code?: Partial<Record<'address_number' | 'street' | 'postcode' | 'place' | 'confidence', string>>;
    context?: {
      address?: { address_number?: string; name?: string };
      postcode?: { name?: string };
      place?: { name?: string };
      locality?: { name?: string };
      region?: { region_code?: string; region_code_full?: string };
      country?: { country_code?: string };
    };
  };
}

type Found = Address & { lat: number; lng: number; accuracy?: string; houseNumber?: string };

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`tnm.place.v1.${payload}`).digest().subarray(0, 16).toString('base64url');
}

/** The place id for an address: the address itself and a signature. */
export function placeIdFor(address: Address, secret: string): string {
  const payload = Buffer.from(JSON.stringify([address.line1, address.city, address.state, address.zip]), 'utf8').toString('base64url');
  return `${PLACE_ID_PREFIX}${payload}.${sign(payload, secret)}`;
}

/** The address in a place id, or null when it wasn't made by this app (or was changed). */
export function readPlaceId(placeId: string, secret: string): Address | null {
  if (typeof placeId !== 'string' || !placeId.startsWith(PLACE_ID_PREFIX) || placeId.length > 600) return null;
  const parts = placeId.slice(PLACE_ID_PREFIX.length).split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Array.isArray(value) || value.length !== 4) return null;
    if (!value.every((part) => typeof part === 'string' && part.length > 0 && part.length <= 160)) return null;
    const [line1, city, state, zip] = value as [string, string, string, string];
    return { line1, city, state, zip };
  } catch {
    return null;
  }
}

const tidy = (text: string | undefined) => text?.replace(/\s+/g, ' ').trim() ?? '';
const houseNumberOf = (line1: string) => /^\d+[A-Za-z]?\b/.exec(line1)?.[0];

function addressOf(feature: MapboxFeature): Found | null {
  const properties = feature.properties;
  if (properties?.feature_type !== 'address') return null;
  const context = properties.context ?? {};
  const country = context.country?.country_code;
  if (country && country.toUpperCase() !== 'US') return null;
  const line1 = tidy(properties.name ?? context.address?.name);
  const city = tidy(context.place?.name ?? context.locality?.name);
  const state = (context.region?.region_code ?? context.region?.region_code_full?.replace(/^US-/i, '') ?? '').toUpperCase();
  const zip = /^(\d{5})(?:-\d{4})?$/.exec(tidy(context.postcode?.name))?.[1];
  const lat = properties.coordinates?.latitude;
  const lng = properties.coordinates?.longitude;
  if (!line1 || !city || !/^[A-Z]{2}$/.test(state) || !zip || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    line1,
    city,
    state,
    zip,
    lat: lat!,
    lng: lng!,
    accuracy: properties.coordinates?.accuracy,
    houseNumber: context.address?.address_number ?? houseNumberOf(line1),
  };
}

/** A box `km` around a point, as Mapbox's `bbox` (minLon,minLat,maxLon,maxLat). */
function bboxAround(near: { lat: number; lng: number }, km: number): string {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.max(Math.cos((near.lat * Math.PI) / 180), 0.01));
  return [near.lng - dLng, near.lat - dLat, near.lng + dLng, near.lat + dLat].map((value) => value.toFixed(4)).join(',');
}

/** Mapbox takes at most 20 words and 256 characters, and no semicolons. */
function asQuery(text: string): string {
  return text.replace(/;/g, ' ').split(/\s+/).filter(Boolean).slice(0, 20).join(' ').slice(0, 256);
}

/**
 * The full-address lookup found the chosen house number and street, in the same city or ZIP, as a known
 * address point. Without match codes, only the very same address counts.
 */
function confirms(feature: MapboxFeature, found: Found, chosen: Address): boolean {
  if (!found.accuracy || !ADDRESS_POINTS.has(found.accuracy)) return false;
  if (found.houseNumber !== houseNumberOf(chosen.line1)) return false;
  const match = feature.properties?.match_code;
  if (!match) return found.line1.toLowerCase() === chosen.line1.toLowerCase() && found.zip === chosen.zip;
  const sameArea = match.postcode === 'matched' || match.place === 'matched';
  return CONFIDENT.has(match.confidence ?? '') && match.address_number === 'matched' && match.street === 'matched' && sameArea;
}

export function createMapboxGeocoder({ token, secret, fetch: fetchImpl = fetch, timeoutMs = 6000 }: MapboxGeocoderOptions): Geocoder {
  async function forward(params: Record<string, string>): Promise<MapboxFeature[]> {
    const query = new URLSearchParams({ ...params, country: 'us', types: 'address', language: 'en', access_token: token });
    let response: Response;
    try {
      // Temporary results may not be cached (Mapbox Product Terms 2.7.2).
      response = await fetchImpl(`${ENDPOINT}?${query}`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      // Never put the URL in a message: it holds the token.
      throw new GeocoderUnavailableError(error instanceof Error && error.name === 'TimeoutError' ? 'Mapbox timed out' : 'Mapbox could not be reached');
    }
    if (!response.ok) throw new GeocoderUnavailableError(`Mapbox answered ${response.status}`);
    const body = (await response.json().catch(() => null)) as { features?: unknown } | null;
    return Array.isArray(body?.features) ? (body.features as MapboxFeature[]) : [];
  }

  return {
    name: 'mapbox',

    async search(text, options: GeoSearchOptions = {}) {
      const q = asQuery(text);
      if (q.length < 3) return [];
      const { near, withinKm } = options;
      const features = await forward({
        q,
        autocomplete: 'true',
        // Interpolated results are dropped, so ask for more than are shown (one request either way).
        limit: '10',
        ...(near ? { proximity: `${near.lng.toFixed(4)},${near.lat.toFixed(4)}` } : {}),
        ...(near && withinKm ? { bbox: bboxAround(near, withinKm) } : {}),
      });
      const places = new Map<string, GeoPlace>();
      for (const feature of features) {
        const found = addressOf(feature);
        if (!found || !found.accuracy || !ADDRESS_POINTS.has(found.accuracy)) continue;
        const placeId = placeIdFor(found, secret);
        if (!places.has(placeId)) places.set(placeId, { placeId, line1: found.line1, city: found.city, state: found.state, zip: found.zip, lat: found.lat, lng: found.lng });
        if (places.size === MAX_RESULTS) break;
      }
      return [...places.values()];
    },

    async resolve(placeId) {
      const chosen = readPlaceId(placeId, secret);
      if (!chosen) return null;
      const [top] = await forward({ q: asQuery(`${chosen.line1}, ${chosen.city}, ${chosen.state} ${chosen.zip}`), autocomplete: 'false', limit: '1' });
      const found = top ? addressOf(top) : null;
      if (!top || !found || !confirms(top, found, chosen)) return null;
      // The confirmed address (a wrong ZIP corrected); its coordinates are used once and dropped.
      return { placeId, line1: found.line1, city: found.city, state: found.state, zip: found.zip, lat: found.lat, lng: found.lng };
    },
  };
}
