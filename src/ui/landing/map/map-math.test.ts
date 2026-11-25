import { describe, expect, it, vi } from 'vitest';
import { austinLandingMap, austinMapPins } from '@/fixtures';
import { distanceMiles, roundMiles, type LatLng } from '@/shared/geo';
import {
  arrivalCamera,
  BLOOM_MAX,
  bloomOffsets,
  citiesInOrder,
  cityAt,
  cornersMiddle,
  circleBounds,
  circleRing,
  donutArcs,
  driveMinutes,
  edgeMarker,
  effectiveSort,
  inBounds,
  insideServiceArea,
  inTimeRange,
  listOrigin,
  type MapCamera,
  medianCents,
  nearbyPins,
  nearestCity,
  outsideCircle,
  pinIdsMatching,
  pixelsPerMile,
  projector,
  showCityFrom,
  shownAmountCents,
  stepAroundPanels,
  waitingPlaceNear,
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

describe('where the list measures from', () => {
  it('is the visitor in or near the market, and nobody for a visitor in another city', () => {
    const inMueller = { lat: 30.2989, lng: -97.7064 };
    expect(listOrigin(austinLandingMap, inMueller)).toBe(inMueller);
    expect(listOrigin(austinLandingMap, undefined)).toBeUndefined();
    // Dallas is about 180 miles away.
    expect(listOrigin(austinLandingMap, { lat: 32.7767, lng: -96.797 })).toBeUndefined();
  });
});

describe('the marker for an off-screen location', () => {
  const box = { left: 20, top: 100, right: 620, bottom: 500 };

  it('hides while the point is in view', () => {
    expect(edgeMarker({ x: 300, y: 300 }, box)).toBeNull();
    expect(edgeMarker({ x: 20, y: 500 }, box)).toBeNull();
  });

  it('sits on the edge the line from the middle crosses, pointing at the point', () => {
    // Straight up from the middle (320, 300): the top edge, pointing up.
    const up = edgeMarker({ x: 320, y: -400 }, box)!;
    expect(up.x).toBeCloseTo(320);
    expect(up.y).toBeCloseTo(100);
    expect(up.angle).toBeCloseTo(-Math.PI / 2);
    // Far to the right and a little down: the right edge, a little below the middle.
    const right = edgeMarker({ x: 3320, y: 600 }, box)!;
    expect(right.x).toBeCloseTo(620);
    expect(right.y).toBeCloseTo(300 + 300 * (300 / 3000));
    // Down and to the left: the corner area, never outside the box.
    const corner = edgeMarker({ x: -2000, y: 2000 }, box)!;
    expect(corner.x).toBeGreaterThanOrEqual(box.left - 1e-9);
    expect(corner.y).toBeLessThanOrEqual(box.bottom + 1e-9);
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

describe('the time and neighborhood filters', () => {
  const day = (iso: string) => Date.parse(iso);
  it('keeps a task whose window touches the range, as the board does', () => {
    const pin = { windowStart: '2026-11-21T16:00:00.000Z', windowEnd: '2026-11-21T19:00:00.000Z' };
    expect(inTimeRange(pin, { from: day('2026-11-21T00:00:00Z'), to: day('2026-11-22T00:00:00Z') })).toBe(true);
    // Ends as the range starts, or starts as it ends: not in it.
    expect(inTimeRange(pin, { from: day('2026-11-21T19:00:00Z'), to: day('2026-11-23T00:00:00Z') })).toBe(false);
    expect(inTimeRange(pin, { from: day('2026-11-20T00:00:00Z'), to: day('2026-11-21T16:00:00Z') })).toBe(false);
  });

  it('narrows the list to the time and the neighborhood', () => {
    const saturday = { from: day('2026-11-28T06:00:00Z'), to: day('2026-11-29T06:00:00Z') };
    const ids = nearbyPins(austinMapPins, { when: saturday }).map(({ pin }) => pin.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => austinMapPins.find((pin) => pin.id === id)!.windowStart.startsWith('2026-11-28'))).toBe(true);
    const mueller = nearbyPins(austinMapPins, { areaName: 'Mueller' }).map(({ pin }) => pin.areaName);
    expect(mueller).toEqual(['Mueller']);
    expect(pinIdsMatching(austinMapPins, { areaName: 'Mueller', category: 'yard-cleanup' }).size).toBe(0);
    expect(pinIdsMatching(austinMapPins, {}).size).toBe(austinMapPins.length);
  });
});

describe('a cluster in bloom', () => {
  it('fans its tasks round one ring from the top, clockwise, with room between them', () => {
    expect(bloomOffsets(0)).toEqual([]);
    expect(bloomOffsets(1)).toEqual([{ x: 0, y: -44 }]);
    const eight = bloomOffsets(8);
    expect(eight[0]).toEqual({ x: 0, y: -53.5 });
    expect(eight[2]!.x).toBeGreaterThan(50);
    for (let i = 0; i < eight.length; i += 1) {
      const a = eight[i]!;
      const b = eight[(i + 1) % eight.length]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(40);
    }
    const most = bloomOffsets(BLOOM_MAX);
    expect(Math.hypot(most[0]!.x - most[1]!.x, most[0]!.y - most[1]!.y)).toBeGreaterThanOrEqual(40);
  });

  it('reads a typical price as the median', () => {
    expect(medianCents([])).toBeNull();
    expect(medianCents([9000, 4500, 6000])).toBe(6000);
    expect(medianCents([4000, 5000, 7000, 9000])).toBe(6000);
  });
});

describe('the marker that points to the visitor, around the panels', () => {
  const box = { left: 0, top: 0, right: 1000, bottom: 800 };
  const half = { x: 60, y: 20 };

  it('stays where it is when no panel is in the way', () => {
    expect(stepAroundPanels({ x: 500, y: 400 }, half, box, [{ left: 0, top: 0, right: 300, bottom: 300 }])).toEqual({ x: 500, y: 400 });
  });

  it('leaves a panel the shortest way: just under the heading card, it steps below it', () => {
    const heading = { left: 20, top: 100, right: 420, bottom: 380 };
    expect(stepAroundPanels({ x: 100, y: 360 }, half, box, [heading])).toEqual({ x: 100, y: 380 + 20 + 10 });
  });

  it('never leaves the box: a full-height explorer on the right sends it to the explorer’s left', () => {
    const explorer = { left: 900, top: 0, right: 1000, bottom: 800 };
    expect(stepAroundPanels({ x: 940, y: 400 }, half, box, [explorer])).toEqual({ x: 900 - 60 - 10, y: 400 });
  });

  it('two panels stacked along the left edge with too little room between them: the nearest spot clear of both', () => {
    // The card over the map's top left and the tool bars under it, 37 px apart (the pill needs 60): stepping out of
    // one lands on the other, back and forth.
    const card = { left: 32, top: 16, right: 416, bottom: 450 };
    const tools = { left: 32, top: 487, right: 86, bottom: 780 };
    const edge = { left: 14, top: 96, right: 1266, bottom: 756 };
    const spot = stepAroundPanels({ x: 76, y: 293 }, { x: 62, y: 20 }, edge, [card, tools]);
    const over = (panel: typeof card) => spot.x + 62 + 10 > panel.left && spot.x - 62 - 10 < panel.right && spot.y + 20 + 10 > panel.top && spot.y - 20 - 10 < panel.bottom;
    expect(over(card)).toBe(false);
    expect(over(tools)).toBe(false);
    // Just right of the tool bars, under the card: the nearest such spot.
    expect(spot).toEqual({ x: 86 + 62 + 10, y: 450 + 20 + 10 });
  });
});

describe('drive estimates from a straight-line distance', () => {
  it('reads as minutes across town and hours across the country', () => {
    expect(driveMinutes(3)).toBeGreaterThanOrEqual(8);
    expect(driveMinutes(3)).toBeLessThanOrEqual(15);
    expect(driveMinutes(20)).toBeGreaterThan(driveMinutes(3));
    // About 1,060 miles away (the owner's case): around 19 hours on the road.
    expect(driveMinutes(1060)).toBeGreaterThan(16 * 60);
    expect(driveMinutes(1060)).toBeLessThan(21 * 60);
  });
});

describe('the city a visitor is in (owner, 2026-11-23: "If I am in Austin, you are still showing Gainesville")', () => {
  const cities = austinLandingMap.cities;
  const inAustin: LatLng = { lat: 30.2672, lng: -97.7431 };
  const inRoundRock: LatLng = { lat: 30.5083, lng: -97.6789 }; // about 17 mi out: past the 15-mile area, within its margin
  const inBatonRouge: LatLng = { lat: 30.4515, lng: -91.1871 };

  it('is the open city whose service area (or the margin just past it) holds the point', () => {
    expect(cityAt(cities, inAustin)?.slug).toBe('austin');
    expect(cityAt(cities, inMueller)?.slug).toBe('austin');
    expect(cityAt(cities, inRoundRock)?.slug).toBe('austin');
    expect(cityAt(cities, { lat: 29.6516, lng: -82.3248 })?.slug).toBe('gainesville');
  });

  it('is none where no city is open: Dallas, Baton Rouge', () => {
    expect(cityAt(cities, inDallas)).toBeNull();
    expect(cityAt(cities, inBatonRouge)).toBeNull();
    expect(cityAt([], inAustin)).toBeNull();
  });

  it('two cities in reach: the nearer one', () => {
    const twins = [
      { ...cities[0]!, slug: 'east', point: { lat: 30.2672, lng: -97.6 } },
      { ...cities[0]!, slug: 'west', point: { lat: 30.2672, lng: -97.9 } },
    ];
    expect(cityAt(twins, { lat: 30.2672, lng: -97.65 })?.slug).toBe('east');
    expect(cityAt(twins, { lat: 30.2672, lng: -97.85 })?.slug).toBe('west');
  });

  it('the nearest city, however far, with its distance', () => {
    const nearest = nearestCity(cities, inBatonRouge)!;
    expect(nearest.city.slug).toBe('houston');
    expect(nearest.miles).toBeCloseTo(distanceMiles(inBatonRouge, { lat: 29.7604, lng: -95.3698 }), 6);
    expect(nearestCity([], inBatonRouge)).toBeNull();
  });

  it('the switcher lists open cities first, then those opening, alphabetically; nearest first once the place is known', () => {
    expect(citiesInOrder(cities).map((city) => city.slug)).toEqual(['gainesville', 'austin', 'houston']);
    expect(citiesInOrder(cities, inBatonRouge).map((city) => city.slug)).toEqual(['houston', 'austin', 'gainesville']);
    expect(citiesInOrder(cities, inDallas).map((city) => city.slug)).toEqual(['austin', 'houston', 'gainesville']);
    // The list it was given is left as it was.
    expect(cities.map((city) => city.slug)).toEqual(['austin', 'gainesville', 'houston']);
  });
});

describe('a visitor in no open city (owner, 2026-11-24: "Now I am in Austin, but you still show Gainesville")', () => {
  const places = austinLandingMap.waiting!;

  it('is near the place people wait for within reach (a metro area), the nearest one if two are', () => {
    expect(waitingPlaceNear(places, inDallas)?.name).toBe('Dallas');
    // Fort Worth, about 30 mi from Dallas's middle: still Dallas.
    expect(waitingPlaceNear(places, { lat: 32.7555, lng: -97.3308 })?.name).toBe('Dallas');
    expect(waitingPlaceNear(places, { lat: 29.4241, lng: -98.4936 })?.name).toBe('San Antonio');
    // Waco is about 90 mi from both: no place.
    expect(waitingPlaceNear(places, { lat: 31.5493, lng: -97.1467 })).toBeNull();
    expect(waitingPlaceNear(undefined, inDallas)).toBeNull();
    expect(waitingPlaceNear(places, inDallas, 0.5)?.name).toBe('Dallas');
  });

  it("the big map's middle, from its corners (none while one isn't known)", () => {
    expect(cornersMiddle([[-98, 31], [-97, 31], [-97, 30], [-98, 30]])).toEqual({ lat: 30.5, lng: -97.5 });
    expect(cornersMiddle([])).toBeNull();
    expect(cornersMiddle([[-98, 31], [Number.NaN, 31]])).toBeNull();
  });

  it('back to the city: from far away (the visitor\'s own area) a jump to it first, then the city view', () => {
    const camera = (middle: LatLng) => ({
      corners: (): [number, number][] => [[middle.lng - 0.1, middle.lat + 0.1], [middle.lng + 0.1, middle.lat - 0.1]],
      centerOn: vi.fn(),
      showCity: vi.fn(),
    });
    const far = camera(inDallas);
    showCityFrom(far, austinLandingMap);
    expect(far.centerOn).toHaveBeenCalledWith(austinLandingMap.center);
    expect(far.showCity).toHaveBeenCalledTimes(1);
    expect(far.centerOn.mock.invocationCallOrder[0]!).toBeLessThan(far.showCity.mock.invocationCallOrder[0]!);
    const near = camera(inMueller);
    showCityFrom(near, austinLandingMap);
    expect(near.centerOn).not.toHaveBeenCalled();
    expect(near.showCity).toHaveBeenCalledTimes(1);
  });
});
