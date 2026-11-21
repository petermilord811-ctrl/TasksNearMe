/**
 * The outline someone draws around part of the map ("watch an area"), in screen pixels: thinned to the points that
 * shape it (Ramer–Douglas–Peucker), and accepted only when it encloses something.
 */

export type ScreenPoint = { x: number; y: number };

function distanceToSegment(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The path with only the points that matter (none of them further than `tolerance` px from the thinned line). */
export function simplifyPath(points: ScreenPoint[], tolerance = 4): ScreenPoint[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = first + 1; i < last; i += 1) {
      const distance = distanceToSegment(points[i]!, points[first]!, points[last]!);
      if (distance > worstDistance) {
        worst = i;
        worstDistance = distance;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

/** The area a closed outline encloses (px², shoelace). */
export function enclosedArea(points: ScreenPoint[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** A drawn outline worth using: at least three points around something bigger than a fingertip (40 × 40 px). */
export function usableOutline(points: ScreenPoint[]): boolean {
  return points.length >= 3 && enclosedArea(points) >= 1600;
}
