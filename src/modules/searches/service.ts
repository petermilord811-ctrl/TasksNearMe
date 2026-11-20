import { and, asc, count, eq, gte, inArray, isNull, lt, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import {
  FIND_WORK_DISTANCES,
  INSTANT_ALERTS_PER_DAY,
  SAVED_SEARCH_ALERTS,
  SAVED_SEARCH_MAX,
  routes,
  savedSearchInputSchema,
  savedSearchUpdateInputSchema,
  type ActionResult,
  type EditSavedSearchPageData,
  type FindWorkDistance,
  type NewSavedSearchPageData,
  type SavedSearchAlert,
  type SavedSearchesPageData,
  type SavedSearchFilters,
  type SavedSearchInput,
  type SavedSearchSource,
  type SavedSearchUpdateInput,
  type TaskBoardQuery,
  type TaskBoardQueryState,
} from '@/contracts';
import { CATEGORY_SLUGS, type TimeZone } from '@/contracts/common';
import { users } from '@/modules/accounts/schema';
import { milesBetween } from '@/modules/community/domain';
import { areas, categories, markets } from '@/modules/markets/schema';
import { marketTimeZone } from '@/modules/markets/time-zone';
import { notifications } from '@/modules/notifications/schema';
import { maxMilesOf } from '@/modules/offers/helper-domain';
import { helperProfiles } from '@/modules/profiles/schema';
import { parseTaskBoardQuery } from '@/modules/tasks/projections';
import { boardConditions, findTaskWithPublicView, listBoardTasks, listFeedTasks, milesFrom } from '@/modules/tasks/queries';
import { tasks } from '@/modules/tasks/schema';
import { blockedPeopleOf, isBlockedBetween } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';
import { taskMatchesBoard } from '@/shared/board-match';
import { splitLocalePath } from '@/shared/locale';
import { isTaskType, taskTypesFor } from '@/shared/task-types';
import { savedSearches } from './schema';

/**
 * Saved searches and their alerts (completion plan 7.10). A saved search is a board address (its market, its category
 * from the hub's path and its filters from the query), or a find work address (the helper's market, the same filters
 * and a distance from the helper's area, sweep SS5). Instant alerts ride the dispatcher's `task.posted` event
 * (src/modules/notifications/service.ts reads `instantSearchMatches`), capped per person per day; the morning digest is
 * a job (`runSavedSearchDigests`).
 */

const BOARD_PATH = /^\/([a-z0-9-]{1,60})\/tasks(?:\/([a-z-]{1,40}))?\/?$/;
const FIND_WORK_PATH = /^\/app\/find-work\/?$/;
/** Not filters: how a page is laid out, sorted, paged, or narrowed to the helper's own saved tasks. */
const NOT_FILTERS = new Set(['page', 'view', 'group', 'sort', 'saved']);

type ParsedAddress = { source: SavedSearchSource; marketSlug?: string; params: Record<string, string>; query: TaskBoardQueryState };
/** The board's filters, without how a page is sorted, paged or laid out. */
type BoardFilterQuery = Omit<TaskBoardQuery, 'sort' | 'page' | 'view' | 'group'>;

function addressOf(from: string): URL | null {
  try {
    const url = new URL(from, 'https://board.invalid');
    return url.origin === 'https://board.invalid' ? url : null;
  } catch {
    return null;
  }
}

function filterParams(url: URL, keep: (key: string) => boolean): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of url.searchParams) if (!NOT_FILTERS.has(key) && keep(key)) params[key] = value;
  return params;
}

