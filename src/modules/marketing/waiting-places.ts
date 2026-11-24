import 'server-only';
import { and, count, eq, isNotNull } from 'drizzle-orm';
import type { WaitingPlace } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { markets } from '@/modules/markets/schema';
import { zipPoint } from '@/modules/markets/zip-points';
import { helperProfiles } from '@/modules/profiles/schema';
import type { Db } from '@/platform/db/connect';
import type { LatLng } from '@/shared/geo';
import { rowScopeCondition, type RowScope } from '@/shared/sample-data';
import { normalizeZip } from '@/shared/us-zip';
import { MIN_LISTED_PEOPLE } from './demand';
import { waitlistEntries } from './schema';

/**
 * Places people are waiting for, for the landing map (owner, 2026-11-24: "Now I am in Austin, but you still show
 * Gainesville"): a visitor whose location falls in a city we haven't opened is told so, by the city's name, with how
 * many people there are waiting. The visitor's location never comes here: the list goes to the page, and the device
 * finds the place near it.
 *
 * A paused city (a market not open, like Austin since 2026-11-17) is always a place, at its center. Elsewhere, people
 * on the waitlist and helpers waiting outside every market are grouped by their ZIP's first three digits (about one
 * metro area), at the middle of their ZIPs (public Census centers, zip-points.ts), named after the city most of them
 * typed. Counts only, never anyone's ZIP: a group of fewer than `MIN_LISTED_PEOPLE` people isn't a place (as on the
 * waitlist page's "coming next"), and a paused city's count shows only from that many too.
 */

export interface ZipCount {
  zip: string;
  city: string | null;
  state: string | null;
  count: number;
}

export interface PausedMarket {
  id: string;
  name: string;
  state: string;
  center: LatLng;
  zipPrefixes: readonly string[];
}

/** Groups people waiting (by ZIP) into places: pure, so it's tested without a database. */
export function groupWaitingPlaces(input: { paused: readonly PausedMarket[]; covered: readonly string[]; counts: readonly ZipCount[]; pointOf: (zip: string) => LatLng | null }): WaitingPlace[] {
  const covered = new Set(input.covered);
  const pausedByPrefix = new Map<string, PausedMarket>();
  for (const market of input.paused) for (const prefix of market.zipPrefixes) pausedByPrefix.set(prefix, market);
  const pausedCount = new Map<string, number>();
  const groups = new Map<string, { people: number; lat: number; lng: number; located: number; names: Map<string, number>; states: Map<string, number> }>();
  for (const row of input.counts) {
    const zip = normalizeZip(row.zip);
    const prefix = zip?.slice(0, 3);
    if (row.count <= 0 || !zip || !prefix || covered.has(prefix)) continue;
    const paused = pausedByPrefix.get(prefix);
    if (paused) {
      pausedCount.set(paused.id, (pausedCount.get(paused.id) ?? 0) + row.count);
      continue;
    }
    const group = groups.get(prefix) ?? { people: 0, lat: 0, lng: 0, located: 0, names: new Map<string, number>(), states: new Map<string, number>() };
    group.people += row.count;
    const point = input.pointOf(zip);
    if (point) {
      group.lat += point.lat * row.count;
      group.lng += point.lng * row.count;
      group.located += row.count;
    }
    const name = row.city?.trim();
    if (name) group.names.set(name, (group.names.get(name) ?? 0) + row.count);
    if (row.state) group.states.set(row.state, (group.states.get(row.state) ?? 0) + row.count);
    groups.set(prefix, group);
  }
  const most = (votes: Map<string, number>) => [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const places: WaitingPlace[] = input.paused.map((market) => {
    const people = pausedCount.get(market.id) ?? 0;
    return { name: market.name, state: market.state, point: market.center, waiting: people >= MIN_LISTED_PEOPLE ? people : 0 };
  });
  for (const group of groups.values()) {
    const name = most(group.names);
    const state = most(group.states);
    if (group.people < MIN_LISTED_PEOPLE || group.located === 0 || !name || !state) continue;
    places.push({ name, state, point: { lat: Math.round((group.lat / group.located) * 1000) / 1000, lng: Math.round((group.lng / group.located) * 1000) / 1000 }, waiting: group.people });
  }
  return places.sort((a, b) => b.waiting - a.waiting || a.name.localeCompare(b.name));
}

/**
 * The places people are waiting for, now: paused markets (the demo marketplace's only for testers) and the waitlist's
 * and waiting helpers' metro areas outside every open market. `rows: 'real'` counts only real helpers (waitlist
 * entries are always real).
 */
export async function loadWaitingPlaces(db: Db, rows: RowScope): Promise<WaitingPlace[]> {
  const [marketRows, entryRows, helperRows] = await Promise.all([
    db.select({ id: markets.id, name: markets.name, state: markets.state, status: markets.status, lat: markets.centerLat, lng: markets.centerLng, zipPrefixes: markets.zipPrefixes }).from(markets),
    db
      .select({ zip: waitlistEntries.zip, city: waitlistEntries.city, state: waitlistEntries.state, count: count() })
      .from(waitlistEntries)
      .groupBy(waitlistEntries.zip, waitlistEntries.city, waitlistEntries.state),
    db
      .select({ zip: helperProfiles.homeZip, city: helperProfiles.homeCity, state: helperProfiles.homeState, count: count() })
      .from(helperProfiles)
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .where(and(isNotNull(helperProfiles.homeZip), eq(users.status, 'active'), rowScopeCondition(rows, users.id)))
      .groupBy(helperProfiles.homeZip, helperProfiles.homeCity, helperProfiles.homeState),
  ]);
  const visible = marketRows.filter((row) => rows === 'all' || !row.id.startsWith('mkt_demo_'));
  const covered = visible.filter((row) => row.status === 'live' || row.status === 'prelaunch').flatMap((row) => row.zipPrefixes);
  const paused = visible.filter((row) => row.status === 'paused').map((row) => ({ id: row.id, name: row.name, state: row.state, center: { lat: row.lat, lng: row.lng }, zipPrefixes: row.zipPrefixes }));
  const counts: ZipCount[] = [...entryRows, ...helperRows].flatMap((row) => {
    const zip = row.zip ? normalizeZip(row.zip) : null;
    return zip ? [{ zip, city: row.city, state: row.state, count: Number(row.count) }] : [];
  });
  const points = new Map<string, LatLng | null>();
  await Promise.all([...new Set(counts.map((row) => row.zip))].map(async (zip) => points.set(zip, await zipPoint(zip))));
  return groupWaitingPlaces({ paused, covered, counts, pointOf: (zip) => points.get(zip) ?? null });
}
