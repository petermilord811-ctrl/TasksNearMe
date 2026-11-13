/**
 * Small, pure geometry for the hero's mini-map town (unit-tested): the isometric sketch's projection, a seeded
 * random source, marching squares and smoothing. No DOM, no three.js.
 */

export interface Pt {
  x: number;
  y: number;
}

export const COS30 = Math.sqrt(3) / 2;

/** World (x, y on the ground, z up) → the drawing's user space (isometric, 30°). */
export function iso(x: number, y: number, z = 0): Pt {
  return { x: (x - y) * COS30, y: (x + y) / 2 - z };
}

/** A point of the drawing → the world point at height `z` that draws there. */
export function unIso(sx: number, sy: number, z = 0): Pt {
  const a = sx / COS30;
  const b = (sy + z) * 2;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Mulberry32: a small, fast, seeded random source, so the drawing is the same on every render. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distanceToSegment(p: Pt, a: Pt, b: Pt): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  const x = a.x + t * dx - p.x;
  const y = a.y + t * dy - p.y;
  return { distance: Math.sqrt(x * x + y * y), t };
}

export function signedArea(points: Pt[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

export function pointInPolygon(p: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Marching squares: the closed outlines of the region where `values < level`, on a grid of `cols × rows`
 * samples starting at (x0, y0), `cell` apart. Every outline comes back with a positive signed area. The
 * grid's border must be outside the region so that every outline closes.
 */
export function contours(values: ArrayLike<number>, cols: number, rows: number, x0: number, y0: number, cell: number, level: number): Pt[][] {
  const at = (i: number, j: number) => values[j * cols + i]!;
  const points = new Map<number, Pt>();
  const links = new Map<number, number[]>();
  const horizontal = (i: number, j: number) => (j * cols + i) * 2;
  const vertical = (i: number, j: number) => (j * cols + i) * 2 + 1;
  const crossing = (id: number): Pt => {
    const known = points.get(id);
    if (known) return known;
    const cellIndex = id >> 1;
    const i = cellIndex % cols;
    const j = Math.floor(cellIndex / cols);
    const [i2, j2] = id & 1 ? [i, j + 1] : [i + 1, j];
    const a = at(i, j);
    const b = at(i2, j2);
    const t = b === a ? 0.5 : (level - a) / (b - a);
    const point = { x: x0 + (i + t * (i2 - i)) * cell, y: y0 + (j + t * (j2 - j)) * cell };
    points.set(id, point);
    return point;
  };
  const link = (a: number, b: number) => {
    crossing(a);
    crossing(b);
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };

  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const tl = at(i, j) < level;
      const tr = at(i + 1, j) < level;
      const br = at(i + 1, j + 1) < level;
      const bl = at(i, j + 1) < level;
      const index = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (index === 0 || index === 15) continue;
      const top = horizontal(i, j);
      const bottom = horizontal(i, j + 1);
      const left = vertical(i, j);
      const right = vertical(i + 1, j);
      const centerInside = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4 < level;
      switch (index) {
        case 1: case 14: link(left, bottom); break;
        case 2: case 13: link(bottom, right); break;
        case 3: case 12: link(left, right); break;
        case 4: case 11: link(top, right); break;
        case 6: case 9: link(top, bottom); break;
        case 7: case 8: link(top, left); break;
        case 5:
          if (centerInside) { link(top, left); link(bottom, right); } else { link(top, right); link(left, bottom); }
          break;
        case 10:
          if (centerInside) { link(top, right); link(left, bottom); } else { link(top, left); link(bottom, right); }
          break;
      }
    }
  }

  const seen = new Set<number>();
  const loops: Pt[][] = [];
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const loop: Pt[] = [];
    let previous = -1;
    let current = start;
    while (!seen.has(current)) {
      seen.add(current);
      loop.push(points.get(current)!);
      const next = (links.get(current) ?? []).find((id) => id !== previous && !seen.has(id));
      if (next === undefined) break;
      previous = current;
      current = next;
    }
    if (loop.length >= 3) loops.push(signedArea(loop) < 0 ? loop.reverse() : loop);
  }
  return loops;
}

/** Chaikin corner cutting on a closed outline (each pass doubles the points and rounds the corners). */
export function chaikin(points: Pt[], passes = 2): Pt[] {
  let current = points;
  for (let pass = 0; pass < passes; pass += 1) {
    const next: Pt[] = [];
    for (let i = 0; i < current.length; i += 1) {
      const a = current[i]!;
      const b = current[(i + 1) % current.length]!;
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    current = next;
  }
  return current;
}

/** Ramer–Douglas–Peucker on an open polyline. */
function simplifyOpen(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let worst = -1;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = distanceToSegment(points[i]!, points[start]!, points[end]!).distance;
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (worst > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplifies a closed outline, keeping its shape within `tolerance`. */
export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 8) return points;
  // Split at the point farthest from the first, so both halves are open polylines.
  let far = 0;
  let best = -1;
  for (let i = 1; i < points.length; i += 1) {
    const d = Math.hypot(points[i]!.x - points[0]!.x, points[i]!.y - points[0]!.y);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const first = simplifyOpen(points.slice(0, far + 1), tolerance);
  const second = simplifyOpen([...points.slice(far), points[0]!], tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

/** A Catmull-Rom spline through open polyline points, sampled every ~`step` units. */
export function spline(points: Pt[], step = 6): Pt[] {
  if (points.length < 3) return points;
  const out: Pt[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
    for (let k = 0; k < n; k += 1) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}
