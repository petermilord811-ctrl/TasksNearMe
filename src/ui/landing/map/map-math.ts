import type { LandingMapData, MapCity, TaskMapPin, WaitingPlace } from '@/contracts';
import { distanceMiles, roundMiles, type LatLng } from '@/shared/geo';

/**
 * Small, pure helpers for the landing map (unit-tested): what the list shows (category, distance, what's on
 * the map, the order), circles drawn on the map (a task's approximate area, the visitor's radius, the service
 * area), the donut of a cluster, the camera of the map's arrival under the hero, and a flat projection for
 * the drawn map (fine at city scale).
 */

export interface NearbyPin {
  pin: TaskMapPin;
  /** Rounded for display; absent without a location. */
  miles?: number;
}

/** How the list is ordered. "nearest" needs the visitor's location (it falls back to newest without one). */
/** `price`: lowest first (someone pricing a task); `pay`: highest first (a helper looking for work). */
export type ListSort = 'newest' | 'nearest' | 'price' | 'pay';

/** What the live map shows right now (degrees). */
export interface ViewBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function inBounds(point: LatLng, bounds: ViewBounds): boolean {
  return point.lat >= bounds.south && point.lat <= bounds.north && point.lng >= bounds.west && point.lng <= bounds.east;
}

/** A span of time (ms since the epoch): the board's "when" filters, from `whenRange` (src/shared/board-match.ts). */
export interface TimeRange {
  from: number;
  to: number;
}

/** Whether a task's window touches a range (the board's rule: it starts before the range ends and ends after it starts). */
export function inTimeRange(pin: Pick<TaskMapPin, 'windowStart' | 'windowEnd'>, range: TimeRange): boolean {
  return Date.parse(pin.windowStart) < range.to && Date.parse(pin.windowEnd) > range.from;
}

/** The pins a filter keeps, by id (to fade the others out on the map rather than drop them). */
export function pinIdsMatching(pins: TaskMapPin[], filter: { category?: string | null; when?: TimeRange | null; areaName?: string | null }): Set<string> {
  return new Set(
    pins.filter((pin) => (!filter.category || pin.categorySlug === filter.category) && (!filter.when || inTimeRange(pin, filter.when)) && (!filter.areaName || pin.areaName === filter.areaName)).map((pin) => pin.id),
  );
}

/** The number a pin shows (its fixed price, or its hourly rate): only for ordering, never added up. */
export function shownAmountCents(pin: TaskMapPin): number {
  return pin.budget.type === 'fixed' ? pin.budget.priceCents : pin.budget.rateCents;
}

/** The order in effect: "nearest" without a location is "newest". */
export function effectiveSort(sort: ListSort | undefined, from: LatLng | undefined): ListSort {
  if (sort === undefined) return from ? 'nearest' : 'newest';
  return sort === 'nearest' && !from ? 'newest' : sort;
}

/**
 * The list beside the map: one category (when picked), within a distance of the visitor (when chosen), what's
 * on the map (when the list follows it), then in order: as supplied (newest first), nearest first, or by the
 * shown price. Without a `sort`, it's nearest first when we know where the visitor is.
 */
