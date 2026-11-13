import { describe, expect, it, vi } from 'vitest';
import { createGeocoder, GeocoderUnavailableError, wantsGeoStandIn } from './index';
import { createMapboxGeocoder, placeIdFor, readPlaceId } from './mapbox';

const SECRET = 'test-secret-for-place-ids';
const TOKEN = 'pk.test-token';

/** A Mapbox v6 address feature (fictional, shaped like the API's). */
function feature(overrides: { name?: string; zip?: string; accuracy?: string; number?: string; city?: string; match?: Record<string, string>; type?: string } = {}) {
  const name = overrides.name ?? '1234 Example Lane';
  return {
    type: 'Feature',
    properties: {
      feature_type: overrides.type ?? 'address',
      name,
      coordinates: { latitude: 30.2985, longitude: -97.7042, accuracy: overrides.accuracy ?? 'rooftop' },
      ...(overrides.match ? { match_code: overrides.match } : {}),
      context: {
        address: { address_number: overrides.number ?? name.split(' ')[0], name },
        postcode: { name: overrides.zip ?? '78723' },
        place: { name: overrides.city ?? 'Austin' },
        region: { name: 'Texas', region_code: 'TX' },
        country: { country_code: 'US' },
      },
    },
  };
}

const EXACT = { address_number: 'matched', street: 'matched', postcode: 'matched', place: 'matched', region: 'matched', confidence: 'exact' };

function mapboxAnswering(...answers: (object | number | Error)[]) {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const answer = answers.shift() ?? { features: [] };
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') return new Response('{"message":"no"}', { status: answer });
    return Response.json(answer);
  });
  const geocoder = createMapboxGeocoder({ token: TOKEN, secret: SECRET, fetch: fetch as unknown as typeof globalThis.fetch });
  const url = (call = 0) => new URL(String(fetch.mock.calls[call]![0]));
  return { geocoder, fetch, url };
}

