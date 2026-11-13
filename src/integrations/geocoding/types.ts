/** The geocoding port's shapes, shared by the providers (`index.ts` picks one). */

export interface GeoPlace {
  placeId: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
  /** For the server only (service area, neighborhood). Never shown to people, never stored. */
  lat: number;
  lng: number;
}

export interface GeoSearchOptions {
  /** Rank places near here first (the market's center). */
  near?: { lat: number; lng: number };
  /** Only places within this many kilometers of `near`. */
  withinKm?: number;
}

export interface Geocoder {
  readonly name: string;
  /** Up to 5 matches for what someone has typed. */
  search(query: string, options?: GeoSearchOptions): Promise<GeoPlace[]>;
  /** The place behind an id from `search`, checked again; null when it isn't a real address (any more). */
  resolve(placeId: string): Promise<GeoPlace | null>;
}

/** The provider couldn't answer (network, timeout, rate limit, bad key). Nothing about the address is known. */
export class GeocoderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeocoderUnavailableError';
  }
}
