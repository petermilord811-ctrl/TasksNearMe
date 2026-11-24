import type { MapPoint, TravelMode } from '@/contracts';
import { distanceMiles } from '@/shared/geo';
import type { RoadGraph, RoadLine } from '@/ui/landing/map/drive-times';

/**
 * The trip to a task's area, worked out on the viewer's device (their location never leaves it): first from the
 * straight-line distance (at once), then along the roads the live map has loaded (OpenStreetMap through the tiles), with
 * the route drawn. Estimates, and labeled as such: typical speeds per road, plus lights and turns.
 */

export interface TripEstimate {
  mode: TravelMode;
  minutes: number;
  miles: number;
  /** Along the map's roads (with a route to draw), or from the straight line. */
  basis: 'roads' | 'straight';
}

/** Walking and cycling speeds (mph), and how much longer than the straight line a city trip runs. */
const WALK_MPH = 3;
const BIKE_MPH = 10;
const DETOUR: Readonly<Record<TravelMode, number>> = { drive: 1.35, bike: 1.3, walk: 1.25 };
/** Beyond these, a mode isn't offered (nobody walks 9 miles to a task). */
export const MODE_MAX_MILES: Readonly<Record<TravelMode, number>> = { drive: 200, bike: 8, walk: 2.5 };

/** About how long a drive of this straight-line distance takes in and around a city (the landing map's curve). */
export function driveMinutesFor(miles: number): number {
  const road = miles * (miles < 30 ? DETOUR.drive : miles < 120 ? 1.25 : 1.15);
  const mph = miles < 8 ? 22 : miles < 30 ? 30 : miles < 120 ? 50 : 65;
  return Math.max(1, Math.round((road / mph) * 60));
}

/** The straight-line estimates for each mode that makes sense at this distance. */
export function straightTrips(from: MapPoint, to: MapPoint): TripEstimate[] {
  const straight = distanceMiles(from, to);
  const trips: TripEstimate[] = [];
  const road = (mode: TravelMode) => Math.round(straight * DETOUR[mode] * 10) / 10;
  if (straight <= MODE_MAX_MILES.drive) trips.push({ mode: 'drive', minutes: driveMinutesFor(straight), miles: road('drive'), basis: 'straight' });
  if (straight <= MODE_MAX_MILES.bike) trips.push({ mode: 'bike', minutes: Math.max(1, Math.round((road('bike') / BIKE_MPH) * 60)), miles: road('bike'), basis: 'straight' });
  if (straight <= MODE_MAX_MILES.walk) trips.push({ mode: 'walk', minutes: Math.max(1, Math.round((road('walk') / WALK_MPH) * 60)), miles: road('walk'), basis: 'straight' });
  return trips;
}

/** The weekday hour in a zone (0 Sunday … 6 Saturday; 0–23). */
function zonedParts(at: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(at);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((part) => part.type === 'weekday')?.value ?? '');
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 12);
  return { weekday, hour };
}

/**
 * Rush hour at a moment in the task's zone: weekday mornings (7–9) and late afternoons (4–7). A drive then takes about
 * a third longer; the trip shows it for the task's start.
 */
export function isRushHour(at: Date, timeZone: string): boolean {
  const { weekday, hour } = zonedParts(at, timeZone);
  if (weekday === 0 || weekday === 6) return false;
  return (hour >= 7 && hour < 9) || (hour >= 16 && hour < 19);
}

export const RUSH_FACTOR = 1.3;

// ---- Along the map's roads ----

/** Road classes a bike or a walk takes (no freeways), and the drive's (the landing map's table). */
const NO_FREEWAYS = new Set(['motorway', 'trunk']);

/** The roads a mode uses, from what the map has loaded. */
export function linesFor(mode: TravelMode, lines: RoadLine[]): RoadLine[] {
  return mode === 'drive' ? lines : lines.filter((line) => !NO_FREEWAYS.has(line.className));
}

/** From the trip's start to the nearest road points: at most this far (miles), at a slow local speed. */
const ACCESS_MAX_MILES = 1.2;
const ACCESS_LINKS = 8;
const ACCESS_MPH = 12;

