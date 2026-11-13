/**
 * Groups map points that would overlap on screen (greedy, in the order given), so a busy neighborhood
 * shows one "3 tasks" marker instead of a stack of prices. Pure: the map passes screen positions.
 */

export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

export interface PointGroup {
  ids: string[];
  /** The group's position: the mean of its points. */
  x: number;
  y: number;
}

export function groupPoints(points: readonly ScreenPoint[], radiusPx: number): PointGroup[] {
  const groups: { ids: string[]; xs: number[]; ys: number[]; x: number; y: number }[] = [];
  const limit = radiusPx * radiusPx;
  for (const point of points) {
    const near = groups.find((group) => (group.x - point.x) ** 2 + (group.y - point.y) ** 2 <= limit);
    if (near) {
      near.ids.push(point.id);
      near.xs.push(point.x);
      near.ys.push(point.y);
      near.x = near.xs.reduce((sum, value) => sum + value, 0) / near.xs.length;
      near.y = near.ys.reduce((sum, value) => sum + value, 0) / near.ys.length;
    } else {
      groups.push({ ids: [point.id], xs: [point.x], ys: [point.y], x: point.x, y: point.y });
    }
  }
  return groups.map(({ ids, x, y }) => ({ ids, x, y }));
}

/** The smallest box around some points ([west, south, east, north]), padded so a single point still has room. */
export function boundsOf(points: readonly { lat: number; lng: number }[], padDegrees = 0.004): [number, number, number, number] | null {
  if (points.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const point of points) {
    west = Math.min(west, point.lng);
    east = Math.max(east, point.lng);
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
  }
  return [west - padDegrees, south - padDegrees, east + padDegrees, north + padDegrees];
}
