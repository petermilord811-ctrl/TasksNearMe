import type { WaitlistCity } from '@/contracts';

/**
 * Where people want us next (owner, 2026-11-14: national, cities open in turn), from the waitlist and from helpers
 * who signed up outside the cities we're open in. Cities are grouped by the name people typed (tidied when saved,
 * src/shared/us-zip.ts) and their ZIP's state. A city is listed only once at least `MIN_LISTED_PEOPLE` people asked
 * for it, so a count never points at one person.
 */

export const MIN_LISTED_PEOPLE = 3;
export const COMING_NEXT_LIMIT = 6;

/** One city's count from one source: `key` is the lowercase name, `name` the most common spelling. */
export interface CityCount {
  key: string;
  state: string;
  name: string;
  count: number;
}

/** Waitlist and waiting-helper counts merged per city, most people first (ties: more helpers, then by name). */
export function rankCities(waitlist: readonly CityCount[], helpers: readonly CityCount[], limit = COMING_NEXT_LIMIT, minimum = MIN_LISTED_PEOPLE): WaitlistCity[] {
  const cities = new Map<string, WaitlistCity & { nameCount: number }>();
  const add = (row: CityCount, helper: boolean) => {
    const id = `${row.key}|${row.state}`;
    const city = cities.get(id) ?? { city: row.name, state: row.state, people: 0, helpersWaiting: 0, nameCount: 0 };
    city.people += row.count;
    if (helper) city.helpersWaiting += row.count;
    // The spelling with the most people behind it names the city.
    if (row.count > city.nameCount) {
      city.city = row.name;
      city.nameCount = row.count;
    }
    cities.set(id, city);
  };
  waitlist.forEach((row) => add(row, false));
  helpers.forEach((row) => add(row, true));
  return [...cities.values()]
    .filter((city) => city.people >= minimum)
    .sort((a, b) => b.people - a.people || b.helpersWaiting - a.helpersWaiting || a.city.localeCompare(b.city))
    .slice(0, limit)
    .map(({ city, state, people, helpersWaiting }) => ({ city, state, people, helpersWaiting }));
}
