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
  openCities: number;
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
  /** Neighboring entries in the directory, for "Other states". */
  others: DirectoryState[];
}
