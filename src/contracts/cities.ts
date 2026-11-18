import type { WaitlistCity } from './marketing';

/**
 * `/cities` and `/cities/<state>` (completion plan 8.7): where TasksNearMe is open and where it goes next, from real
 * data only (markets, waitlist entries, helpers waiting for their city). Names arrive in the page's language.
 */

/** A city we serve: its market is live, or pre-launch (taking invited bookings). */
export interface OpenCity {
  slug: string;
  name: string;
  /** Two-letter state code. */
  state: string;
  status: 'live' | 'prelaunch';
}

/** One state in the directory, with what it has today. */
export interface DirectoryState {
  code: string;
  slug: string;
  name: string;
  /** Cities we serve in the state, live or pre-launch. */
  openCities: number;
  /**
   * How many of those are live: the rest are "Opening soon". One vocabulary everywhere (audit H8, 2026-11-18): Open
   * (live), Opening soon (pre-launch), Not yet.
   */
  liveCities: number;
  /** Waitlist entries plus waiting helpers in the state's cities. */
  peopleWaiting: number;
}

export interface CitiesPageData {
  openCities: OpenCity[];
  /** Cities people asked for, most first (the waitlist page's "coming next"). */
  comingNext: WaitlistCity[];
  /** All 50 states and DC, by name in the page's language. */
  states: DirectoryState[];
}

export interface StateCitiesPageData {
  state: DirectoryState;
  openCities: OpenCity[];
  /** The state's cities people asked for, most first. */
  comingNext: WaitlistCity[];
  /** "Other states": those with a city first, then the state's land neighbors, then those with people waiting. */
  others: DirectoryState[];
}
