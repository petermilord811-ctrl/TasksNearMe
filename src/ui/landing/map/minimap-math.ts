import type { LatLng } from '@/shared/geo';

/**
 * Small, pure helpers for the landing map's minimap (unit-tested): its flat projection of the city (fine at city
 * scale), whether a point is in the big map's frame, how deep a neighborhood is shaded for its open tasks, the scale
 * bar's length, the task under a press, tasks at one spot drawn as one counted dot, and labels on its edge for far
 * places (the open cities, seen from a visitor's own area).
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

/** Away from every open city, the minimap shows the visitor's own area: this many miles from them to its top and bottom. */
export const MINIMAP_AWAY_MILES = 10;

/** Dots closer than this (pixels) are drawn as one counted dot. */
export const DOT_GROUP_REACH = 6;

/** Dots drawn as one: their middle and who's in it (one member: a plain dot). */
export interface DotGroup<T> {
  x: number;
  y: number;
  members: T[];
}

/**
 * Tasks at (nearly) the same spot, as one counted dot instead of dots hiding each other: in the order given (newest
 * first), each dot joins the first group whose middle is within `reach` pixels, or starts one; a group's middle is
 * its members' average.
 */
export function groupDots<T extends MiniPoint>(dots: readonly T[], reach = DOT_GROUP_REACH): DotGroup<T>[] {
  const groups: (DotGroup<T> & { sumX: number; sumY: number })[] = [];
  for (const dot of dots) {
    const group = groups.find((item) => Math.hypot(item.x - dot.x, item.y - dot.y) <= reach);
    if (!group) {
      groups.push({ x: dot.x, y: dot.y, members: [dot], sumX: dot.x, sumY: dot.y });
      continue;
    }
    group.members.push(dot);
    group.sumX += dot.x;
    group.sumY += dot.y;
    group.x = group.sumX / group.members.length;
    group.y = group.sumY / group.members.length;
  }
  return groups.map(({ x, y, members }) => ({ x, y, members }));
}

/** The most common value (ties: the first seen), e.g. a group's neighborhood or category. */
export function mostCommon<T>(values: readonly T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestCount = 0;
  for (const value of values) {
    const next = (counts.get(value) ?? 0) + 1;
    counts.set(value, next);
    if (next > bestCount) {
      best = value;
      bestCount = next;
    }
  }
  return best;
}

export type EdgeSide = 'left' | 'right' | 'top' | 'bottom';

/** About how big a far place's label is on the minimap's edge (pixels): its name over its miles. */
export const EDGE_LABEL_SIZE = { width: 92, height: 28 };

export interface EdgeLabel {
  id: string;
  /** Where the label is anchored (on the edge it sits on, kept clear of the corners). */
  x: number;
  y: number;
  /** Radians, 0 = right: the way to the place (the label's arrow points there). */
  angle: number;
  /** The edge it sits on (the label grows inward from it). */
  side: EdgeSide;
}

/**
 * Where labels for far places sit on the minimap's edge, each where the line toward its place leaves the minimap: in
 * the order given (nearest first), at most `limit`. A label is about `size` pixels (a city's name over its miles), kept
 * off the corners; one that would overlap a label already placed slides along its edge until it's clear (by at most
 * `maxNudge` pixels: two cities the same way stack), or is left out. Places on the minimap itself get none.
 */
export function placeEdgeLabels(
  items: readonly { id: string; at: MiniPoint }[],
  width: number,
  height: number,
  options: { limit?: number; margin?: number; size?: { width: number; height: number }; maxNudge?: number } = {},
): EdgeLabel[] {
  const { limit = 3, margin = 8, size = EDGE_LABEL_SIZE, maxNudge = 48 } = options;
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  // Each label's box: it grows inward from its edge.
  const box = (at: EdgeLabel) => {
    const left = at.side === 'left' ? at.x : at.side === 'right' ? at.x - size.width : at.x - halfWidth;
    const top = at.side === 'top' ? at.y : at.side === 'bottom' ? at.y - size.height : at.y - halfHeight;
    return { left, top, right: left + size.width, bottom: top + size.height };
  };
  const placed: EdgeLabel[] = [];
  const collides = (label: EdgeLabel) => {
    const mine = box(label);
    return placed.some((other) => {
      const theirs = box(other);
      return mine.left < theirs.right && mine.right > theirs.left && mine.top < theirs.bottom && mine.bottom > theirs.top;
    });
  };
  for (const item of items) {
    if (placed.length >= limit) break;
    const edge = miniEdge(item.at, width, height, margin);
    if (!edge) continue;
    const dx = item.at.x - width / 2;
    const dy = item.at.y - height / 2;
    const across = Math.abs(dx) / Math.max(1, width / 2 - margin) >= Math.abs(dy) / Math.max(1, height / 2 - margin);
    const side: EdgeSide = across ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'top' : 'bottom';
    const [low, high] = across ? [halfHeight + 2, height - halfHeight - 2] : [halfWidth + 4, width - halfWidth - 4];
    const ideal = Math.min(high, Math.max(low, across ? edge.y : edge.x));
    const at = (along: number): EdgeLabel =>
      across ? { id: item.id, x: side === 'left' ? margin : width - margin, y: along, angle: edge.angle, side } : { id: item.id, x: along, y: side === 'top' ? margin : height - margin, angle: edge.angle, side };
    // Where it would sit, or just past each label already placed (either way along its edge): the nearest clear one.
    const spots = [ideal];
    for (const other of placed) {
      const theirs = box(other);
      if (across) spots.push(theirs.top - halfHeight - 2, theirs.bottom + halfHeight + 2);
      else spots.push(theirs.left - halfWidth - 2, theirs.right + halfWidth + 2);
    }
    const fit = spots
      .filter((along) => along >= low && along <= high && Math.abs(along - ideal) <= maxNudge)
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))
      .find((along) => !collides(at(along)));
    if (fit !== undefined) placed.push(at(fit));
  }
  return placed;
}