/** A board address (`/austin/tasks/moving-help?area=mueller`, Spanish `/es/...` too) → its market and filters. */
export function parseBoardAddress(from: string): { marketSlug: string; params: Record<string, string>; query: TaskBoardQueryState } | null {
  const url = addressOf(from);
  if (!url) return null;
  const path = splitLocalePath(url.pathname)?.path ?? url.pathname;
  const match = BOARD_PATH.exec(path);
  if (!match) return null;
  // `distance` is find work's own: a board view has none.
  const params = filterParams(url, (key) => key !== 'distance');
  const category = match[2];
  if (category) {
    if (!(CATEGORY_SLUGS as readonly string[]).includes(category)) return null;
    params.category = category;
  }
  return { marketSlug: match[1]!, params, query: parseTaskBoardQuery(params) };
}

/** A find work address (`/app/find-work?category=…&distance=within_5_mi`, Spanish too) → its filters (sweep SS5). */
export function parseFindWorkAddress(from: string): { params: Record<string, string>; query: TaskBoardQueryState; distance: FindWorkDistance } | null {
  const url = addressOf(from);
  if (!url) return null;
  const path = splitLocalePath(url.pathname)?.path ?? url.pathname;
  if (!FIND_WORK_PATH.test(path)) return null;
  const params = filterParams(url, () => true);
  const distance = distanceOf(params);
  if (distance === 'any') delete params.distance;
  return { params, query: parseTaskBoardQuery(params), distance };
}

/** Either kind of address a search is saved from. */
export function parseSavedSearchAddress(from: string): ParsedAddress | null {
  const board = parseBoardAddress(from);
  if (board) return { source: 'board', ...board };
  const work = parseFindWorkAddress(from);
  return work ? { source: 'find_work', params: work.params, query: work.query } : null;
}

const distanceOf = (params: Record<string, string>): FindWorkDistance =>
  (FIND_WORK_DISTANCES as readonly string[]).includes(params.distance ?? '') ? (params.distance as FindWorkDistance) : 'any';

function filtersOf(query: TaskBoardQueryState, areaNames: ReadonlyMap<string, string>, distance: FindWorkDistance = 'any'): SavedSearchFilters {
  return {
    ...(query.category ? { category: query.category } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.q ? { q: query.q } : {}),
    ...(query.minPrice !== undefined ? { minPrice: query.minPrice } : {}),
    ...(query.maxPrice !== undefined ? { maxPrice: query.maxPrice } : {}),
    ...(query.pricing ? { pricing: query.pricing } : {}),
    when: query.when,
    times: query.times,
    ...(query.posted ? { posted: query.posted } : {}),
    remoteOnly: query.remoteOnly,
    few: query.few,
    areaNames: query.areas.map((slug) => areaNames.get(slug) ?? slug),
    ...(distance !== 'any' ? { distance } : {}),
  };
}

/** The board filters as a query for links (the board's own normal form). */
function boardQueryOf(query: TaskBoardQueryState): BoardFilterQuery {
  const { sort: _sort, page: _page, view: _view, group: _group, ...filters } = query;
  return filters;
}

/** Where a saved search opens: its board view, or find work with its filters and distance. */
function hrefOf(source: string, marketSlug: string, params: Record<string, string>): string {
  const query = boardQueryOf(parseTaskBoardQuery(params));
  return source === 'find_work' ? routes.app.findWork({ ...query, distance: distanceOf(params) }) : routes.taskBoard(marketSlug, query);
}

async function marketBySlug(db: Db, slug: string) {
  const [market] = await db.select({ id: markets.id, slug: markets.slug, name: markets.name }).from(markets).where(eq(markets.slug, slug)).limit(1);
  return market ?? null;
}

/** Find work's market for this person: their helper area's, else their home market (as find work reads it). */
async function findWorkMarket(db: Db, userId: string) {
  const [row] = await db
    .select({ areaMarketId: areas.marketId, homeMarketId: users.homeMarketId })
    .from(users)
    .leftJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .leftJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(eq(users.id, userId))
    .limit(1);
  const marketId = row?.areaMarketId ?? row?.homeMarketId;
  if (!marketId) return null;
  const [market] = await db.select({ id: markets.id, slug: markets.slug, name: markets.name }).from(markets).where(eq(markets.id, marketId)).limit(1);
  return market ?? null;
}