describe('Mapbox address search', () => {
  it('asks for US addresses near the market, within the box, and shows only known address points', async () => {
    const { geocoder, fetch, url } = mapboxAnswering({
      features: [
        feature(),
        feature({ name: '1240 Example Lane', accuracy: 'interpolated' }),
        feature({ name: '88 Sample Street', zip: '78757', accuracy: 'parcel' }),
        feature({ name: 'Example Lane', type: 'street' }),
        feature({ name: '1234 Example Lane' }),
        feature({ name: '9 Missing Zip Road', zip: '' }),
      ],
    });
    const places = await geocoder.search('1234 example; lane', { near: { lat: 30.2672, lng: -97.7431 }, withinKm: 50 });

    expect(fetch).toHaveBeenCalledTimes(1);
    const params = url().searchParams;
    expect(url().origin + url().pathname).toBe('https://api.mapbox.com/search/geocode/v6/forward');
    expect(Object.fromEntries(params)).toMatchObject({ q: '1234 example lane', autocomplete: 'true', country: 'us', types: 'address', language: 'en', limit: '10', proximity: '-97.7431,30.2672', access_token: TOKEN });
    const [minLng, minLat, maxLng, maxLat] = params.get('bbox')!.split(',').map(Number);
    expect(maxLat! - minLat!).toBeCloseTo(0.898, 2);
    expect(minLng!).toBeLessThan(-97.7431);
    expect(maxLng!).toBeGreaterThan(-97.7431);
    // Not cached (Mapbox's terms), and given up on after a while.
    expect(fetch.mock.calls[0]![1]).toMatchObject({ cache: 'no-store' });
    expect(fetch.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);

    expect(places.map((place) => place.line1)).toEqual(['1234 Example Lane', '88 Sample Street']);
    expect(places[0]).toMatchObject({ city: 'Austin', state: 'TX', zip: '78723', lat: 30.2985, lng: -97.7042 });
    expect(readPlaceId(places[0]!.placeId, SECRET)).toEqual({ line1: '1234 Example Lane', city: 'Austin', state: 'TX', zip: '78723' });
  });

  it('skips the request for less than 3 characters', async () => {
    const { geocoder, fetch } = mapboxAnswering();
    expect(await geocoder.search('  12 ')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says when Mapbox is unavailable, without the token in the message', async () => {
    for (const answer of [500, 401, 429, new TypeError('fetch failed'), Object.assign(new Error('timed out'), { name: 'TimeoutError' })]) {
      const { geocoder } = mapboxAnswering(answer);
      const error = await geocoder.search('1234 example').catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(GeocoderUnavailableError);
      expect(String((error as Error).message)).not.toContain(TOKEN);
    }
  });
});

describe('confirming the chosen address on "Post"', () => {
  const chosen = { line1: '1234 Example Lane', city: 'Austin', state: 'TX', zip: '78723' };
  const placeId = placeIdFor(chosen, SECRET);

  it('looks the full address up again', async () => {
    const answer = feature({ match: EXACT });
    answer.properties.coordinates = { latitude: 30.3, longitude: -97.7, accuracy: 'rooftop' };
    const { geocoder, url } = mapboxAnswering({ features: [answer] });
    const place = await geocoder.resolve(placeId);
    expect(Object.fromEntries(url().searchParams)).toMatchObject({ q: '1234 Example Lane, Austin, TX 78723', autocomplete: 'false', limit: '1', types: 'address', country: 'us' });
    expect(place).toEqual({ placeId, ...chosen, lat: 30.3, lng: -97.7 });
  });

  it('corrects a wrong ZIP or a variant spelling to the address Mapbox has', async () => {
    const { geocoder } = mapboxAnswering({ features: [feature({ name: '1234 Example Lane', zip: '78722', match: { ...EXACT, postcode: 'unmatched', confidence: 'high' } })] });
    const chosenVariant = { line1: '1234 Example Ln.', city: 'Austin', state: 'TX', zip: '78723' };
    expect(await geocoder.resolve(placeIdFor(chosenVariant, SECRET))).toMatchObject({ line1: '1234 Example Lane', zip: '78722' });
  });

  it('refuses an address Mapbox only guesses, or that comes back different', async () => {
    const unconfirmed = [
      feature({ accuracy: 'interpolated', match: { ...EXACT, address_number: 'plausible', confidence: 'medium' } }),
      feature({ match: { ...EXACT, confidence: 'medium' } }),
      feature({ match: { ...EXACT, street: 'unmatched' } }),
      feature({ zip: '78702', city: 'Elsewhere', match: { ...EXACT, postcode: 'unmatched', place: 'unmatched' } }),
      feature({ name: '1236 Example Lane', match: EXACT }),
      feature({ name: '1234 Other Street' }),
    ];
    for (const answer of unconfirmed) {
      const { geocoder } = mapboxAnswering({ features: [answer] });
      expect(await geocoder.resolve(placeId)).toBeNull();
    }
    const { geocoder } = mapboxAnswering({ features: [] });
    expect(await geocoder.resolve(placeId)).toBeNull();
  });

  it('without match codes, accepts only the same address', async () => {
    const same = mapboxAnswering({ features: [feature({ name: '1234 EXAMPLE LANE', accuracy: 'point' })] });
    expect(await same.geocoder.resolve(placeId)).toMatchObject({ line1: '1234 EXAMPLE LANE', zip: '78723' });
    const otherZip = mapboxAnswering({ features: [feature({ zip: '78722' })] });
    expect(await otherZip.geocoder.resolve(placeId)).toBeNull();
  });

  it('takes only place ids it made, without asking Mapbox', async () => {
    const { geocoder, fetch } = mapboxAnswering();
    const [payload, signature] = placeId.slice('mbx1.'.length).split('.') as [string, string];
    const forged = `mbx1.${Buffer.from(JSON.stringify(['1 Forged Road', 'Austin', 'TX', '78701'])).toString('base64url')}.${signature}`;
    const altered = `mbx1.${payload}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    for (const id of [forged, altered, placeIdFor(chosen, 'another-secret'), 'plc_mueller_1234', '', `${placeId}.extra`, 'mbx1.not-base64.sig']) {
      expect(await geocoder.resolve(id)).toBeNull();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says when Mapbox is unavailable', async () => {
    const { geocoder } = mapboxAnswering(503);
    await expect(geocoder.resolve(placeId)).rejects.toBeInstanceOf(GeocoderUnavailableError);
  });
});

describe('choosing the geocoder', () => {
  it('uses Mapbox with a token; outside production the sample places still resolve', async () => {
    const dev = createGeocoder({ MAPBOX_TOKEN: TOKEN, BETTER_AUTH_SECRET: SECRET, NODE_ENV: 'development' });
    expect(dev.name).toBe('mapbox');
    expect(await dev.resolve('plc_mueller_1234')).toMatchObject({ line1: '1234 Example Lane' });
    const production = createGeocoder({ MAPBOX_TOKEN: TOKEN, BETTER_AUTH_SECRET: SECRET, NODE_ENV: 'production' });
    expect(production.name).toBe('mapbox');
    expect(await production.resolve('plc_mueller_1234')).toBeNull();
  });

  it('uses the sample places without a token, and nothing in production', async () => {
    expect(createGeocoder({ NODE_ENV: 'development' }).name).toBe('fake');
    const production = createGeocoder({ NODE_ENV: 'production' });
    await expect(production.search('1234 example')).rejects.toBeInstanceOf(GeocoderUnavailableError);
    await expect(production.resolve('plc_mueller_1234')).rejects.toBeInstanceOf(GeocoderUnavailableError);
  });

  it('refuses a key it has no adapter for, or a token without the signing secret', () => {
    expect(() => createGeocoder({ GOOGLE_MAPS_API_KEY: 'key', NODE_ENV: 'development' })).toThrow(/only the Mapbox adapter/);
    expect(() => createGeocoder({ MAPBOX_TOKEN: TOKEN, NODE_ENV: 'development' })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('gives tests the sample places only outside production', () => {
    expect(wantsGeoStandIn('1', { NODE_ENV: 'development' })).toBe(true);
    expect(wantsGeoStandIn(undefined, { NODE_ENV: 'development' })).toBe(false);
    expect(wantsGeoStandIn('1', { NODE_ENV: 'production' })).toBe(false);
  });
});
