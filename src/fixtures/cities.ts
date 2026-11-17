import type { CitiesPageData, DirectoryState, StateCitiesPageData } from '@/contracts';

/** `/cities` and a state page (completion plan 8.7): one city open, real demand elsewhere, empty states. */
const state = (code: string, slug: string, name: string, openCities = 0, peopleWaiting = 0): DirectoryState => ({ code, slug, name, openCities, peopleWaiting });

const states: DirectoryState[] = [
  state('AL', 'alabama', 'Alabama'),
  state('CA', 'california', 'California', 0, 9),
  state('FL', 'florida', 'Florida', 0, 14),
  state('NY', 'new-york', 'New York'),
  state('TX', 'texas', 'Texas', 1, 21),
  state('WY', 'wyoming', 'Wyoming'),
];

export const citiesPageData: CitiesPageData = {
  openCities: [{ slug: 'austin', name: 'Austin', state: 'TX', status: 'prelaunch' }],
  comingNext: [
    { city: 'Dallas', state: 'TX', people: 21, helpersWaiting: 4 },
    { city: 'Gainesville', state: 'FL', people: 14, helpersWaiting: 2 },
    { city: 'San Diego', state: 'CA', people: 9, helpersWaiting: 0 },
  ],
  states,
};

export const citiesEmptyPageData: CitiesPageData = { openCities: [], comingNext: [], states: states.map((entry) => ({ ...entry, openCities: 0, peopleWaiting: 0 })) };

export const floridaCitiesPageData: StateCitiesPageData = {
  state: states[2]!,
  openCities: [],
  comingNext: [{ city: 'Gainesville', state: 'FL', people: 14, helpersWaiting: 2 }],
  others: [states[4]!, states[1]!],
};

export const wyomingCitiesPageData: StateCitiesPageData = { state: states[5]!, openCities: [], comingNext: [], others: [states[4]!, states[0]!] };
