import { describe, expect, it } from 'vitest';
import { groupWaitingPlaces, type PausedMarket, type ZipCount } from './waiting-places';

const austin: PausedMarket = { id: 'mkt_austin', name: 'Austin', state: 'TX', center: { lat: 30.2672, lng: -97.7431 }, zipPrefixes: ['786', '787'] };
/** ZIP middles, as stand-ins for the Census table (zip-points.ts). */
const points: Record<string, { lat: number; lng: number }> = {
  '75201': { lat: 32.79, lng: -96.8 },
  '75204': { lat: 32.8, lng: -96.78 },
  '75206': { lat: 32.83, lng: -96.77 },
  '78701': { lat: 30.27, lng: -97.74 },
  '78723': { lat: 30.3, lng: -97.69 },
  '32601': { lat: 29.65, lng: -82.32 },
  '80205': { lat: 39.76, lng: -104.97 },
};
const pointOf = (zip: string) => points[zip] ?? null;
const row = (zip: string, count: number, city: string | null = null, state: string | null = null): ZipCount => ({ zip, city, state, count });

describe('places people wait for (owner, 2026-11-24: "Now I am in Austin, but you still show Gainesville")', () => {
  it('a paused city is a place at its middle, its people counted only from three', () => {
    expect(groupWaitingPlaces({ paused: [austin], covered: [], counts: [row('78723', 2, 'Austin', 'TX')], pointOf })).toEqual([{ name: 'Austin', state: 'TX', point: austin.center, waiting: 0 }]);
    const three = groupWaitingPlaces({ paused: [austin], covered: [], counts: [row('78723', 2, 'Austin', 'TX'), row('78701', 1, null, 'TX')], pointOf });
    expect(three).toEqual([{ name: 'Austin', state: 'TX', point: austin.center, waiting: 3 }]);
  });

  it("elsewhere, people by their ZIP's first three digits: named after the city most of them typed, at their ZIPs' middle", () => {
    const places = groupWaitingPlaces({
      paused: [],
      covered: [],
      counts: [row('75201', 2, 'Dallas', 'TX'), row('75204', 1, 'Dallas', 'TX'), row('75206', 1, 'Highland Park', 'TX'), row('80205', 2, 'Denver', 'CO')],
      pointOf,
    });
    // Denver's two aren't enough to name a place (a count never points at one or two people).
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ name: 'Dallas', state: 'TX', waiting: 4 });
    // Weighted by people: (32.79 × 2 + 32.80 + 32.83) / 4 = 32.8025, kept to three decimals.
    expect(places[0]!.point.lat).toBeCloseTo(32.8025, 2);
    expect(places[0]!.point.lat).not.toBeCloseTo((32.79 + 32.8 + 32.83) / 3, 3);
  });

  it("leaves out the open cities' ZIPs and ZIPs it can't read or place; most people first", () => {
    const places = groupWaitingPlaces({
      paused: [austin],
      covered: ['326'],
      counts: [row('32601', 9, 'Gainesville', 'FL'), row('80205', 3, 'Denver', 'CO'), row('7520', 5, 'Dallas', 'TX'), row('75201-1234', 4, 'Dallas', 'TX'), row('99999', 6, 'Nowhere', 'AK'), row('75204', 0, 'Dallas', 'TX')],
      pointOf,
    });
    expect(places.map((place) => [place.name, place.waiting])).toEqual([
      ['Dallas', 4],
      ['Denver', 3],
      ['Austin', 0],
    ]);
  });
});