/** A small binary heap of [cost, node]. */
class Heap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(item: [number, number]) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent]![0] <= items[i]![0]) break;
      [items[parent], items[i]] = [items[i]!, items[parent]!];
      i = parent;
    }
  }
  pop(): [number, number] {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && items[left]![0] < items[smallest]![0]) smallest = left;
        if (right < items.length && items[right]![0] < items[smallest]![0]) smallest = right;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i]!, items[smallest]!];
        i = smallest;
      }
    }
    return top;
  }
}

export interface RoadRoute {
  minutes: number;
  miles: number;
  /** [lng, lat] points from the start to the area's point. */
  path: [number, number][];
}

/**
 * The quickest way from the graph's origin (the trip's start) to `target` over its roads: a drive at the roads'
 * speeds (the graph's own minutes), a bike or a walk at its pace along them. The last stretch from the road point
 * nearest the target is straight, at the access speed. Null when the roads loaded don't connect the two.
 */
export function routeOnRoads(graph: RoadGraph, target: MapPoint, mode: TravelMode): RoadRoute | null {
  const { nodes, links } = graph;
  if (nodes.length === 0) return null;
  const milesPerLng = 69.17 * Math.cos((graph.origin.lat * Math.PI) / 180);
  const tx = (target.lng - graph.origin.lng) * milesPerLng;
  const ty = (target.lat - graph.origin.lat) * 69.05;
  const pace = mode === 'drive' ? null : mode === 'bike' ? BIKE_MPH : WALK_MPH;
  const edgeMiles = (a: number, b: number) => Math.hypot(nodes[b]!.x - nodes[a]!.x, nodes[b]!.y - nodes[a]!.y);
  const cost = new Float64Array(nodes.length).fill(Infinity);
  const previous = new Int32Array(nodes.length).fill(-1);
  const heap = new Heap();
  const near = nodes
    .map((node, id) => ({ id, miles: Math.hypot(node.x, node.y) }))
    .filter((entry) => entry.miles <= ACCESS_MAX_MILES)
    .sort((a, b) => a.miles - b.miles)
    .slice(0, ACCESS_LINKS);
  for (const entry of near) {
    const minutes = (entry.miles / (pace ?? ACCESS_MPH)) * 60;
    if (minutes < cost[entry.id]!) {
      cost[entry.id] = minutes;
      heap.push([minutes, entry.id]);
    }
  }
  // The target is reached from any road point within the access distance of it; the quickest total wins.
  const targetLinks = new Map<number, number>();
  nodes.forEach((node, id) => {
    const miles = Math.hypot(node.x - tx, node.y - ty);
    if (miles <= ACCESS_MAX_MILES) targetLinks.set(id, (miles / (pace ?? ACCESS_MPH)) * 60);
  });
  if (targetLinks.size === 0) return null;
  let best = Infinity;
  let bestNode = -1;
  while (heap.size > 0) {
    const [minutes, id] = heap.pop();
    if (minutes > cost[id]!) continue;
    if (minutes >= best) break;
    const finish = targetLinks.get(id);
    if (finish !== undefined && minutes + finish < best) {
      best = minutes + finish;
      bestNode = id;
    }
    for (const [next, driveMinutes] of links[id]!) {
      const step = pace === null ? driveMinutes : (edgeMiles(id, next) / pace) * 60;
      const reached = minutes + step;
      if (reached < cost[next]!) {
        cost[next] = reached;
        previous[next] = id;
        heap.push([reached, next]);
      }
    }
  }
  if (bestNode < 0) return null;
  const chain: number[] = [];
  for (let at = bestNode; at >= 0; at = previous[at]!) chain.push(at);
  chain.reverse();
  let miles = Math.hypot(nodes[chain[0]!]!.x, nodes[chain[0]!]!.y);
  for (let i = 1; i < chain.length; i += 1) miles += edgeMiles(chain[i - 1]!, chain[i]!);
  miles += Math.hypot(nodes[bestNode]!.x - tx, nodes[bestNode]!.y - ty);
  const path: [number, number][] = [[graph.origin.lng, graph.origin.lat], ...chain.map((id) => [nodes[id]!.lng, nodes[id]!.lat] as [number, number]), [target.lng, target.lat]];
  return { minutes: Math.max(1, Math.round(best)), miles: Math.round(miles * 10) / 10, path };
}

/** "12 min", "1 h 5 min": minutes for display in a language-neutral shape (hours and minutes). */
export function splitMinutes(minutes: number): { hours: number; minutes: number } {
  const total = Math.max(1, Math.round(minutes));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