/** The address's market: the board's own, or find work's for this person. */
async function marketFor(db: Db, userId: string, address: ParsedAddress) {
  return address.source === 'board' ? marketBySlug(db, address.marketSlug!) : findWorkMarket(db, userId);
}

async function areaMaps(db: Db, marketId: string) {
  const rows = await db.select({ id: areas.id, slug: areas.slug, name: areas.name }).from(areas).where(eq(areas.marketId, marketId)).orderBy(asc(areas.name));
  return { ids: new Map(rows.map((row) => [row.slug, row.id])), names: new Map(rows.map((row) => [row.slug, row.name])), list: rows };
}

/** The center of the person's helper area: find work's distances are measured from it (null when they have none). */
async function helperCenters(db: Db, userIds: string[]): Promise<Map<string, { lat: number; lng: number }>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: helperProfiles.userId, lat: areas.centerLat, lng: areas.centerLng })
    .from(helperProfiles)
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(inArray(helperProfiles.userId, userIds));
  return new Map(rows.map((row) => [row.userId, { lat: row.lat, lng: row.lng }]));
}

/** Open tasks a saved search shows now: the board's count, or find work's (without the person's own and blocked posters', within the distance). */
async function openCountOf(db: Db, row: typeof savedSearches.$inferSelect, ids: ReadonlyMap<string, string>, now: Date): Promise<number> {
  const query = parseTaskBoardQuery(row.params);
  if (row.source !== 'find_work') return (await listBoardTasks(db, { marketId: row.marketId, query: { ...query, group: 'none' }, now, areaIds: ids })).totalCount;
  const [blocked, centers] = await Promise.all([blockedPeopleOf(db, row.userId), helperCenters(db, [row.userId])]);
  const { totalCount } = await listFeedTasks(db, {
    marketId: row.marketId,
    query: { ...boardQueryOf(query), areas: query.areas, times: query.times, few: query.few, when: query.when, remoteOnly: query.remoteOnly, sort: 'soonest', page: 1, distance: distanceOf(row.params), saved: false, view: 'list' },
    now,
    excludePosterIds: [row.userId, ...blocked],
    center: centers.get(row.userId) ?? null,
    maxMiles: maxMilesOf(distanceOf(row.params)),
    viewerId: row.userId,
    limit: 1,
  });
  return totalCount;
}

export async function getNewSavedSearchPage(db: Db, userId: string, from: string): Promise<NewSavedSearchPageData | null> {
  const parsed = parseSavedSearchAddress(from);
  if (!parsed) return null;
  const market = await marketFor(db, userId, parsed);
  if (!market) return null;
  const [maps, [mine]] = await Promise.all([areaMaps(db, market.id), db.select({ value: count() }).from(savedSearches).where(eq(savedSearches.userId, userId))]);
  return { from, source: parsed.source, marketName: market.name, filters: filtersOf(parsed.query, maps.names, distanceOf(parsed.params)), full: Number(mine?.value ?? 0) >= SAVED_SEARCH_MAX };
}

export async function getSavedSearchesPage(db: Db, userId: string, now: Date): Promise<SavedSearchesPageData> {
  const rows = await db.select().from(savedSearches).where(eq(savedSearches.userId, userId)).orderBy(asc(savedSearches.createdAt));
  const marketRows = rows.length ? await db.select({ id: markets.id, slug: markets.slug, name: markets.name }).from(markets).where(inArray(markets.id, [...new Set(rows.map((row) => row.marketId))])) : [];
  const marketOf = new Map(marketRows.map((market) => [market.id, market]));
  const mapsOf = new Map<string, Awaited<ReturnType<typeof areaMaps>>>();
  for (const market of marketRows) mapsOf.set(market.id, await areaMaps(db, market.id));
  const searches = await Promise.all(rows.map(async (row) => {
    const market = marketOf.get(row.marketId)!;
    const maps = mapsOf.get(row.marketId)!;
    const query = parseTaskBoardQuery(row.params);
    return {
      id: row.id,
      name: row.name,
      source: (row.source === 'find_work' ? 'find_work' : 'board') as SavedSearchSource,
      href: hrefOf(row.source, market.slug, row.params),
      marketName: market.name,
      filters: filtersOf(query, maps.names, distanceOf(row.params)),
      alert: row.alert as SavedSearchAlert,
      openCount: await openCountOf(db, row, maps.ids, now),
      createdAt: row.createdAt.toISOString(),
    };
  }));
  return { searches, max: SAVED_SEARCH_MAX };
}