export function nearbyPins(
  pins: TaskMapPin[],
  options: {
    from?: LatLng;
    category?: string | null;
    limit?: number;
    sort?: ListSort;
    withinMiles?: number | null;
    bounds?: ViewBounds | null;
    /** Only tasks whose time window touches this range (Today, This weekend, This week). */
    when?: TimeRange | null;
    /** Only tasks in this neighborhood. */
    areaName?: string | null;
  },
): NearbyPin[] {
  const { from, withinMiles, bounds, when, areaName } = options;
  let rows: { pin: TaskMapPin; exact?: number; order: number }[] = pins
    .map((pin, order) => (from ? { pin, exact: distanceMiles(from, pin.point), order } : { pin, order }))
    .filter(({ pin }) => (!options.category || pin.categorySlug === options.category) && (!when || inTimeRange(pin, when)) && (!areaName || pin.areaName === areaName));
  if (from && withinMiles) rows = rows.filter((row) => (row.exact ?? 0) <= withinMiles);
  if (bounds) rows = rows.filter((row) => inBounds(row.pin.point, bounds));
  const sort = effectiveSort(options.sort, from);
  if (sort === 'nearest') rows.sort((a, b) => (a.exact ?? 0) - (b.exact ?? 0) || a.order - b.order);
  else if (sort === 'price') rows.sort((a, b) => shownAmountCents(a.pin) - shownAmountCents(b.pin) || a.order - b.order);
  else if (sort === 'pay') rows.sort((a, b) => shownAmountCents(b.pin) - shownAmountCents(a.pin) || a.order - b.order);
  return rows.slice(0, options.limit ?? rows.length).map(({ pin, exact }) => (exact === undefined ? { pin } : { pin, miles: roundMiles(exact) }));
}

/** Whether a visitor is inside the market's service area. */
export function insideServiceArea(map: Pick<LandingMapData, 'center' | 'serviceRadiusMiles'>, from: LatLng): boolean {
  return distanceMiles(map.center, from) <= map.serviceRadiusMiles;
}

/** Just past the service area, a visitor is still a neighbor: their distances and "nearest" still mean something. */
const NEARBY_MARGIN_MILES = 15;

/**
 * Where the list measures from: the visitor's place, if it's in or near the market. Someone in another city (the page
 * finds them by itself now) keeps the usual order with no distances, rather than every task "1,040 mi" away; the map
 * still shows where they are.
 */
export function listOrigin(map: Pick<LandingMapData, 'center' | 'serviceRadiusMiles'>, point: LatLng | undefined): LatLng | undefined {
  if (!point) return undefined;
  return distanceMiles(map.center, point) <= map.serviceRadiusMiles + NEARBY_MARGIN_MILES ? point : undefined;
}

/**
 * The open (or opening) city a point is in: inside its service area, or just past it (the same margin as
 * `listOrigin`); the nearest such city when two reach. Null when the point is in none (someone in a city we haven't
 * opened). Worked out on the device: the point goes nowhere.
 */
export function cityAt(cities: readonly MapCity[], point: LatLng): MapCity | null {
  let best: { city: MapCity; miles: number } | null = null;
  for (const city of cities) {
    const miles = distanceMiles(city.point, point);
    if (miles > city.serviceRadiusMiles + NEARBY_MARGIN_MILES) continue;
    if (!best || miles < best.miles) best = { city, miles };
  }
  return best?.city ?? null;
}

/** The nearest city to a point and how far it is (straight-line miles, unrounded), or null without any city. */
export function nearestCity(cities: readonly MapCity[], point: LatLng): { city: MapCity; miles: number } | null {
  let best: { city: MapCity; miles: number } | null = null;
  for (const city of cities) {
    const miles = distanceMiles(city.point, point);
    if (!best || miles < best.miles) best = { city, miles };
  }
  return best;
}

/** How far from a place people wait for a visitor still counts as "there" (miles: about one metro area). */
export const WAITING_REACH_MILES = 35;

/**
 * The place people wait for nearest a point, within `reach` miles (a visitor in no open city: "Not open in {name}
 * yet"), or null. Worked out on the device, like `cityAt`.
 */
export function waitingPlaceNear(places: readonly WaitingPlace[] | undefined, point: LatLng, reach = WAITING_REACH_MILES): WaitingPlace | null {
  let best: { place: WaitingPlace; miles: number } | null = null;
  for (const place of places ?? []) {
    const miles = distanceMiles(place.point, point);
    if (miles <= reach && (!best || miles < best.miles)) best = { place, miles };
  }
  return best?.place ?? null;
}

