import type { LatLng } from '@/shared/geo';

/**
 * Drive times from the visitor, worked out in the browser from the roads the map has already loaded (OpenStreetMap
 * data through OpenFreeMap's tiles), so their location never leaves the device and no routing service is asked.
 * Each road class gets a typical city speed, plus a little for lights and turns: an estimate, and labeled as one.
 *
 * Vector tiles cut long roads at their edges, and the two pieces may not share a point (a straight stretch with no
 * point inside the tiles' overlap). So a road's loose end that lies on another road's line (within a few meters) is
 * joined to it, and the network carries on across the seam.
 */

/** One road as the tiles have it: its points ([lng, lat]) and its OpenMapTiles class. */
export interface RoadLine {
  coordinates: [number, number][];
  className: string;
}

/** Typical city speeds (mph) by OpenMapTiles road class; other classes (paths, tracks, rail, ferries) aren't driven. */
export const ROAD_MPH: Readonly<Record<string, number>> = { motorway: 60, trunk: 50, primary: 40, secondary: 35, tertiary: 30, minor: 25, service: 12 };
/** Lights, turns and stops: a city drive takes about this much longer than its roads' speeds alone. */
export const CITY_FACTOR = 1.2;
/** From the visitor's spot to the first road the map has at this zoom (a driveway, a lot, the small streets left out). */
const ACCESS_MPH = 15;
const ACCESS_MAX_MILES = 1.2;
/** How many nearby road points the visitor's spot connects to (in different directions, so one dead end can't trap it). */
const ACCESS_LINKS = 8;
/** A loose road end this close to another road's line (miles; about 15 m) is the same road cut by a tile edge. */
const SEAM_MILES = 0.01;
/** Snapping key precision: 1e-5° (about a meter), so tiles' shared points meet. */
const SNAP = 1e5;

const MILES_PER_LAT = 69.05;

interface Node {
  x: number;
  y: number;
  lng: number;
  lat: number;
}

interface Edge {
  a: number;
  b: number;
  minutes: number;
}

export interface RoadGraph {
  nodes: Node[];
  edges: Edge[];
  /** Per node: [neighbor, minutes] pairs. */
  links: [number, number][][];
  origin: LatLng;
}

