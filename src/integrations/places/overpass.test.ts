import { describe, expect, it } from 'vitest';
import { createOverpassPlaces, lookupCenter, overpassQuery, parseOverpass, placeKindOf } from './overpass';
import { createSamplePlaces } from './sample';

const BODY = {
  elements: [
    { type: 'node', id: 1, lat: 30.35, lon: -97.72, tags: { shop: 'hardware', name: 'Corner Hardware' } },
    { type: 'way', id: 2, center: { lat: 30.36, lon: -97.73 }, tags: { leisure: 'park', name: 'Brentwood Park' } },
    { type: 'way', id: 3, center: { lat: 30.34, lon: -97.71 }, tags: { amenity: 'recycling', recycling_type: 'centre' } },
    // Unnamed (a store without a name doesn't help), unknown kinds and broken points are left out.
    { type: 'node', id: 4, lat: 30.35, lon: -97.72, tags: { shop: 'supermarket' } },
    { type: 'node', id: 5, lat: 30.35, lon: -97.72, tags: { amenity: 'bench', name: 'Bench' } },
    { type: 'node', id: 6, tags: { shop: 'hardware', name: 'Nowhere' } },
    // The same feature twice (it matched two of the query's lines) counts once.
    { type: 'node', id: 1, lat: 30.35, lon: -97.72, tags: { shop: 'hardware', name: 'Corner Hardware' } },
    { type: 'count', id: 0, tags: { nodes: '2', ways: '5', relations: '0', total: '7' } },
    { type: 'count', id: 0, tags: { total: '180' } },
    { type: 'count', id: 0, tags: { total: '24' } },
    { type: 'count', id: 0, tags: { total: '410' } },
  ],
};

describe('OpenStreetMap places through Overpass', () => {
  it('rounds the center to about a kilometer (tasks in one area share a lookup)', () => {
    expect(lookupCenter({ lat: 30.34791, lng: -97.72549 })).toEqual({ lat: 30.35, lng: -97.73 });
  });

  it('asks for every kind in its ring, then the counts', () => {
    const query = overpassQuery({ lat: 30.35, lng: -97.73 });
    expect(query).toContain('[out:json]');
    expect(query).toContain('nwr["shop"~"^(hardware|doityourself)$"](around:16000,30.35,-97.73);');
    expect(query).toContain('nwr["leisure"="park"]["name"](around:2500,30.35,-97.73);');
    expect(query.match(/out count;/g)).toHaveLength(4);
  });

  it('sorts features into the task map kinds', () => {
    expect(placeKindOf({ shop: 'doityourself' })).toBe('hardware');
    expect(placeKindOf({ amenity: 'car_rental', name: 'U-Haul' })).toBe('truck-rental');
    expect(placeKindOf({ amenity: 'waste_transfer_station' })).toBe('recycling');
    expect(placeKindOf({ shop: 'second_hand' })).toBe('donation');
    expect(placeKindOf({ amenity: 'college' })).toBe('university');
    expect(placeKindOf({ amenity: 'bench' })).toBeNull();
  });

  it('reads the places and the counts', () => {
    expect(parseOverpass(BODY)).toEqual({
      places: [
        { id: 'osm:node/1', kind: 'hardware', name: 'Corner Hardware', lat: 30.35, lng: -97.72 },
        { id: 'osm:way/2', kind: 'park', name: 'Brentwood Park', lat: 30.36, lng: -97.73 },
        { id: 'osm:way/3', kind: 'recycling', name: '', lat: 30.34, lng: -97.71 },
      ],
      parkingLots: 7,
      houses: 180,
      apartments: 24,
      buildings: 410,
    });
    expect(parseOverpass({ remark: 'runtime error' })).toBeNull();
  });

  it('keeps an answer a week per area and never throws', async () => {
    const calls: string[] = [];
    let now = 0;
    const source = createOverpassPlaces({
      userAgent: 'x',
      now: () => now,
      fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => {
        calls.push(String(init?.body));
        return new Response(JSON.stringify(BODY), { status: 200 });
      }) as typeof fetch,
    });
    expect((await source.around({ lat: 30.3479, lng: -97.7254 }))?.places).toHaveLength(3);
    expect((await source.around({ lat: 30.3512, lng: -97.7281 }))?.places).toHaveLength(3);
    expect(calls).toHaveLength(1);
    now += 8 * 24 * 3_600_000;
    await source.around({ lat: 30.3479, lng: -97.7254 });
    expect(calls).toHaveLength(2);

    const failing = createOverpassPlaces({ userAgent: 'x', fetch: (async () => { throw new TypeError('offline'); }) as typeof fetch });
    await expect(failing.around({ lat: 30, lng: -97 })).resolves.toBeNull();
  });

  it('has made-up "Sample" places for development and tests', async () => {
    const facts = await createSamplePlaces().around({ lat: 29.65, lng: -82.32 });
    expect(facts?.places.length).toBeGreaterThan(5);
    expect(facts?.places.every((place) => place.name.startsWith('Sample '))).toBe(true);
  });
});
