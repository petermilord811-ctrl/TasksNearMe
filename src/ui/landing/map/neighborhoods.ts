import type { LatLng } from '@/shared/geo';

/**
 * The market's neighborhoods as areas on the map. A task's neighborhood is the one whose center is nearest to it
 * (`nearestArea` on the server names every task that way), so each neighborhood's area is the part of the service
 * area closer to its center than to any other: a Voronoi cell, clipped to the service circle. Drawn, it is exactly
 * how the app names places, not a guess at official boundaries. Pure and flat-earth (fine at city scale).
 */

export interface AreaSite {
  name: string;
  slug: string;
  point: LatLng;
}

export interface AreaCell extends AreaSite {
  /** The cell's outline, closed, as GeoJSON [lng, lat] pairs. */
  ring: [number, number][];
  /** Where its card and name sit: the neighborhood's center, or the cell's middle if the center was cut off. */
  label: LatLng;
}

type Vec = { x: number; y: number };

const MILES_PER_LAT = 69.05;
const milesPerLng = (lat: number) => 69.17 * Math.cos((lat * Math.PI) / 180);

/** Miles east and north of `origin`. */
function toPlane(origin: LatLng, point: LatLng): Vec {
  return { x: (point.lng - origin.lng) * milesPerLng(origin.lat), y: (point.lat - origin.lat) * MILES_PER_LAT };
}

function fromPlane(origin: LatLng, vec: Vec): LatLng {
  return { lat: origin.lat + vec.y / MILES_PER_LAT, lng: origin.lng + vec.x / milesPerLng(origin.lat) };
}