/** The middle of what the map shows (its corners' average, [lng, lat] each), or null while they aren't all known. */
export function cornersMiddle(corners: readonly (readonly [number, number])[]): LatLng | null {
  if (corners.length === 0 || !corners.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))) return null;
  return { lat: corners.reduce((sum, [, lat]) => sum + lat, 0) / corners.length, lng: corners.reduce((sum, [lng]) => sum + lng, 0) / corners.length };
}

/** What `showCityFrom` needs of the live map's controls. */
export interface CityCamera {
  corners: () => [number, number][];
  centerOn: (point: LatLng, options?: { animate?: boolean }) => void;
  showCity: () => void;
}

/**
 * Back to the city view. From far away (the visitor's own area, in a city we haven't opened), the map first jumps to
 * the city: easing there would sweep hundreds of miles of streets past at street level.
 */
export function showCityFrom(controls: CityCamera, map: Pick<LandingMapData, 'center' | 'serviceRadiusMiles'>): void {
  const middle = cornersMiddle(controls.corners());
  if (middle && distanceMiles(middle, map.center) > map.serviceRadiusMiles * 3) controls.centerOn(map.center);
  controls.showCity();
}

/**
 * The cities in the order the switcher lists them: nearest first once the visitor's place is known, otherwise the
 * open ones, then the ones opening soon, each alphabetical.
 */
export function citiesInOrder(cities: readonly MapCity[], from?: LatLng): MapCity[] {
  const list = [...cities];
  if (from) return list.sort((a, b) => distanceMiles(from, a.point) - distanceMiles(from, b.point) || a.name.localeCompare(b.name));
  return list.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'live' ? -1 : 1));
}

export const METERS_PER_MILE = 1609.344;
const METERS_PER_DEGREE = 111_320;