/** Where a saved search opens: its board or find work view, now. */
export async function savedSearchHref(db: Db, userId: string, id: string): Promise<string | null> {
  const [row] = await db.select({ params: savedSearches.params, marketId: savedSearches.marketId, source: savedSearches.source }).from(savedSearches).where(and(eq(savedSearches.id, String(id)), eq(savedSearches.userId, userId))).limit(1);
  if (!row) return null;
  const [market] = await db.select({ slug: markets.slug }).from(markets).where(eq(markets.id, row.marketId)).limit(1);
  return market ? hrefOf(row.source, market.slug, row.params) : null;
}

export async function createSavedSearch(db: Db, userId: string, input: SavedSearchInput, now: Date): Promise<ActionResult> {
  const parsed = savedSearchInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const address = parseSavedSearchAddress(parsed.data.from);
  const market = address ? await marketFor(db, userId, address) : null;
  if (!address || !market) return { ok: false, code: 'validation_failed', fieldErrors: { from: ['invalid'] } };
  const [mine] = await db.select({ value: count() }).from(savedSearches).where(eq(savedSearches.userId, userId));
  if (Number(mine?.value ?? 0) >= SAVED_SEARCH_MAX) return { ok: false, code: 'limit_reached' };
  await db.insert(savedSearches).values({ id: newId('ssr'), userId, marketId: market.id, name: parsed.data.name, source: address.source, params: address.params, alert: parsed.data.alert, lastDigestAt: now, createdAt: now, updatedAt: now });
  return { ok: true, code: 'saved', redirectTo: routes.app.savedSearches() };
}

