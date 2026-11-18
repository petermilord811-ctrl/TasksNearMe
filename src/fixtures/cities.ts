import type { CitiesPageData, DirectoryState, StateCitiesPageData } from '@/contracts';

/**
 * `/cities` and a state page (completion plan 8.7), as they stand since 2026-11-17: Gainesville opening soon (pre-launch),
 * Austin paused (so not listed, though Texans keep asking), real demand elsewhere, empty states, and a live city for the
 * "Open" status.
 */
const state = (code: string, slug: string, name: string, counts: { openCities?: number; liveCities?: number; peopleWaiting?: number } = {}): DirectoryState => ({
  code,
  slug,
  name,
  openCities: counts.openCities ?? 0,
  liveCities: counts.liveCities ?? 0,
  peopleWaiting: counts.peopleWaiting ?? 0,
});

const states: DirectoryState[] = [
  state('AL', 'alabama', 'Alabama'),
  state('CA', 'california', 'California', { peopleWaiting: 9 }),
  state('FL', 'florida', 'Florida', { openCities: 1, peopleWaiting: 14 }),
  state('GA', 'georgia', 'Georgia'),
  state('NY', 'new-york', 'New York'),
  state('TX', 'texas', 'Texas', { peopleWaiting: 21 }),
  state('WY', 'wyoming', 'Wyoming'),
];

export const citiesPageData: CitiesPageData = {
  openCities: [{ slug: 'gainesville', name: 'Gainesville', state: 'FL', status: 'prelaunch' }],
  comingNext: [
    { city: 'Austin', state: 'TX', people: 21, helpersWaiting: 4 },
    { city: 'Tampa', state: 'FL', people: 14, helpersWaiting: 2 },
    { city: 'San Diego', state: 'CA', people: 9, helpersWaiting: 0 },
  ],
  states,
};

/** Gainesville once it's live: "Open" rather than "Opening soon". */
export const citiesLivePageData: CitiesPageData = {
  ...citiesPageData,
  openCities: [{ slug: 'gainesville', name: 'Gainesville', state: 'FL', status: 'live' }],
  states: states.map((entry) => (entry.code === 'FL' ? { ...entry, liveCities: 1 } : entry)),
};

export const citiesEmptyPageData: CitiesPageData = {
  openCities: [],
  comingNext: [],
  states: states.map((entry) => ({ ...entry, openCities: 0, liveCities: 0, peopleWaiting: 0 })),
};

export const floridaCitiesPageData: StateCitiesPageData = {
  state: states[2]!,
  openCities: [{ slug: 'gainesville', name: 'Gainesville', state: 'FL', status: 'prelaunch' }],
  comingNext: [{ city: 'Tampa', state: 'FL', people: 14, helpersWaiting: 2 }],
  // Its land neighbors, then a state with people waiting.
  others: [states[0]!, states[3]!, states[5]!],
};

export const wyomingCitiesPageData: StateCitiesPageData = { state: states[6]!, openCities: [], comingNext: [], others: [states[2]!, states[5]!] };