/** A circle on the ground as a closed GeoJSON ring ([lng, lat] pairs), flat-earth (fine at city scale). */
export function circleRing(center: LatLng, radiusMeters: number, steps = 72): [number, number][] {
  const dLat = radiusMeters / METERS_PER_DEGREE;
  const dLng = radiusMeters / (METERS_PER_DEGREE * Math.cos((center.lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let k = 0; k <= steps; k += 1) {
    const angle = (k / steps) * Math.PI * 2;
    ring.push([center.lng + Math.cos(angle) * dLng, center.lat + Math.sin(angle) * dLat]);
  }
  return ring;
}

/** The bounding box of a circle (to fit the camera to it). */
export function circleBounds(center: LatLng, radiusMeters: number): ViewBounds {
  const dLat = radiusMeters / METERS_PER_DEGREE;
  const dLng = radiusMeters / (METERS_PER_DEGREE * Math.cos((center.lat * Math.PI) / 180));
  return { west: center.lng - dLng, south: center.lat - dLat, east: center.lng + dLng, north: center.lat + dLat };
}

/** Everything outside a circle (the world with the circle cut out), to soften what's beyond the service area. */
export function outsideCircle(center: LatLng, radiusMeters: number): { type: 'Polygon'; coordinates: [number, number][][] } {
  const world: [number, number][] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  return { type: 'Polygon', coordinates: [world, circleRing(center, radiusMeters).reverse()] };
}

/**
 * A cluster's donut: one arc per category with tasks in it, in the given order, as fractions of the turn
 * (`start`/`length`, 0–1 from the top, clockwise) with a small gap between arcs.
 */
export function donutArcs(counts: number[], gap = 0.03): { index: number; start: number; length: number }[] {
  const total = counts.reduce((sum, count) => sum + Math.max(0, count), 0);
  if (total === 0) return [];
  const used = counts.filter((count) => count > 0).length;
  const room = used > 1 ? 1 - gap * used : 1;
  const arcs: { index: number; start: number; length: number }[] = [];
  let at = 0;
  counts.forEach((count, index) => {
    if (count <= 0) return;
    const length = (count / total) * room;
    arcs.push({ index, start: at, length });
    at += length + (used > 1 ? gap : 0);
  });
  return arcs;
}

// ---- The map's arrival under the hero --------------------------------------------------------------------

export interface MapCamera {
  center: LatLng;
  zoom: number;
  pitch: number;
  bearing: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (t: number) => t * t * (3 - 2 * t);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);


/** A box inside the map (pixels from its top-left corner): the part a visitor sees, clear of the page's panels. */
export interface EdgeBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where a marker for an off-screen point sits: on the box's edge, along the line from the box's middle toward the
 * point, with the angle it points in (radians, 0 = right, clockwise as screens go). Null while the point is inside
 * the box (it shows itself there).
 */
export function edgeMarker(point: { x: number; y: number }, box: EdgeBox): { x: number; y: number; angle: number } | null {
  if (point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom) return null;
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const dx = point.x - cx;
  const dy = point.y - cy;
  const halfW = Math.max(0, (box.right - box.left) / 2);
  const halfH = Math.max(0, (box.bottom - box.top) / 2);
  // The first edge the line meets: the smaller of the two scales.
  const scale = Math.min(dx === 0 ? Infinity : halfW / Math.abs(dx), dy === 0 ? Infinity : halfH / Math.abs(dy));
  const reach = Number.isFinite(scale) ? scale : 0;
  return { x: cx + dx * reach, y: cy + dy * reach, angle: Math.atan2(dy, dx) };
}

/** A panel over the map (pixels from the map's top-left corner). */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Moves a pill (centered at `at`, `half` its half size) out from under the page's panels over the map (the heading's
 * card, the explorer, the tool bars), staying inside `box`: of the four ways out of a panel it overlaps (below, above,
 * right, left of it), the shortest that stays inside, again if that lands on another panel. Where that still ends on
 * a panel (two panels stacked with less room between them than the pill, like the card over the tool bars along the
 * map's left edge), the nearest spot inside the box that's clear of every panel, among the panels' edges. Where there's
 * none, it stays put.
 */
export function stepAroundPanels(at: { x: number; y: number }, half: { x: number; y: number }, box: EdgeBox, panels: ScreenRect[], gap = 10): { x: number; y: number } {
  const onPanel = (spot: { x: number; y: number }) => panels.find((panel) => spot.x + half.x + gap > panel.left && spot.x - half.x - gap < panel.right && spot.y + half.y + gap > panel.top && spot.y - half.y - gap < panel.bottom);
  const inside = (spot: { x: number; y: number }) => spot.x - half.x >= box.left && spot.x + half.x <= box.right && spot.y - half.y >= box.top && spot.y + half.y <= box.bottom;
  const nearest = (spots: { x: number; y: number }[], from: { x: number; y: number }) => spots.reduce((best, spot) => (Math.hypot(spot.x - from.x, spot.y - from.y) < Math.hypot(best.x - from.x, best.y - from.y) ? spot : best));
  let { x, y } = at;
  for (let round = 0; round < 4; round += 1) {
    const hit = onPanel({ x, y });
    if (!hit) return { x, y };
    const ways = [
      { x, y: hit.bottom + half.y + gap },
      { x, y: hit.top - half.y - gap },
      { x: hit.right + half.x + gap, y },
      { x: hit.left - half.x - gap, y },
    ].filter(inside);
    if (ways.length === 0) break;
    ({ x, y } = nearest(ways, { x, y }));
  }
  if (!onPanel({ x, y })) return { x, y };
  // Still on a panel: the nearest clear spot where the panels' edges (and the pill's own place) cross.
  const xs = new Set([at.x, ...panels.flatMap((panel) => [panel.right + half.x + gap, panel.left - half.x - gap])]);
  const ys = new Set([at.y, ...panels.flatMap((panel) => [panel.bottom + half.y + gap, panel.top - half.y - gap])]);
  const clear = [...xs].flatMap((spotX) => [...ys].map((spotY) => ({ x: spotX, y: spotY }))).filter((spot) => inside(spot) && !onPanel(spot));
  return clear.length > 0 ? nearest(clear, at) : { x, y };
}

/**
 * A rough drive time, in minutes, for a straight-line distance: roads run longer than the line (more so across town),
 * and the average speed grows with the trip (city streets, then highways). Shown as an estimate wherever it shows; the
 * distance is worked out on the device and goes nowhere.
 */
/** Miles as people say them: to the mile (a tenth under one), to the nearest 10 past 100 (879 and 881 both read 880). */
export function aboutMiles(miles: number): number {
  return miles >= 100 ? Math.round(miles / 10) * 10 : roundMiles(miles);
}

export function driveMinutes(miles: number): number {
  const road = miles * (miles < 30 ? 1.35 : miles < 120 ? 1.25 : 1.15);
  const mph = miles < 8 ? 22 : miles < 30 ? 30 : miles < 120 ? 50 : 65;
  return Math.max(1, Math.round((road / mph) * 60));
}

/**
 * The camera at `t` (0–1) on the way from a close, tilted view of one task's area (`from`) to the city view
 * (`to`): it pulls back and flattens. The center moves so the task drifts smoothly on screen from the middle to
 * where it sits in the city view (a straight blend would whip across at the close zooms).
 */
export function arrivalCamera(t: number, from: MapCamera, to: MapCamera): MapCamera {
  const p = clamp01(t);
  const zoom = from.zoom + (to.zoom - from.zoom) * easeInOut(p);
  const flatten = smooth(clamp01(p / 0.9));
  // The task's offset on screen grows from 0 to its final size; in world terms that's scaled by the zoom.
  const share = smooth(p) * Math.pow(2, to.zoom - zoom);
  return {
    center: { lat: from.center.lat + (to.center.lat - from.center.lat) * share, lng: from.center.lng + (to.center.lng - from.center.lng) * share },
    zoom,
    pitch: from.pitch + (to.pitch - from.pitch) * flatten,
    bearing: from.bearing + (to.bearing - from.bearing) * flatten,
  };
}

// ---- The drawn map ------------------------------------------------------------------------------------------

/**
 * Projects points into a w×h box, `spanMiles` across the width, with `center` at `origin` (fractions of the
 * box; its middle unless panels cover part of the map).
 */
export function projector(center: LatLng, spanMiles: number, width: number, height: number, origin: { x: number; y: number } = { x: 0.5, y: 0.5 }) {
  const milesPerLat = 69.05;
  const milesPerLng = 69.17 * Math.cos((center.lat * Math.PI) / 180);
  const scale = width / spanMiles;
  return (point: LatLng) => ({
    x: width * origin.x + (point.lng - center.lng) * milesPerLng * scale,
    y: height * origin.y - (point.lat - center.lat) * milesPerLat * scale,
  });
}

/** Pixels per mile for the drawn map's scale (to draw a task's area circle). */
export function pixelsPerMile(spanMiles: number, width: number): number {
  return width / spanMiles;
}

// ---- A cluster in bloom ------------------------------------------------------------------------------------

/** Most tasks a cluster fans out (a bigger one zooms in instead, as before). */
export const BLOOM_MAX = 16;

/**
 * Where each of `count` tasks sits when its cluster fans out (pixels from the cluster's middle): evenly round one
 * ring, starting at the top and going clockwise, wide enough that their 34 px badges keep about 8 px apart.
 */
export function bloomOffsets(count: number, badge = 34, gap = 8): { x: number; y: number }[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, y: -Math.max(44, badge + gap) }];
  const radius = Math.max(44, ((badge + gap) * count) / (2 * Math.PI));
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    return { x: Math.round(Math.cos(angle) * radius * 10) / 10, y: Math.round(Math.sin(angle) * radius * 10) / 10 };
  });
}

/** A typical price among tasks (the median of what they show, in cents), or null without any. */
export function medianCents(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}