/** `routes.app.editSavedSearch(id)`: the search's name, alerts and filters, with the market's options (sweep SS5). */
export async function getEditSavedSearchPage(db: Db, userId: string, id: string, now: Date): Promise<EditSavedSearchPageData | null> {
  const [row] = await db.select().from(savedSearches).where(and(eq(savedSearches.id, String(id)), eq(savedSearches.userId, userId))).limit(1);
  if (!row) return null;
  const [market] = await db.select({ name: markets.name }).from(markets).where(eq(markets.id, row.marketId)).limit(1);
  if (!market) return null;
  const maps = await areaMaps(db, row.marketId);
  const query = parseTaskBoardQuery(row.params);
  const source: SavedSearchSource = row.source === 'find_work' ? 'find_work' : 'board';
  return {
    id: row.id,
    name: row.name,
    alert: row.alert as SavedSearchAlert,
    source,
    marketName: market.name,
    values: {
      ...(query.q ? { q: query.q } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.type ? { type: query.type } : {}),
      areas: query.areas.filter((slug) => maps.ids.has(slug)),
      ...(query.minPrice !== undefined ? { minPrice: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { maxPrice: query.maxPrice } : {}),
      ...(query.pricing ? { pricing: query.pricing } : {}),
      when: query.when,
      times: query.times,
      ...(query.posted ? { posted: query.posted } : {}),
      remoteOnly: query.remoteOnly,
      few: query.few,
      ...(source === 'find_work' ? { distance: distanceOf(row.params) } : {}),
    },
    options: {
      categories: CATEGORY_SLUGS.map((slug) => ({ slug, types: taskTypesFor(slug).map((type) => type.slug) })),
      areas: maps.list.map((area) => ({ slug: area.slug, name: area.name })),
    },
    openCount: await openCountOf(db, row, maps.ids, now),
  };
}

/**
 * Renames a saved search, sets its alerts and replaces its filters (sweep SS5). The filters go through the board's (or
 * find work's) own address, so an edited search stores exactly what saving that view would. A task type stays only
 * with its category; neighborhoods are the market's.
 */
export async function updateSavedSearch(db: Db, userId: string, input: SavedSearchUpdateInput, now: Date): Promise<ActionResult> {
  const parsed = savedSearchUpdateInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { id, name, alert, filters } = parsed.data;
  const [row] = await db.select().from(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId))).limit(1);
  if (!row) return { ok: false, code: 'not_found' };
  const [market] = await db.select({ slug: markets.slug }).from(markets).where(eq(markets.id, row.marketId)).limit(1);
  if (!market) return { ok: false, code: 'not_found' };
  const { ids } = await areaMaps(db, row.marketId);
  const query: BoardFilterQuery = {
    ...(filters.q ? { q: filters.q } : {}),
    // A task type belongs to its category: one left over from another category is dropped.
    ...(filters.category ? { category: filters.category, ...(filters.type && isTaskType(filters.category, filters.type) ? { type: filters.type } : {}) } : {}),
    areas: filters.areas.filter((slug) => ids.has(slug)),
    ...(filters.minPrice !== undefined && filters.minPrice > 0 ? { minPrice: filters.minPrice } : {}),
    ...(filters.maxPrice !== undefined ? { maxPrice: filters.maxPrice } : {}),
    ...(filters.pricing ? { pricing: filters.pricing } : {}),
    ...(filters.posted ? { posted: filters.posted } : {}),
    times: filters.times,
    few: filters.few,
    when: filters.when,
    remoteOnly: filters.remoteOnly,
  };
  const address = parseSavedSearchAddress(
    row.source === 'find_work' ? routes.app.findWork({ ...query, distance: filters.distance ?? 'any' }) : routes.taskBoard(market.slug, query),
  );
  if (!address) return { ok: false, code: 'validation_failed' };
  // Alerts turned on from here count from now, as the list's switch does (no digest of what came while they were off).
  const restart = alert !== row.alert && alert !== 'off' ? { lastDigestAt: now } : {};
  await db.update(savedSearches).set({ name, alert, params: address.params, updatedAt: now, ...restart }).where(eq(savedSearches.id, row.id));
  return { ok: true, code: 'saved', redirectTo: routes.app.savedSearches() };
}

export async function setSavedSearchAlert(db: Db, userId: string, id: string, alert: SavedSearchAlert, now: Date): Promise<ActionResult> {
  if (!(SAVED_SEARCH_ALERTS as readonly string[]).includes(alert)) return { ok: false, code: 'validation_failed' };
  const updated = await db.update(savedSearches).set({ alert, updatedAt: now, ...(alert === 'daily' ? { lastDigestAt: now } : {}) }).where(and(eq(savedSearches.id, String(id)), eq(savedSearches.userId, userId))).returning({ id: savedSearches.id });
  return updated.length ? { ok: true, code: 'updated' } : { ok: false, code: 'not_found' };
}

export async function deleteSavedSearch(db: Db, userId: string, id: string): Promise<ActionResult> {
  const deleted = await db.delete(savedSearches).where(and(eq(savedSearches.id, String(id)), eq(savedSearches.userId, userId))).returning({ id: savedSearches.id });
  return deleted.length ? { ok: true, code: 'updated' } : { ok: false, code: 'not_found' };
}

