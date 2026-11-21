import 'server-only';
import { and, inArray, sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import type { CitiesPageData, DirectoryState, OpenCity, StateCitiesPageData, WaitlistCity } from '@/contracts';
import { markets } from '@/modules/markets/schema';
import { db } from '@/platform/db/client';
import type { RowScope } from '@/shared/sample-data';
import { DIRECTORY_STATES, STATE_NEIGHBORS, type DirectoryStateCode } from '@/shared/us-states';
import { citiesComingNext, WAITLIST_TAG } from './waitlist';

/**
 * `/cities` and `/cities/<state>` (completion plan 8.7), from real data only: the markets we serve (live or
 * pre-launch; paused ones are invisible) and the cities people asked for (waitlist entries and waiting helpers,
 * through the waitlist's own ranking, which never lists a city below its minimum of people). `rows` is the public
 * view (`searchEngineRows()`), the same for every visitor, so the pages stay cacheable.
 */
const OPEN_STATUSES = ['live', 'prelaunch'] as const;
/** Every city with demand, not the waitlist page's top few. */
const ALL_CITIES = 10_000;

interface Directory {
  openCities: OpenCity[];
  comingNext: WaitlistCity[];
}

/**
 * The directory straight from the database. Outside a request (the IndexNow job, through the sitemap's entries) there's
 * no cache to call `cacheLife()` in: it throws, and the live site's seo.indexnow failed on every run until the sitemap
 * read this instead of loadDirectory (2026-11-21).
 */
async function readDirectory(rows: RowScope): Promise<Directory> {
  const open = await db
    .select({ slug: markets.slug, name: markets.name, state: markets.state, status: markets.status, zipPrefixes: markets.zipPrefixes })
    .from(markets)
    // The demo marketplace's cities (`mkt_demo_<key>`) aren't real: the public view never lists them.
    .where(and(inArray(markets.status, [...OPEN_STATUSES]), rows === 'real' ? sql`${markets.id} not like 'mkt\_demo\_%'` : undefined));
  const comingNext = await citiesComingNext(db, open.flatMap((market) => market.zipPrefixes), ALL_CITIES, rows);
  return {
    openCities: open
      .map(({ slug, name, state, status }) => ({ slug, name, state, status: status as OpenCity['status'] }))
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'live' ? -1 : 1)),
    comingNext,
  };
}

/** The directory for pages: cached for an hour, and refreshed when markets or the waitlist change. */
async function loadDirectory(rows: RowScope): Promise<Directory> {
  'use cache';
  cacheLife('hours');
  cacheTag('markets', WAITLIST_TAG);
  return readDirectory(rows);
}

/** The directory's entry for each state, by name in the page's language. */
function directoryStates(directory: Directory, nameOf: (code: DirectoryStateCode) => string, locale: string): DirectoryState[] {
  return DIRECTORY_STATES.map(([code, slug]) => ({
    code,
    slug,
    name: nameOf(code),
    openCities: directory.openCities.filter((city) => city.state === code).length,
    liveCities: directory.openCities.filter((city) => city.state === code && city.status === 'live').length,
    peopleWaiting: directory.comingNext.filter((city) => city.state === code).reduce((sum, city) => sum + city.people, 0),
  })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

export async function getCitiesPageData(rows: RowScope, nameOf: (code: DirectoryStateCode) => string, locale: string): Promise<CitiesPageData> {
  const directory = await loadDirectory(rows);
  return { openCities: directory.openCities, comingNext: directory.comingNext.slice(0, 12), states: directoryStates(directory, nameOf, locale) };
}

export async function getStateCitiesPageData(
  code: DirectoryStateCode,
  rows: RowScope,
  nameOf: (code: DirectoryStateCode) => string,
  locale: string,
): Promise<StateCitiesPageData> {
  const directory = await loadDirectory(rows);
  const states = directoryStates(directory, nameOf, locale);
  return {
    state: states.find((state) => state.code === code)!,
    openCities: directory.openCities.filter((city) => city.state === code),
    comingNext: directory.comingNext.filter((city) => city.state === code),
    // States with a city first, then the land neighbors (not the alphabet's: Florida listed DC, audit L26), then those
    // with people waiting, so every state page links on to somewhere that means something.
    others: [
      ...states.filter((state) => state.code !== code && state.openCities > 0),
      ...STATE_NEIGHBORS[code].map((neighbor) => states.find((state) => state.code === neighbor)!),
      ...states.filter((state) => state.code !== code && state.peopleWaiting > 0),
    ].filter((state, index, all) => all.findIndex((other) => other.code === state.code) === index).slice(0, 8),
  };
}

/**
 * For the sitemap: each state's slug and whether it has something real to show. Straight from the database, since the
 * IndexNow job reads the sitemap outside a request; the sitemap route caches its whole result (getSitemap).
 */
export async function listDirectoryStates(rows: RowScope): Promise<Array<{ slug: string; openCities: number; peopleWaiting: number }>> {
  const directory = await readDirectory(rows);
  return directoryStates(directory, (code) => code, 'en').map(({ slug, openCities, peopleWaiting }) => ({ slug, openCities, peopleWaiting }));
}
