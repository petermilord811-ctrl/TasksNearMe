import { describe, expect, it } from 'vitest';
import { austinLandingMap, austinMapPins } from '@/fixtures';
import { distanceMiles, roundMiles, type LatLng } from '@/shared/geo';
import {
  arrivalCamera,
  arrivalProgress,
  circleBounds,
  circleRing,
  donutArcs,
  effectiveSort,
  inBounds,
  insideServiceArea,
  nearbyPins,
  outsideCircle,
  pixelsPerMile,
  projector,
  shownAmountCents,
  type MapCamera,
} from './map-math';

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

  it('keeps only what is within the chosen distance of the visitor', () => {
    const rows = nearbyPins(austinMapPins, { from: inMueller, withinMiles: 3 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(austinMapPins.length);
    for (const row of rows) expect(distanceMiles(inMueller, row.pin.point)).toBeLessThanOrEqual(3);
    // Without a location, a distance means nothing.
    expect(nearbyPins(austinMapPins, { withinMiles: 3 })).toHaveLength(austinMapPins.length);
  });

  it('keeps only what is on the map when the list follows it', () => {
    const bounds = { west: -97.76, south: 30.24, east: -97.7, north: 30.31 };
    const rows = nearbyPins(austinMapPins, { bounds });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => inBounds(row.pin.point, bounds))).toBe(true);
    expect(rows.map((row) => row.pin.id)).toEqual(austinMapPins.filter((pin) => inBounds(pin.point, bounds)).map((pin) => pin.id));
  });

  it('orders by the shown price, lowest first, keeping the newest first among equals', () => {
    const rows = nearbyPins(austinMapPins, { sort: 'price' });
    const amounts = rows.map((row) => shownAmountCents(row.pin));
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
    const tied = rows.filter((row) => shownAmountCents(row.pin) === 3500).map((row) => row.pin.id);
    expect(tied).toEqual(austinMapPins.filter((pin) => shownAmountCents(pin) === 3500).map((pin) => pin.id));
  });

  it('falls back to newest when "nearest" has no location, and defaults to nearest once there is one', () => {
    expect(effectiveSort('nearest', undefined)).toBe('newest');
    expect(effectiveSort(undefined, inMueller)).toBe('nearest');
    expect(effectiveSort('price', inMueller)).toBe('price');
    expect(nearbyPins(austinMapPins, { sort: 'nearest' }).map((row) => row.pin.id)).toEqual(austinMapPins.map((pin) => pin.id));
  });
});

describe('insideServiceArea', () => {
  it('is true in Austin and false in Dallas', () => {
    expect(insideServiceArea(austinLandingMap, austinLandingMap.center)).toBe(true);
    expect(insideServiceArea(austinLandingMap, inMueller)).toBe(true);
    expect(insideServiceArea(austinLandingMap, inDallas)).toBe(false);
  });
});

describe('circles on the map', () => {
  it('draws a closed ring at the right distance all around', () => {
    const ring = circleRing(inMueller, 1609, 36);
    expect(ring).toHaveLength(37);
    expect(ring[0]).toEqual(ring[36]);
    for (const [lng, lat] of ring) expect(distanceMiles(inMueller, { lat, lng })).toBeCloseTo(1, 1);
  });

  it('boxes a circle, and cuts it out of the world for the outside', () => {
    const box = circleBounds(inMueller, 1609);
    expect(inBounds(inMueller, box)).toBe(true);
    expect(distanceMiles(inMueller, { lat: box.north, lng: inMueller.lng })).toBeCloseTo(1, 1);
    const outside = outsideCircle(inMueller, 1609);
    expect(outside.coordinates).toHaveLength(2);
    expect(outside.coordinates[0]![0]).toEqual([-180, -85]);
    expect(outside.coordinates[1]).toHaveLength(73);
  });
});

describe('donutArcs', () => {
  it('gives each category with tasks its share of the turn, in order, with gaps', () => {
    const arcs = donutArcs([2, 0, 1, 1]);
    expect(arcs.map((arc) => arc.index)).toEqual([0, 2, 3]);
    const total = arcs.reduce((sum, arc) => sum + arc.length, 0);
    expect(total).toBeCloseTo(1 - 0.03 * 3);
    expect(arcs[0]!.length).toBeCloseTo(2 * arcs[1]!.length);
    expect(arcs[1]!.start).toBeCloseTo(arcs[0]!.length + 0.03);
  });

  it('is a full ring for one category, and nothing for none', () => {
    expect(donutArcs([0, 4, 0])).toEqual([{ index: 1, start: 0, length: 1 }]);
    expect(donutArcs([0, 0])).toEqual([]);
  });
});

describe('the arrival under the hero', () => {
  const from: MapCamera = { center: { lat: 30.348, lng: -97.725 }, zoom: 14, pitch: 50, bearing: -45 };
  const to: MapCamera = { center: austinLandingMap.center, zoom: 10.75, pitch: 0, bearing: 0 };

  it('runs from the bottom of the window to near its top', () => {
    expect(arrivalProgress(900, 900)).toBe(0);
    expect(arrivalProgress(1200, 900)).toBe(0);
    expect(arrivalProgress(450, 900)).toBeCloseTo(450 / 765);
    expect(arrivalProgress(135, 900)).toBe(1);
    expect(arrivalProgress(-400, 900)).toBe(1);
  });

  it('starts close and tilted over the task and ends flat over the city', () => {
    expect(arrivalCamera(0, from, to)).toEqual(from);
    const end = arrivalCamera(1, from, to);
    expect(end.zoom).toBeCloseTo(to.zoom);
    expect(end.pitch).toBeCloseTo(0);
    expect(end.bearing).toBeCloseTo(0);
    expect(end.center.lat).toBeCloseTo(to.center.lat);
    expect(end.center.lng).toBeCloseTo(to.center.lng);
  });

  it('pulls back and flattens steadily, with the task drifting smoothly on screen', () => {
    let last = arrivalCamera(0, from, to);
    let lastOffset = 0;
    for (let k = 1; k <= 20; k += 1) {
      const now = arrivalCamera(k / 20, from, to);
      expect(now.zoom).toBeLessThanOrEqual(last.zoom + 1e-9);
      expect(now.pitch).toBeLessThanOrEqual(last.pitch + 1e-9);
      // The task's distance from the middle of the screen, in on-screen terms (world offset × 2^zoom).
      const offset = Math.hypot(now.center.lat - from.center.lat, now.center.lng - from.center.lng) * 2 ** now.zoom;
      expect(offset).toBeGreaterThanOrEqual(lastOffset - 1e-9);
      lastOffset = offset;
      last = now;
    }
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