/** A find work search's distance from the person's helper area (true without a limit, for remote tasks, and without an area). */
function withinDistance(params: Record<string, string>, center: { lat: number; lng: number } | undefined, task: { mode: string; publicLat: number | null; publicLng: number | null }): boolean {
  const maxMiles = maxMilesOf(distanceOf(params));
  if (maxMiles === null || !center || task.mode === 'remote' || task.publicLat === null || task.publicLng === null) return true;
  return milesBetween(center, { lat: task.publicLat, lng: task.publicLng }) <= maxMiles;
}

/**
 * The people a newly posted task should alert at once (read-only, so the dispatcher can plan it more than once):
 * their instant searches in its market that it fits, one alert per person per task, never the poster or
 * someone blocked either way, never a task staff hid before the dispatch (sweep SS4), within a find work search's
 * distance, and at most `INSTANT_ALERTS_PER_DAY` a day (the rest wait for a digest, if any).
 */
export async function instantSearchMatches(db: Db, taskId: string, now: Date, onlyUserId?: string): Promise<{ userId: string; searchId: string; name: string }[]> {
  const found = await findTaskWithPublicView(db, taskId);
  if (!found || found.view.status !== 'open') return [];
  const [task] = await db.select({ marketId: tasks.marketId, posterUserId: tasks.posterUserId, hiddenAt: tasks.hiddenAt, mode: tasks.mode, publicLat: tasks.publicLat, publicLng: tasks.publicLng }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task || task.hiddenAt) return [];
  // One person's notifications page only needs that person's searches (deliverPending runs this per page load).
  const rows = await db.select().from(savedSearches).where(and(eq(savedSearches.marketId, task.marketId), eq(savedSearches.alert, 'instant'), onlyUserId ? eq(savedSearches.userId, onlyUserId) : undefined));
  if (rows.length === 0) return [];
  const { names } = await areaMaps(db, task.marketId);
  // "A day" for the alert cap and "today" in the filters are the market's own (completion plan 8.1).
  const timeZone = await marketTimeZone(db, task.marketId);
  const since = new Date(marketLocalToUtc(marketDayKey(now, timeZone), '00:00', timeZone));
  const people = [...new Set(rows.map((row) => row.userId))];
  const [sentToday, centers] = await Promise.all([
    db
      .select({ userId: notifications.userId, value: count() })
      .from(notifications)
      .where(and(inArray(notifications.userId, people), eq(notifications.type, 'saved_search_match'), gte(notifications.createdAt, since)))
      .groupBy(notifications.userId),
    helperCenters(db, [...new Set(rows.filter((row) => row.source === 'find_work').map((row) => row.userId))]),
  ]);
  const sent = new Map(sentToday.map((row) => [row.userId, Number(row.value)]));
  const out: { userId: string; searchId: string; name: string }[] = [];
  for (const row of rows) {
    if (row.userId === task.posterUserId || out.some((match) => match.userId === row.userId)) continue;
    if ((sent.get(row.userId) ?? 0) >= INSTANT_ALERTS_PER_DAY) continue;
    if (!taskMatchesBoard(found.view, parseTaskBoardQuery(row.params), { now, areaNames: names, timeZone })) continue;
    if (row.source === 'find_work' && !withinDistance(row.params, centers.get(row.userId), task)) continue;
    if (await isBlockedBetween(db, row.userId, task.posterUserId)) continue;
    out.push({ userId: row.userId, searchId: row.id, name: row.name });
  }
  return out;
}

/** The digest goes out from 8 am on the search's market's clock. */
const DIGEST_HOUR = '08:00';
/** The furthest back a digest counts: a search whose last digest is older (alerts off for a while) starts here. */
const DIGEST_LOOKBACK_MS = 7 * 86_400_000;
/** Searches looked at per run (the most overdue first; the rest on the next tick). */
const DIGEST_BATCH = 500;

/** 8 am today in a market's zone: the digest's send time there. */
const digestTime = (now: Date, timeZone: TimeZone) => new Date(marketLocalToUtc(marketDayKey(now, timeZone), DIGEST_HOUR, timeZone));

