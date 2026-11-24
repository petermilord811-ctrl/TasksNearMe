import type { PlaceKind } from '@/contracts/task-map';
import type { AreaFacts, MapPlace, PlacesSource } from './types';

/**
 * OpenStreetMap's places through the Overpass API (free, keyless, fair use; the data is ODbL, credited with the map).
 * One query per area answers everything the task map shows around it: stores a kind of work may need (hardware, a
 * garden center, truck rental…), named landmarks (parks, schools, the campus), how many parking lots there are, and
 * what the homes are. Areas don't change from day to day, so an answer is kept a week, in this process's memory only;
 * points are rounded to about a kilometer so tasks in the same area share it.
 *
 * The public servers are often full (2026-11-24, from the live server: overpass-api.de answered "at capacity" and two
 * others never answered at all, while overpass.openstreetmap.fr took 2 s). So the query is light (boxes and exact tags,
 * no circles or patterns, which took over a minute) and each server gets a few seconds before the next is asked.
 */

/** The public servers, asked in this order: the main one first, the next when it's full or slow. */
export const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const;
/** How long one server gets before the next is asked (ms). */
const SERVER_TIMEOUT_MS = 8000;
const TTL_MS = 7 * 24 * 3_600_000;
const FAILURE_TTL_MS = 15 * 60_000;
const MAX_ENTRIES = 300;

/** Rounded to 0.01° (about a kilometer): the lookup's center and its cache key. */
export function lookupCenter(point: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: Math.round(point.lat * 100) / 100, lng: Math.round(point.lng * 100) / 100 };
}

/** A box around the center reaching `km` each way (south, west, north, east), as Overpass takes it. */
export function boxAround(center: { lat: number; lng: number }, km: number): string {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const fix = (value: number) => (Math.round(value * 10_000) / 10_000).toString();
  return `(${fix(center.lat - dLat)},${fix(center.lng - dLng)},${fix(center.lat + dLat)},${fix(center.lng + dLng)})`;
}

/**
 * The query: stores within about 5 miles (8 km; recycling and drop-off 12 km), named landmarks within 1.5 miles, then
 * the parking lots within a mile and the buildings within half a mile, counted.
 */
export function overpassQuery(center: { lat: number; lng: number }): string {
  const stores = boxAround(center, 8);
  const dropOff = boxAround(center, 12);
  const landmarks = boxAround(center, 2.5);
  const parking = boxAround(center, 1.6);
  const homes = boxAround(center, 0.8);
  const exact = (key: string, value: string, box: string, named = false) => `  nw["${key}"="${value}"]${named ? '["name"]' : ''}${box};`;
  return [
    '[out:json][timeout:25];',
    '(',
    ...['hardware', 'doityourself', 'garden_centre', 'storage_rental', 'charity', 'second_hand', 'supermarket', 'electronics', 'computer'].map((shop) => exact('shop', shop, stores)),
    exact('amenity', 'car_rental', stores),
    `  nw["amenity"="recycling"]["recycling_type"="centre"]${dropOff};`,
    exact('amenity', 'waste_transfer_station', dropOff),
    exact('leisure', 'park', landmarks, true),
    ...['school', 'university', 'college', 'hospital', 'library'].map((amenity) => exact('amenity', amenity, landmarks, true)),
    exact('shop', 'mall', landmarks, true),
    ');',
    'out center tags;',
    `nw["amenity"="parking"]${parking};`,
    'out count;',
    `way["building"~"^(house|detached|semidetached_house|bungalow|terrace)$"]${homes};`,
    'out count;',
    `way["building"~"^(apartments|dormitory)$"]${homes};`,
    'out count;',
    `way["building"]${homes};`,
    'out count;',
  ].join('\n');
}