/** Builds the road network around `origin` (its plane is centered there). */
export function buildRoadGraph(lines: RoadLine[], origin: LatLng): RoadGraph {
  const milesPerLng = 69.17 * Math.cos((origin.lat * Math.PI) / 180);
  const nodes: Node[] = [];
  const index = new Map<string, number>();
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const ends: { node: number; line: number }[] = [];
  const nodeOf = (lng: number, lat: number) => {
    const key = `${Math.round(lng * SNAP)},${Math.round(lat * SNAP)}`;
    let id = index.get(key);
    if (id === undefined) {
      id = nodes.length;
      nodes.push({ x: (lng - origin.lng) * milesPerLng, y: (lat - origin.lat) * MILES_PER_LAT, lng, lat });
      index.set(key, id);
    }
    return id;
  };
  const edgeLine: number[] = [];
  lines.forEach((line, lineIndex) => {
    const mph = ROAD_MPH[line.className];
    if (!mph || line.coordinates.length < 2) return;
    let previous = -1;
    let first = -1;
    for (const [lng, lat] of line.coordinates) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      const id = nodeOf(lng, lat);
      if (first < 0) first = id;
      if (previous >= 0 && previous !== id) {
        const key = previous < id ? `${previous}:${id}` : `${id}:${previous}`;
        if (!seen.has(key)) {
          seen.add(key);
          const a = nodes[previous]!;
          const b = nodes[id]!;
          edges.push({ a: previous, b: id, minutes: (Math.hypot(b.x - a.x, b.y - a.y) / mph) * 60 * CITY_FACTOR });
          edgeLine.push(lineIndex);
        }
      }
      previous = id;
    }
    if (first >= 0) ends.push({ node: first, line: lineIndex });
    if (previous >= 0 && previous !== first) ends.push({ node: previous, line: lineIndex });
  });

  const links: [number, number][][] = nodes.map(() => []);
  for (const edge of edges) {
    links[edge.a]!.push([edge.b, edge.minutes]);
    links[edge.b]!.push([edge.a, edge.minutes]);
  }

  // Tile seams: a loose end lying on another line's edge is joined to that edge's two ends.
  const cell = 0.1;
  const grid = new Map<string, number[]>();
  const cellKey = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  edges.forEach((edge, edgeIndex) => {
    const a = nodes[edge.a]!;
    const b = nodes[edge.b]!;
    for (let cx = Math.floor(Math.min(a.x, b.x) / cell); cx <= Math.floor(Math.max(a.x, b.x) / cell); cx += 1) {
      for (let cy = Math.floor(Math.min(a.y, b.y) / cell); cy <= Math.floor(Math.max(a.y, b.y) / cell); cy += 1) {
        const key = `${cx},${cy}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(edgeIndex);
        else grid.set(key, [edgeIndex]);
      }
    }
  });
  for (const end of ends) {
    if (links[end.node]!.length !== 1) continue;
    const p = nodes[end.node]!;
    const candidates = grid.get(cellKey(p.x, p.y)) ?? [];
    for (const edgeIndex of candidates) {
      if (edgeLine[edgeIndex] === end.line) continue;
      const edge = edges[edgeIndex]!;
      if (edge.a === end.node || edge.b === end.node) continue;
      const a = nodes[edge.a]!;
      const b = nodes[edge.b]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (length * length);
      if (t < -0.001 || t > 1.001) continue;
      const offset = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
      if (offset > SEAM_MILES) continue;
      const perMile = edge.minutes / length;
      const toA = Math.max(0, t) * length * perMile;
      const toB = Math.max(0, 1 - t) * length * perMile;
      links[end.node]!.push([edge.a, toA], [edge.b, toB]);
      links[edge.a]!.push([end.node, toA]);
      links[edge.b]!.push([end.node, toB]);
    }
  }
  return { nodes, edges, links, origin };
}

/** A small binary heap of [minutes, node]. */
class Queue {
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

/** Minutes to each road point from the graph's origin (Infinity where it can't be reached within `limit`). */
export function driveMinutes(graph: RoadGraph, limit: number): Float64Array {
  const times = new Float64Array(graph.nodes.length).fill(Infinity);
  const queue = new Queue();
  // The visitor's spot reaches the nearest road points directly, at a slow local speed.
  const near = graph.nodes
    .map((node, id) => ({ id, miles: Math.hypot(node.x, node.y) }))
    .filter((entry) => entry.miles <= ACCESS_MAX_MILES)
    .sort((a, b) => a.miles - b.miles)
    .slice(0, ACCESS_LINKS);
  for (const entry of near) {
    const minutes = (entry.miles / ACCESS_MPH) * 60;
    if (minutes < times[entry.id]!) {
      times[entry.id] = minutes;
      queue.push([minutes, entry.id]);
    }
  }
  while (queue.size > 0) {
    const [minutes, id] = queue.pop();
    if (minutes > times[id]! || minutes > limit) continue;
    for (const [next, cost] of graph.links[id]!) {
      const reached = minutes + cost;
      if (reached < times[next]!) {
        times[next] = reached;
        queue.push([reached, next]);
      }
    }
  }
  return times;
}

/** A stretch of road reached within a band: `band` is the band's limit (10, 20…), `minutes` the time at its far end. */
export interface ReachedStretch {
  coordinates: [[number, number], [number, number]];
  band: number;
  minutes: number;
}

/**
 * The roads reached within each band's minutes (`bands` ascending, e.g. [10, 20]), cut where a band ends along a
 * road: a road is reached from either end, so a time along it is the quicker of the two ways in.
 */
export function reachedRoads(graph: RoadGraph, bands: number[]): ReachedStretch[] {
  const limit = bands[bands.length - 1] ?? 0;
  if (limit <= 0) return [];
  const times = driveMinutes(graph, limit);
  const out: ReachedStretch[] = [];
  const point = (a: Node, b: Node, s: number): [number, number] => [a.lng + (b.lng - a.lng) * s, a.lat + (b.lat - a.lat) * s];
  for (const edge of graph.edges) {
    const ta = times[edge.a]!;
    const tb = times[edge.b]!;
    if (Math.min(ta, tb) >= limit) continue;
    const w = edge.minutes;
    // Time at a fraction s along the edge: the quicker of coming from a or from b.
    const at = (s: number) => Math.min(ta + s * w, tb + (1 - s) * w);
    const cuts = new Set<number>([0, 1]);
    for (const band of bands) {
      if (Number.isFinite(ta) && w > 0) cuts.add((band - ta) / w);
      if (Number.isFinite(tb) && w > 0) cuts.add(1 - (band - tb) / w);
    }
    if (Number.isFinite(ta) && Number.isFinite(tb) && w > 0) cuts.add((tb - ta + w) / (2 * w));
    const sorted = [...cuts].filter((s) => s >= 0 && s <= 1).sort((x, y) => x - y);
    const a = graph.nodes[edge.a]!;
    const b = graph.nodes[edge.b]!;
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const s0 = sorted[i]!;
      const s1 = sorted[i + 1]!;
      if (s1 - s0 < 1e-6) continue;
      const middle = at((s0 + s1) / 2);
      const band = bands.find((limitOfBand) => middle <= limitOfBand);
      if (band === undefined) continue;
      out.push({ coordinates: [point(a, b, s0), point(a, b, s1)], band, minutes: Math.max(at(s0), at(s1)) });
    }
  }
  return out;
}
