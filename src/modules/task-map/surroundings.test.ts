import { describe, expect, it } from 'vitest';
import type { AreaFacts } from '@/integrations/places/types';
import { HELPFUL_KINDS, surroundingsFrom } from './surroundings';

const POINT = { lat: 30.35, lng: -97.72 };
/** About 0.07 miles per 0.001° of latitude here. */
const at = (north: number) => ({ lat: POINT.lat + north, lng: POINT.lng });

const FACTS: AreaFacts = {
  places: [
    { id: 'a', kind: 'park', name: 'Brentwood Park', ...at(0.004) },
    { id: 'b', kind: 'park', name: 'Brentwood Park', ...at(0.0045) },
    { id: 'c', kind: 'park', name: 'Second Park', ...at(0.006) },
    { id: 'd', kind: 'park', name: 'Third Park', ...at(0.007) },
    { id: 'e', kind: 'school', name: 'Brentwood Elementary', ...at(0.008) },
    { id: 'f', kind: 'library', name: 'Far Library', ...at(0.05) },
    { id: 'g', kind: 'hardware', name: 'Far Hardware', ...at(0.06) },
    { id: 'h', kind: 'hardware', name: 'Near Hardware', ...at(0.02) },
    { id: 'i', kind: 'garden', name: 'Garden Center', ...at(0.03) },
    { id: 'j', kind: 'recycling', name: '', ...at(0.08) },
    { id: 'k', kind: 'truck-rental', name: 'Truck Rental', ...at(0.4) },
  ],
  parkingLots: 3,
  houses: 180,
  apartments: 20,
  buildings: 400,
};

describe("what's around a task's area", () => {
  it('is unavailable when the places service gave nothing', () => {
    expect(surroundingsFrom(null, POINT, 'yard-cleanup', 'osm')).toEqual({ status: 'unavailable' });
  });

  it('names up to three nearby landmarks, one per name, at most two of a kind, within a mile and a half', () => {
    const result = surroundingsFrom(FACTS, POINT, 'yard-cleanup', 'osm');
    expect(result.status === 'found' && result.landmarks.map((place) => place.name)).toEqual(['Brentwood Park', 'Second Park', 'Brentwood Elementary']);
  });

  it("lists the nearest store of each kind the work needs, in the category's order", () => {
    const yard = surroundingsFrom(FACTS, POINT, 'yard-cleanup', 'osm');
    expect(yard.status === 'found' && yard.helpful.map((place) => [place.kind, place.name])).toEqual([['garden', 'Garden Center'], ['recycling', ''], ['hardware', 'Near Hardware']]);
    // A truck rental 28 miles away is too far to be on the way.
    const moving = surroundingsFrom(FACTS, POINT, 'moving-help', 'osm');
    expect(moving.status === 'found' && moving.helpful.map((place) => place.kind)).toEqual(['recycling']);
    expect(HELPFUL_KINDS['computer-help']).toEqual(['electronics']);
  });

  it('measures from the area and rounds to a tenth of a mile', () => {
    const result = surroundingsFrom(FACTS, POINT, 'furniture-assembly', 'osm');
    expect(result.status === 'found' && result.helpful[0]).toMatchObject({ name: 'Near Hardware', miles: 1.4 });
  });

  it('says what the homes are only when enough buildings have a kind', () => {
    expect(surroundingsFrom(FACTS, POINT, 'light-cleaning', 'osm')).toMatchObject({ homes: 'houses', parkingLots: 3 });
    expect(surroundingsFrom({ ...FACTS, houses: 40, apartments: 80 }, POINT, 'light-cleaning', 'osm')).toMatchObject({ homes: 'apartments' });
    expect(surroundingsFrom({ ...FACTS, houses: 60, apartments: 40, buildings: 200 }, POINT, 'light-cleaning', 'osm')).toMatchObject({ homes: 'mixed' });
    const unknown = surroundingsFrom({ ...FACTS, houses: 10, apartments: 2, buildings: 900 }, POINT, 'light-cleaning', 'osm');
    expect(unknown.status === 'found' && unknown.homes).toBeUndefined();
  });
});
