import type { LandingMapData, TaskMapPin } from '@/contracts';
import { distanceMiles, roundMiles, type LatLng } from '@/shared/geo';

/**
 * Small, pure helpers for the landing map (unit-tested): sorting what's near a visitor, and a flat
 * projection for the static map (fine at city scale).
 */

export interface NearbyPin {
  pin: TaskMapPin;
  /** Rounded for display; absent without a location. */
  miles?: number;
}

/**
 * The list beside the map: filtered by category (when one is picked), then nearest first when we know
 * where the visitor is, or as supplied (newest first) when we don't.
 */
export function nearbyPins(pins: TaskMapPin[], options: { from?: LatLng; category?: string | null; limit?: number }): NearbyPin[] {
  const filtered = options.category ? pins.filter((pin) => pin.categorySlug === options.category) : pins;
  const rows: { pin: TaskMapPin; exact?: number }[] = filtered.map((pin) => (options.from ? { pin, exact: distanceMiles(options.from, pin.point) } : { pin }));
  if (options.from) rows.sort((a, b) => (a.exact ?? 0) - (b.exact ?? 0));
  return rows.slice(0, options.limit ?? rows.length).map(({ pin, exact }) => (exact === undefined ? { pin } : { pin, miles: roundMiles(exact) }));
}

/** Whether a visitor is inside the market's service area. */
export function insideServiceArea(map: Pick<LandingMapData, 'center' | 'serviceRadiusMiles'>, from: LatLng): boolean {
  return distanceMiles(map.center, from) <= map.serviceRadiusMiles;
}

/** Projects points into a w×h box centered on `center`, `spanMiles` across the width. */
export function projector(center: LatLng, spanMiles: number, width: number, height: number) {
  const milesPerLat = 69.05;
  const milesPerLng = 69.17 * Math.cos((center.lat * Math.PI) / 180);
  const scale = width / spanMiles;
  return (point: LatLng) => ({
    x: width / 2 + (point.lng - center.lng) * milesPerLng * scale,
    y: height / 2 - (point.lat - center.lat) * milesPerLat * scale,
  });
}

/** Pixels per mile for the static map's scale (to draw a task's area circle). */
export function pixelsPerMile(spanMiles: number, width: number): number {
  return width / spanMiles;
}
