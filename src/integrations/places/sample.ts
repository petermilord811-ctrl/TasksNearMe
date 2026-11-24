import type { PlaceKind } from '@/contracts/task-map';
import type { AreaFacts, PlacesSource } from './types';

/**
 * Development and the e2e build: made-up places at fixed offsets around the point (named "Sample …", never a real
 * business), so screens and tests never call Overpass.
 */
const SAMPLES: { kind: PlaceKind; name: string; north: number; east: number }[] = [
  { kind: 'park', name: 'Sample Park', north: 0.004, east: 0.003 },
  { kind: 'school', name: 'Sample Elementary School', north: -0.006, east: 0.005 },
  { kind: 'library', name: 'Sample Branch Library', north: 0.009, east: -0.007 },
  { kind: 'hardware', name: 'Sample Hardware', north: 0.018, east: 0.012 },
  { kind: 'hardware', name: 'Sample Home Center', north: -0.035, east: -0.03 },
  { kind: 'garden', name: 'Sample Garden Center', north: 0.03, east: -0.02 },
  { kind: 'truck-rental', name: 'Sample Truck Rental', north: -0.025, east: 0.03 },
  { kind: 'storage', name: 'Sample Self Storage', north: 0.04, east: 0.035 },
  { kind: 'recycling', name: 'Sample Recycling Center', north: -0.05, east: 0.06 },
  { kind: 'donation', name: 'Sample Thrift Store', north: 0.02, east: -0.04 },
  { kind: 'supermarket', name: 'Sample Market', north: 0.01, east: 0.014 },
  { kind: 'electronics', name: 'Sample Electronics', north: -0.04, east: -0.012 },
];

export function sampleAreaFacts(point: { lat: number; lng: number }): AreaFacts {
  return {
    places: SAMPLES.map((sample, index) => ({
      id: `sample:${index}`,
      kind: sample.kind,
      name: sample.name,
      lat: Math.round((point.lat + sample.north) * 1e6) / 1e6,
      lng: Math.round((point.lng + sample.east) * 1e6) / 1e6,
    })),
    parkingLots: 4,
    houses: 140,
    apartments: 22,
    buildings: 310,
  };
}

export function createSamplePlaces(): PlacesSource {
  return {
    name: 'sample',
    async around(point) {
      return sampleAreaFacts(point);
    },
  };
}
