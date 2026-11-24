import type { PlaceKind } from '@/contracts/task-map';

/** A named place from OpenStreetMap. */
export interface MapPlace {
  /** "osm:node/123", stable across lookups. */
  id: string;
  kind: PlaceKind;
  name: string;
  lat: number;
  lng: number;
}

/** What's around a point: named places of the kinds the task map uses, and counts that describe the area. */
export interface AreaFacts {
  places: MapPlace[];
  /** Parking lots within about a mile. */
  parkingLots: number;
  /** Buildings within half a mile: tagged as houses, as apartment buildings, and all of them. */
  houses: number;
  apartments: number;
  buildings: number;
}

export interface PlacesSource {
  name: 'overpass' | 'sample';
  /** Null when it can't answer (down, slow, refused). */
  around(point: { lat: number; lng: number }): Promise<AreaFacts | null>;
}
