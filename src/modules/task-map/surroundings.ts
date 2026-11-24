import type { CategorySlug, MapPoint, PlaceKind, TaskPlace, TaskSurroundings } from '@/contracts';
import type { AreaFacts } from '@/integrations/places/types';
import { distanceMiles } from '@/shared/geo';

/**
 * What's around a task's area (pure; the places come from `src/integrations/places`): named landmarks that say where
 * it is, the stores this kind of work may need (the nearest of each kind), the parking lots, and what the homes are.
 * Measured from the area's public point, never the address.
 */

/** The stores a kind of work may need, in the order they're listed. */
export const HELPFUL_KINDS: Readonly<Record<CategorySlug, readonly PlaceKind[]>> = {
  'furniture-assembly': ['hardware'],
  'moving-help': ['truck-rental', 'storage', 'donation', 'recycling'],
  'yard-cleanup': ['garden', 'recycling', 'hardware'],
  'light-cleaning': ['supermarket', 'hardware'],
  'computer-help': ['electronics'],
};

export const LANDMARK_KINDS: readonly PlaceKind[] = ['park', 'school', 'university', 'hospital', 'library', 'mall'];

/** Landmarks this close say where the area is; farther ones don't help. */
export const LANDMARK_MILES = 1.5;
/** A store farther than this isn't on the way. */
export const HELPFUL_MILES = 12;
const MAX_LANDMARKS = 3;
/** The homes are described only when this many buildings have a kind. */
const MIN_TYPED_BUILDINGS = 25;

function homesOf(facts: AreaFacts): 'houses' | 'apartments' | 'mixed' | undefined {
  const typed = facts.houses + facts.apartments;
  if (typed < MIN_TYPED_BUILDINGS || typed < facts.buildings * 0.3) return undefined;
  const share = facts.apartments / typed;
  return share < 0.15 ? 'houses' : share > 0.6 ? 'apartments' : 'mixed';
}

export function surroundingsFrom(facts: AreaFacts | null, point: MapPoint, category: CategorySlug, source: 'osm' | 'sample'): TaskSurroundings {
  if (!facts) return { status: 'unavailable' };
  const places: TaskPlace[] = facts.places
    .map((place) => ({ id: place.id, kind: place.kind, name: place.name, point: { lat: place.lat, lng: place.lng }, miles: Math.round(distanceMiles(point, { lat: place.lat, lng: place.lng }) * 10) / 10 }))
    .sort((a, b) => a.miles - b.miles);

  // Landmarks: the nearest named ones, one per name, no more than two of a kind.
  const landmarks: TaskPlace[] = [];
  const names = new Set<string>();
  const perKind = new Map<PlaceKind, number>();
  for (const place of places) {
    if (landmarks.length >= MAX_LANDMARKS) break;
    if (!LANDMARK_KINDS.includes(place.kind) || !place.name || place.miles > LANDMARK_MILES) continue;
    const key = place.name.toLowerCase();
    if (names.has(key) || (perKind.get(place.kind) ?? 0) >= 2) continue;
    names.add(key);
    perKind.set(place.kind, (perKind.get(place.kind) ?? 0) + 1);
    landmarks.push(place);
  }

  // The nearest of each kind this work may need, in the category's order.
  const helpful: TaskPlace[] = [];
  for (const kind of HELPFUL_KINDS[category]) {
    const nearest = places.find((place) => place.kind === kind && place.miles <= HELPFUL_MILES);
    if (nearest) helpful.push(nearest);
  }

  const homes = homesOf(facts);
  return { status: 'found', landmarks, helpful, parkingLots: facts.parkingLots, ...(homes ? { homes } : {}), source };
}