/** Which of the task map's kinds an OpenStreetMap feature is (first match), or null. */
export function placeKindOf(tags: Record<string, string>): PlaceKind | null {
  const shop = tags.shop;
  const amenity = tags.amenity;
  if (shop === 'hardware' || shop === 'doityourself') return 'hardware';
  if (shop === 'garden_centre') return 'garden';
  // Car rentals count only when they rent trucks (U-Haul, Penske, Ryder, Budget Truck).
  if (amenity === 'car_rental') return /u-?haul|penske|ryder|budget truck|truck/i.test(`${tags.name ?? ''} ${tags.brand ?? ''}`) ? 'truck-rental' : null;
  if (shop === 'storage_rental') return 'storage';
  if (amenity === 'recycling' || amenity === 'waste_transfer_station') return 'recycling';
  if (shop === 'charity' || shop === 'second_hand') return 'donation';
  if (shop === 'supermarket') return 'supermarket';
  if (shop === 'electronics' || shop === 'computer') return 'electronics';
  if (shop === 'mall') return 'mall';
  if (tags.leisure === 'park') return 'park';
  if (amenity === 'university' || amenity === 'college') return 'university';
  if (amenity === 'school') return 'school';
  if (amenity === 'hospital') return 'hospital';
  if (amenity === 'library') return 'library';
  return null;
}

/** A recycling center or transfer station without a name still helps ("Recycling center"); other kinds need one. */
const UNNAMED_OK = new Set<PlaceKind>(['recycling']);

export function parseOverpass(body: unknown): AreaFacts | null {
  const elements = (body as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) return null;
  const places: MapPlace[] = [];
  const counts: number[] = [];
  const seen = new Set<string>();
  for (const element of elements as Record<string, unknown>[]) {
    if (element.type === 'count') {
      const total = Number((element.tags as Record<string, string> | undefined)?.total ?? 0);
      counts.push(Number.isFinite(total) ? total : 0);
      continue;
    }
    const tags = (element.tags ?? {}) as Record<string, string>;
    const kind = placeKindOf(tags);
    if (!kind) continue;
    const center = (element.center ?? element) as { lat?: unknown; lon?: unknown };
    const lat = typeof center.lat === 'number' ? center.lat : Number.NaN;
    const lng = typeof center.lon === 'number' ? center.lon : Number.NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const name = (tags.name ?? '').trim();
    if (!name && !UNNAMED_OK.has(kind)) continue;
    const id = `osm:${String(element.type)}/${String(element.id)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    places.push({ id, kind, name, lat, lng });
  }
  return { places, parkingLots: counts[0] ?? 0, houses: counts[1] ?? 0, apartments: counts[2] ?? 0, buildings: counts[3] ?? 0 };
}

export interface OverpassOptions {
  userAgent: string;
  /** The servers to ask, in order (tests); OVERPASS_URLS by default. */
  urls?: readonly string[];
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export function createOverpassPlaces(options: OverpassOptions): PlacesSource {
  const now = options.now ?? Date.now;
  const doFetch = options.fetch ?? fetch;
  const entries = new Map<string, { expiresAt: number; value: Promise<AreaFacts | null> }>();
  const ask = async (url: string, center: { lat: number; lng: number }): Promise<AreaFacts | null> => {
    try {
      const response = await doFetch(url, {
        method: 'POST',
        headers: { 'User-Agent': options.userAgent, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ data: overpassQuery(center) }).toString(),
        signal: AbortSignal.timeout(options.timeoutMs ?? SERVER_TIMEOUT_MS),
        cache: 'no-store',
      });
      return response.ok ? parseOverpass(await response.json()) : null;
    } catch {
      return null;
    }
  };
  // The first server that answers with places wins; a full, slow or broken one hands over to the next.
  const load = async (center: { lat: number; lng: number }): Promise<AreaFacts | null> => {
    for (const url of options.urls ?? OVERPASS_URLS) {
      const facts = await ask(url, center);
      if (facts) return facts;
    }
    return null;
  };
  return {
    name: 'overpass',
    around(point) {
      const center = lookupCenter(point);
      const key = `${center.lat},${center.lng}`;
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now()) return hit.value;
      const value = load(center);
      const entry = { expiresAt: now() + FAILURE_TTL_MS, value };
      entries.set(key, entry);
      void value.then((facts) => {
        if (entries.get(key) === entry) entry.expiresAt = now() + (facts ? TTL_MS : FAILURE_TTL_MS);
      });
      if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
      return value;
    },
  };
}