/**
 * A digest's count, for one saved search: open tasks it fits that were posted since `since`, never the person's own,
 * never from someone blocked either way (sweep SS1, as instant alerts), within a find work search's distance.
 */
async function digestCount(db: Db, row: typeof savedSearches.$inferSelect, since: Date, now: Date, timeZone: TimeZone): Promise<number> {
  const { ids } = await areaMaps(db, row.marketId);
  const query = parseTaskBoardQuery(row.params);
  const [blocked, centers] = await Promise.all([blockedPeopleOf(db, row.userId), row.source === 'find_work' ? helperCenters(db, [row.userId]) : Promise.resolve(new Map())]);
  const conditions: SQL[] = [...boardConditions(query, { marketId: row.marketId, timeZone, now, areaIds: ids }), gte(tasks.publishedAt, since), ne(tasks.posterUserId, row.userId)];
  if (blocked.length > 0) conditions.push(notInArray(tasks.posterUserId, blocked));
  const center = centers.get(row.userId);
  const maxMiles = maxMilesOf(distanceOf(row.params));
  if (row.source === 'find_work' && center && maxMiles !== null) conditions.push(or(eq(tasks.mode, 'remote'), sql`${milesFrom(center)} <= ${maxMiles}`)!);
  const [found] = await db.select({ value: count() }).from(tasks).innerJoin(categories, eq(categories.id, tasks.categoryId)).where(and(...conditions));
  return Number(found?.value ?? 0);
}

/**
 * The morning digest (a job): each daily search not sent since this morning (8 am in its market, completion plan
 * 8.1) counts the tasks posted since its last digest that it fits (at most 7 days back, sweep SS2), and says how many
 * (when there are any). Which searches are due is decided in SQL, the most overdue first (SS3), so searches not due
 * yet never crowd out due ones. Runs every tick; does its work once a day per search.
 */
export async function runSavedSearchDigests(db: Db, now: Date): Promise<number> {
  // Each market zone where 8 am has come today: its daily searches not sent since then are due.
  const zoneRows = await db.selectDistinct({ timeZone: markets.timeZone }).from(markets);
  const due = zoneRows.map((row) => ({ timeZone: row.timeZone, sendFrom: digestTime(now, row.timeZone) })).filter((zone) => zone.sendFrom <= now);
  if (due.length === 0) return 0;
  const candidates = await db
    .select({ search: savedSearches, timeZone: markets.timeZone })
    .from(savedSearches)
    .innerJoin(markets, eq(markets.id, savedSearches.marketId))
    .where(and(eq(savedSearches.alert, 'daily'), or(...due.map((zone) => and(eq(markets.timeZone, zone.timeZone), or(isNull(savedSearches.lastDigestAt), lt(savedSearches.lastDigestAt, zone.sendFrom)))))))
    .orderBy(sql`${savedSearches.lastDigestAt} asc nulls first`, asc(savedSearches.id))
    .limit(DIGEST_BATCH);
  let sent = 0;
  for (const { search: row, timeZone } of candidates) {
    // From the last digest (runs further apart than a day lose nothing: a late morning, the day the clocks fall back).
    const since = new Date(Math.max((row.lastDigestAt ?? row.createdAt).getTime(), now.getTime() - DIGEST_LOOKBACK_MS));
    const total = await digestCount(db, row, since, now, timeZone);
    await db.transaction(async (tx) => {
      await tx.update(savedSearches).set({ lastDigestAt: now }).where(eq(savedSearches.id, row.id));
      if (total > 0) {
        await tx
          .insert(outboxEvents)
          .values({ id: `evt_digest_${row.id}_${marketDayKey(now, timeZone)}`, type: 'searches.digest', aggregateType: 'saved_search', aggregateId: row.id, payload: { searchId: row.id, userId: row.userId, count: total, name: row.name } })
          .onConflictDoNothing();
      }
    });
    if (total > 0) sent += 1;
  }
  return sent;
}