/** Keeps the part of a polygon where `n · p <= c` (Sutherland–Hodgman, one edge). */
function clipHalfPlane(polygon: Vec[], n: Vec, c: number): Vec[] {
  const out: Vec[] = [];
  const side = (p: Vec) => n.x * p.x + n.y * p.y - c;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa <= 0) !== (sb <= 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** The area-weighted middle of a polygon (its first point if it's degenerate). */
function centroid(polygon: Vec[]): Vec {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 1e-9) return polygon[0] ?? { x: 0, y: 0 };
  return { x: x / (3 * area), y: y / (3 * area) };
}

function insidePolygon(point: Vec, polygon: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Each neighborhood's area reaches at most this far from its center, as a share of the typical spacing between them. */
const REACH_SPACING = 1.6;
const REACH_MILES = { min: 1.2, max: 4 };

/**
 * How far a neighborhood's area reaches from its center: about one and a half times the usual distance between
 * neighboring centers (the median of each one's nearest), within 1.2–4 miles. Without it, a neighborhood at the edge of
 * the city would stretch to the edge of the service area, a wedge many miles long.
 */
export function areaReach(sites: AreaSite[]): number {
  if (sites.length < 2) return REACH_MILES.max;
  const nearest = sites.map((site) => {
    let best = Infinity;
    for (const other of sites) {
      if (other === site) continue;
      const d = toPlane(site.point, other.point);
      const miles = Math.hypot(d.x, d.y);
      if (miles > 1e-6) best = Math.min(best, miles);
    }
    return best;
  });
  const finite = nearest.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return REACH_MILES.max;
  const median = finite[Math.floor(finite.length / 2)]!;
  return Math.min(REACH_MILES.max, Math.max(REACH_MILES.min, median * REACH_SPACING));
}

/** Keeps the part of a convex polygon inside a disc (`radius` around `at`), drawn as a convex `steps`-gon. */
function clipDisc(polygon: Vec[], at: Vec, radius: number, steps = 40): Vec[] {
  let out = polygon;
  for (let k = 0; k < steps && out.length > 0; k += 1) {
    const a0 = (k / steps) * Math.PI * 2;
    const a1 = ((k + 1) / steps) * Math.PI * 2;
    const p0 = { x: at.x + Math.cos(a0) * radius, y: at.y + Math.sin(a0) * radius };
    const p1 = { x: at.x + Math.cos(a1) * radius, y: at.y + Math.sin(a1) * radius };
    // The disc's points run counterclockwise, so each edge's outward normal is (dy, −dx).
    const n = { x: p1.y - p0.y, y: -(p1.x - p0.x) };
    out = clipHalfPlane(out, n, n.x * p0.x + n.y * p0.y);
  }
  return out;
}

/**
 * Each neighborhood's cell inside the service circle (`radiusMiles` around `center`), reaching at most `reachMiles`
 * from its own center (`areaReach` by default; Infinity for the plain cells). Neighborhoods whose cell falls entirely
 * outside are left out; two at the same spot share one cell (the first keeps it).
 */
export function areaCells(sites: AreaSite[], center: LatLng, radiusMiles: number, steps = 96, reachMiles: number = areaReach(sites)): AreaCell[] {
  if (sites.length === 0 || radiusMiles <= 0) return [];
  const circle: Vec[] = [];
  for (let k = 0; k < steps; k += 1) {
    const angle = (k / steps) * Math.PI * 2;
    circle.push({ x: Math.cos(angle) * radiusMiles, y: Math.sin(angle) * radiusMiles });
  }
  const points = sites.map((site) => toPlane(center, site.point));
  const cells: AreaCell[] = [];
  sites.forEach((site, index) => {
    const a = points[index]!;
    // A second neighborhood at exactly the same spot adds nothing.
    if (points.slice(0, index).some((p) => Math.abs(p.x - a.x) < 1e-9 && Math.abs(p.y - a.y) < 1e-9)) return;
    let polygon = circle;
    points.forEach((b, other) => {
      if (other === index || polygon.length === 0) return;
      const n = { x: b.x - a.x, y: b.y - a.y };
      if (Math.abs(n.x) < 1e-9 && Math.abs(n.y) < 1e-9) return;
      // Closer to a than to b: n · p <= (|b|² − |a|²) / 2.
      polygon = clipHalfPlane(polygon, n, (b.x * b.x + b.y * b.y - a.x * a.x - a.y * a.y) / 2);
    });
    if (Number.isFinite(reachMiles) && polygon.length >= 3) polygon = clipDisc(polygon, a, reachMiles);
    if (polygon.length < 3) return;
    const ring = polygon.map((p) => {
      const at = fromPlane(center, p);
      return [at.lng, at.lat] as [number, number];
    });
    ring.push(ring[0]!);
    const label = insidePolygon(a, polygon) ? site.point : fromPlane(center, centroid(polygon));
    cells.push({ ...site, ring, label });
  });
  return cells;
}

/** The neighborhood a point belongs to (the nearest center), or null without any. */
export function nearestSite<T extends AreaSite>(sites: T[], point: LatLng): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const site of sites) {
    const d = toPlane(point, site.point);
    const distance = d.x * d.x + d.y * d.y;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = site;
    }
  }
  return best;
}

/** The bounding box of a cell's outline (to frame it). */
export function ringBounds(ring: [number, number][]): { west: number; south: number; east: number; north: number } {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of ring) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { west, south, east, north };
}

/** Whether a point ([lng, lat]) is inside a closed ring of [lng, lat] pairs (even-odd rule). */
export function insideRing(point: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The neighborhoods a drawn outline takes in (watching an area): every one whose center is inside it, or, when the
 * outline is too small to hold a center, the one its middle falls in. Alerts match on a task's neighborhood only,
 * never its place, so a small outline can't point at one house.
 */
export function sitesInOutline<T extends AreaSite>(sites: T[], outline: [number, number][]): T[] {
  if (outline.length < 3 || sites.length === 0) return [];
  const inside = sites.filter((site) => insideRing([site.point.lng, site.point.lat], outline));
  if (inside.length > 0) return inside;
  let x = 0;
  let y = 0;
  for (const [lng, lat] of outline) {
    x += lng;
    y += lat;
  }
  const middle = { lat: y / outline.length, lng: x / outline.length };
  const nearest = nearestSite(sites, middle);
  return nearest ? [nearest] : [];
}
