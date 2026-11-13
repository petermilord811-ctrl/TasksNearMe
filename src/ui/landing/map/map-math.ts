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
export type ListSort = 'newest' | 'nearest' | 'price';

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
  options: { from?: LatLng; category?: string | null; limit?: number; sort?: ListSort; withinMiles?: number | null; bounds?: ViewBounds | null },
): NearbyPin[] {
  const { from, withinMiles, bounds } = options;
  let rows: { pin: TaskMapPin; exact?: number; order: number }[] = pins
    .map((pin, order) => (from ? { pin, exact: distanceMiles(from, pin.point), order } : { pin, order }))
    .filter(({ pin }) => !options.category || pin.categorySlug === options.category);
  if (from && withinMiles) rows = rows.filter((row) => (row.exact ?? 0) <= withinMiles);
  if (bounds) rows = rows.filter((row) => inBounds(row.pin.point, bounds));
  const sort = effectiveSort(options.sort, from);
  if (sort === 'nearest') rows.sort((a, b) => (a.exact ?? 0) - (b.exact ?? 0) || a.order - b.order);
  else if (sort === 'price') rows.sort((a, b) => shownAmountCents(a.pin) - shownAmountCents(b.pin) || a.order - b.order);
  return rows.slice(0, options.limit ?? rows.length).map(({ pin, exact }) => (exact === undefined ? { pin } : { pin, miles: roundMiles(exact) }));
}

/** Whether a visitor is inside the market's service area. */
export function insideServiceArea(map: Pick<LandingMapData, 'center' | 'serviceRadiusMiles'>, from: LatLng): boolean {
  return distanceMiles(map.center, from) <= map.serviceRadiusMiles;
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
 * How far the map has arrived (0–1) from where its top edge is: 0 as it enters at the bottom of the window,
 * 1 once it reaches the top 15% (the heading and the list sit over it by then).
 */
export function arrivalProgress(top: number, viewportHeight: number): number {
  const height = Math.max(1, viewportHeight);
  return clamp01((height - top) / (height * 0.85));
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
