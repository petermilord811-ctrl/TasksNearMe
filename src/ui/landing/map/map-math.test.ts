import { describe, expect, it } from 'vitest';
import { austinLandingMap, austinMapPins } from '@/fixtures';
import { distanceMiles, roundMiles, type LatLng } from '@/shared/geo';
import { insideServiceArea, nearbyPins, pixelsPerMile, projector } from './map-math';

const inMueller: LatLng = { lat: 30.2989, lng: -97.7064 };
const inDallas: LatLng = { lat: 32.7767, lng: -96.797 };

describe('nearbyPins', () => {
  it('keeps the newest-first order, without distances, until the visitor shares a location', () => {
    const rows = nearbyPins(austinMapPins, {});
    expect(rows.map((row) => row.pin.id)).toEqual(austinMapPins.map((pin) => pin.id));
    expect(rows.every((row) => row.miles === undefined)).toBe(true);
  });

  it('sorts by distance from the visitor and rounds the miles for display', () => {
    const rows = nearbyPins(austinMapPins, { from: inMueller });
    const exact = rows.map((row) => distanceMiles(inMueller, row.pin.point));
    expect(exact).toEqual([...exact].sort((a, b) => a - b));
    expect(rows.map((row) => row.miles)).toEqual(exact.map(roundMiles));
  });

  it('keeps one category and the limit', () => {
    const rows = nearbyPins(austinMapPins, { from: inMueller, category: 'yard-cleanup', limit: 2 });
    expect(rows.length).toBeLessThanOrEqual(2);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.pin.categorySlug === 'yard-cleanup')).toBe(true);
  });
});

describe('insideServiceArea', () => {
  it('is true in Austin and false in Dallas', () => {
    expect(insideServiceArea(austinLandingMap, austinLandingMap.center)).toBe(true);
    expect(insideServiceArea(austinLandingMap, inMueller)).toBe(true);
    expect(insideServiceArea(austinLandingMap, inDallas)).toBe(false);
  });
});

describe('projector', () => {
  it('puts the center in the middle, north up and east right', () => {
    const project = projector(austinLandingMap.center, 19, 640, 480);
    expect(project(austinLandingMap.center)).toEqual({ x: 320, y: 240 });
    const north = project({ ...austinLandingMap.center, lat: austinLandingMap.center.lat + 0.05 });
    const east = project({ ...austinLandingMap.center, lng: austinLandingMap.center.lng + 0.05 });
    expect(north.y).toBeLessThan(240);
    expect(east.x).toBeGreaterThan(320);
    expect(pixelsPerMile(19, 640)).toBeCloseTo(640 / 19);
  });
});
