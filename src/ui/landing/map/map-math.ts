import type { LandingMapData, TaskMapPin } from '@/contracts';
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

/**
 * Wide screens: how far the map has arrived (0–1) once its stage is pinned. `top` is where the map's scroll track
 * starts (its section's top edge): 0 while the sheet is still sliding over the hero (top above 0 isn't reached
 * yet), then it runs over the next `distance` pixels of scrolling (the camera moves while the map itself stays put).
 */
export function pinnedArrivalProgress(top: number, distance: number): number {
  return clamp01(-top / Math.max(1, distance));
}

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
