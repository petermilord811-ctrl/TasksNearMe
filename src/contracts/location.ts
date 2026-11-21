/**
 * Location privacy is enforced by keeping two unrelated types.
 * PublicLocation is safe anywhere; ExactAddress may only be rendered by ExactAddressPanel
 * on the booking page, and the app only ever sends it to people allowed to see it.
 */

export const DISTANCE_BANDS = ['under-1-mi', 'about-1-mi', 'about-2-mi', 'about-5-mi', 'over-5-mi'] as const;
export type DistanceBand = (typeof DISTANCE_BANDS)[number];

export interface PublicLocation {
  kind: 'local';
  marketSlug: string;
  marketName: string;
  /** Neighborhood name, e.g. "Mueller"; outside the market, the city ("Waco, TX"). */
  areaName: string;
  /**
   * Outside the market's service area (owner, 2026-11-21: tasks can be posted anywhere): `areaName` is the city, shown
   * without the market's name ("Waco, TX", not "Waco, TX, Austin").
   */
  outsideMarket?: true;
  /** Deterministically fuzzed point (never the real address). */
  publicPoint: { lat: number; lng: number };
  /** Radius of the general-area circle, about one mile. */
  radiusMeters: number;
  /** Distance from the viewing helper, as a band. Absent for posters and the public. */
  distanceBand?: DistanceBand;
}

export interface RemoteLocation {
  kind: 'remote';
}

export type TaskLocation = PublicLocation | RemoteLocation;

export interface ExactAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  accessNotes?: string;
}
