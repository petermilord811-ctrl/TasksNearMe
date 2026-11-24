import type { LatLng } from '@/shared/geo';

/**
 * Small, pure helpers for the landing map's minimap (unit-tested): its flat projection of the city (fine at city
 * scale), whether a point is in the big map's frame, how deep a neighborhood is shaded for its open tasks, the scale
 * bar's length, and the task under a press.
 */

export type MinimapSize = 'small' | 'large';
/** How the minimap shows: small (the default), large, or folded to a chip. */
export type MinimapMode = MinimapSize | 'folded';
/** The drawing's size (pixels): small by default, large on request. */
export const MINIMAP_SIZES: Record<MinimapSize, { width: number; height: number }> = { small: { width: 220, height: 140 }, large: { width: 300, height: 190 } };

const MILES_PER_LAT = 69.05;
const MILES_PER_LNG_AT_EQUATOR = 69.17;

export interface MiniPoint {
  x: number;
  y: number;
}

/**
 * The minimap's projection: the city's service area (and a margin) fills its height, its center in the middle.
 * `toXY` and `toLatLng` are each other's inverse.
 */
export function miniProjection(center: LatLng, radiusMiles: number, width: number, height: number) {
  const radius = Math.max(1, radiusMiles);
  // Miles to pixels: the service circle and a margin fill the height.
  const scale = height / (radius * 2 * 1.12);
  const milesPerLng = MILES_PER_LNG_AT_EQUATOR * Math.cos((center.lat * Math.PI) / 180);
  return {
    /** Pixels per mile. */
    scale,
    toXY: (point: LatLng): MiniPoint => ({ x: width / 2 + (point.lng - center.lng) * milesPerLng * scale, y: height / 2 - (point.lat - center.lat) * MILES_PER_LAT * scale }),
    toLatLng: (at: MiniPoint): LatLng => ({ lat: center.lat - (at.y - height / 2) / (MILES_PER_LAT * scale), lng: center.lng + (at.x - width / 2) / (milesPerLng * scale) }),
  };
}

/** Whether a point is inside a convex quadrilateral (the big map's frame, its corners in order, either way round). */
export function inQuad(point: MiniPoint, quad: readonly MiniPoint[]): boolean {
  if (quad.length !== 4) return false;
  let sign = 0;
  for (let index = 0; index < 4; index += 1) {
    const a = quad[index]!;
    const b = quad[(index + 1) % 4]!;
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (cross === 0) continue;
    const side = Math.sign(cross);
    if (sign === 0) sign = side;
    else if (side !== sign) return false;
  }
  return true;
}

/** The middle of a quadrilateral (the average of its corners). */
export function quadMiddle(quad: readonly MiniPoint[]): MiniPoint {
  const count = Math.max(1, quad.length);
  return { x: quad.reduce((sum, at) => sum + at.x, 0) / count, y: quad.reduce((sum, at) => sum + at.y, 0) / count };
}

/**
 * How deep a neighborhood is shaded for its open tasks (0 without any): a little for one, more as it gets busier,
 * relative to the busiest neighborhood on the minimap, never past `max`.
 */
export function densityShade(count: number, busiest: number, max = 0.3): number {
  if (count <= 0 || busiest <= 0) return 0;
  return Math.round((0.06 + (max - 0.06) * Math.sqrt(Math.min(1, count / busiest))) * 1000) / 1000;
}

/** A round distance for the scale bar (miles), as long as possible without its bar passing `maxPixels`. */
export function scaleBar(pixelsPerMile: number, maxPixels: number): { miles: number; pixels: number } {
  const steps = [0.5, 1, 2, 5, 10, 20, 50];
  let chosen = steps[0]!;
  for (const miles of steps) if (miles * pixelsPerMile <= maxPixels) chosen = miles;
  return { miles: chosen, pixels: Math.round(chosen * pixelsPerMile * 10) / 10 };
}

/** The task whose dot is nearest a press, within `reach` pixels (dots are small: the press needn't be exact). */
export function nearestDot<T extends { id: string }>(at: MiniPoint, dots: readonly (T & { x: number; y: number })[], reach: number): T | null {
  let best: { dot: T; distance: number } | null = null;
  for (const dot of dots) {
    const distance = Math.hypot(dot.x - at.x, dot.y - at.y);
    if (distance <= reach && (!best || distance < best.distance)) best = { dot, distance };
  }
  return best?.dot ?? null;
}

/**
 * Where a point outside the minimap is shown: on its edge, along the line from the middle toward it (with a margin),
 * and the angle it points in (radians, 0 = right). Null when the point is on the minimap.
 */
export function miniEdge(at: MiniPoint, width: number, height: number, margin = 8): { x: number; y: number; angle: number } | null {
  if (at.x >= margin && at.x <= width - margin && at.y >= margin && at.y <= height - margin) return null;
  const cx = width / 2;
  const cy = height / 2;
  const dx = at.x - cx;
  const dy = at.y - cy;
  const scale = Math.min(dx === 0 ? Infinity : (cx - margin) / Math.abs(dx), dy === 0 ? Infinity : (cy - margin) / Math.abs(dy));
  const reach = Number.isFinite(scale) ? scale : 0;
  return { x: cx + dx * reach, y: cy + dy * reach, angle: Math.atan2(dy, dx) };
}

/** Whether a point is inside a polygon (a neighborhood's outline on the minimap; ray casting, any shape). */
export function inPolygon(point: MiniPoint, ring: readonly MiniPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index]!;
    const b = ring[previous]!;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
