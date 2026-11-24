import type { PlaceKind } from '@/contracts/task-map';
import type { AreaFacts, MapPlace, PlacesSource } from './types';

/**
 * OpenStreetMap's places through the Overpass API (overpass-api.de: free, keyless, fair use; the data is ODbL, credited
 * with the map). One query per area answers everything the task map shows around it: stores a kind of work may need
 * (hardware, a garden center, truck rental…), named landmarks (parks, schools, the campus), how many parking lots
 * there are, and what the homes are. Areas don't change from day to day, so an answer is kept a week, in this
 * process's memory only; points are rounded to about a kilometer so tasks in the same area share it.
 */

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const TTL_MS = 7 * 24 * 3_600_000;
const FAILURE_TTL_MS = 15 * 60_000;
const MAX_ENTRIES = 300;

/** Rounded to 0.01° (about a kilometer): the lookup's center and its cache key. */
export function lookupCenter(point: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: Math.round(point.lat * 100) / 100, lng: Math.round(point.lng * 100) / 100 };
}

/** The query: places in rings around the center (stores up to 10 miles, landmarks about 1.5), then the counts. */
export function overpassQuery(center: { lat: number; lng: number }): string {
  const at = (meters: number) => `(around:${meters},${center.lat},${center.lng})`;
  return [
    '[out:json][timeout:25];',
    '(',
    `  nwr["shop"~"^(hardware|doityourself)$"]${at(16000)};`,
    `  nwr["shop"="garden_centre"]${at(16000)};`,
    `  nwr["amenity"="car_rental"]["name"~"U-Haul|Penske|Ryder|Budget Truck",i]${at(16000)};`,
    `  nwr["shop"="storage_rental"]${at(16000)};`,
    `  nwr["amenity"="recycling"]["recycling_type"="centre"]${at(20000)};`,
    `  nwr["amenity"="waste_transfer_station"]${at(20000)};`,
    `  nwr["shop"~"^(charity|second_hand)$"]["name"]${at(16000)};`,
    `  nwr["shop"="supermarket"]["name"]${at(6000)};`,
    `  nwr["shop"~"^(electronics|computer)$"]["name"]${at(16000)};`,
    `  nwr["leisure"="park"]["name"]${at(2500)};`,
    `  nwr["amenity"~"^(school|university|college|hospital|library)$"]["name"]${at(2500)};`,
    `  nwr["shop"="mall"]["name"]${at(6000)};`,
    ');',
    'out center tags;',
    `nwr["amenity"="parking"]${at(1600)};`,
    'out count;',
    `way["building"~"^(house|detached|semidetached_house|bungalow|terrace)$"]${at(800)};`,
    'out count;',
    `way["building"~"^(apartments|dormitory)$"]${at(800)};`,
    'out count;',
    `way["building"]${at(800)};`,
    'out count;',
  ].join('\n');
}

/** Which of the task map's kinds an OpenStreetMap feature is (first match), or null. */
export function placeKindOf(tags: Record<string, string>): PlaceKind | null {
  const shop = tags.shop;
  const amenity = tags.amenity;
  if (shop === 'hardware' || shop === 'doityourself') return 'hardware';
  if (shop === 'garden_centre') return 'garden';
  if (amenity === 'car_rental') return 'truck-rental';
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
  url?: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export function createOverpassPlaces(options: OverpassOptions): PlacesSource {
  const now = options.now ?? Date.now;
  const doFetch = options.fetch ?? fetch;
  const entries = new Map<string, { expiresAt: number; value: Promise<AreaFacts | null> }>();
  const load = async (center: { lat: number; lng: number }): Promise<AreaFacts | null> => {
    try {
      const response = await doFetch(options.url ?? OVERPASS_URL, {
        method: 'POST',
        headers: { 'User-Agent': options.userAgent, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ data: overpassQuery(center) }).toString(),
        signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
        cache: 'no-store',
      });
      return response.ok ? parseOverpass(await response.json()) : null;
    } catch {
      return null;
    }
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
