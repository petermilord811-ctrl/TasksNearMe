import { and, asc, count, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import {
  INSTANT_ALERTS_PER_DAY,
  SAVED_SEARCH_ALERTS,
  SAVED_SEARCH_MAX,
  routes,
  savedSearchInputSchema,
  type ActionResult,
  type NewSavedSearchPageData,
  type SavedSearchAlert,
  type SavedSearchesPageData,
  type SavedSearchFilters,
  type SavedSearchInput,
  type TaskBoardQueryState,
} from '@/contracts';
import { CATEGORY_SLUGS } from '@/contracts/common';
import { areas, categories, markets } from '@/modules/markets/schema';
import { notifications } from '@/modules/notifications/schema';
import { parseTaskBoardQuery } from '@/modules/tasks/projections';
import { boardConditions, findTaskWithPublicView, listBoardTasks } from '@/modules/tasks/queries';
import { tasks } from '@/modules/tasks/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';
import { taskMatchesBoard } from '@/shared/board-match';
import { splitLocalePath } from '@/shared/locale';
import { savedSearches } from './schema';

/**
 * Saved searches and their alerts (completion plan 7.10). A saved search is a board address: its market, its
 * category (the hub's path) and its filters (the query). Instant alerts ride the dispatcher's `task.posted` event
 * (src/modules/notifications/service.ts reads `instantSearchMatches`), capped per person per day; the morning
 * digest is a job (`runSavedSearchDigests`).
 */

const BOARD_PATH = /^\/([a-z0-9-]{1,60})\/tasks(?:\/([a-z-]{1,40}))?\/?$/;

/** A board address (`/austin/tasks/moving-help?area=mueller`, Spanish `/es/...` too) → its market and filters. */
export function parseBoardAddress(from: string): { marketSlug: string; params: Record<string, string>; query: TaskBoardQueryState } | null {
  let url: URL;
  try {
    url = new URL(from, 'https://board.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'https://board.invalid') return null;
  const path = splitLocalePath(url.pathname)?.path ?? url.pathname;
  const match = BOARD_PATH.exec(path);
  if (!match) return null;
  const params: Record<string, string> = {};
  for (const [key, value] of url.searchParams) if (key !== 'page' && key !== 'view' && key !== 'group' && key !== 'sort') params[key] = value;
  const category = match[2];
  if (category) {
    if (!(CATEGORY_SLUGS as readonly string[]).includes(category)) return null;
    params.category = category;
  }
  return { marketSlug: match[1]!, params, query: parseTaskBoardQuery(params) };
}

function filtersOf(query: TaskBoardQueryState, areaNames: ReadonlyMap<string, string>): SavedSearchFilters {
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
  };
}

async function marketBySlug(db: Db, slug: string) {
  const [market] = await db.select({ id: markets.id, slug: markets.slug, name: markets.name }).from(markets).where(eq(markets.slug, slug)).limit(1);
  return market ?? null;
}

async function areaMaps(db: Db, marketId: string) {
  const rows = await db.select({ id: areas.id, slug: areas.slug, name: areas.name }).from(areas).where(eq(areas.marketId, marketId));
  return { ids: new Map(rows.map((row) => [row.slug, row.id])), names: new Map(rows.map((row) => [row.slug, row.name])) };
}

export async function getNewSavedSearchPage(db: Db, userId: string, from: string): Promise<NewSavedSearchPageData | null> {
  const parsed = parseBoardAddress(from);
  if (!parsed) return null;
  const market = await marketBySlug(db, parsed.marketSlug);
  if (!market) return null;
  const [maps, [mine]] = await Promise.all([areaMaps(db, market.id), db.select({ value: count() }).from(savedSearches).where(eq(savedSearches.userId, userId))]);
  return { from, marketName: market.name, filters: filtersOf(parsed.query, maps.names), full: Number(mine?.value ?? 0) >= SAVED_SEARCH_MAX };
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
    const { totalCount } = await listBoardTasks(db, { marketId: row.marketId, query: { ...query, group: 'none' }, now, areaIds: maps.ids });
    return {
      id: row.id,
      name: row.name,
      href: routes.taskBoard(market.slug, query),
      marketName: market.name,
      filters: filtersOf(query, maps.names),
      alert: row.alert as SavedSearchAlert,
      openCount: totalCount,
      createdAt: row.createdAt.toISOString(),
    };
  }));
  return { searches, max: SAVED_SEARCH_MAX };
}

/** Where a saved search opens: its board view, now. */
export async function savedSearchHref(db: Db, userId: string, id: string): Promise<string | null> {
  const [row] = await db.select({ params: savedSearches.params, marketId: savedSearches.marketId }).from(savedSearches).where(and(eq(savedSearches.id, String(id)), eq(savedSearches.userId, userId))).limit(1);
  if (!row) return null;
  const [market] = await db.select({ slug: markets.slug }).from(markets).where(eq(markets.id, row.marketId)).limit(1);
  return market ? routes.taskBoard(market.slug, parseTaskBoardQuery(row.params)) : null;
}

export async function createSavedSearch(db: Db, userId: string, input: SavedSearchInput, now: Date): Promise<ActionResult> {
  const parsed = savedSearchInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const address = parseBoardAddress(parsed.data.from);
  const market = address ? await marketBySlug(db, address.marketSlug) : null;
  if (!address || !market) return { ok: false, code: 'validation_failed', fieldErrors: { from: ['invalid'] } };
  const [mine] = await db.select({ value: count() }).from(savedSearches).where(eq(savedSearches.userId, userId));
  if (Number(mine?.value ?? 0) >= SAVED_SEARCH_MAX) return { ok: false, code: 'limit_reached' };
  await db.insert(savedSearches).values({ id: newId('ssr'), userId, marketId: market.id, name: parsed.data.name, source: 'board', params: address.params, alert: parsed.data.alert, lastDigestAt: now, createdAt: now, updatedAt: now });
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

/**
 * The people a newly posted task should alert at once (read-only, so the dispatcher can plan it more than once):
 * their instant searches in its market that it fits, one alert per person per task, never the poster or
 * someone blocked either way, and at most `INSTANT_ALERTS_PER_DAY` a day (the rest wait for a digest, if any).
 */
export async function instantSearchMatches(db: Db, taskId: string, now: Date, onlyUserId?: string): Promise<{ userId: string; searchId: string; name: string }[]> {
  const found = await findTaskWithPublicView(db, taskId);
  if (!found || found.view.status !== 'open') return [];
  const [task] = await db.select({ marketId: tasks.marketId, posterUserId: tasks.posterUserId }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return [];
  // One person's notifications page only needs that person's searches (deliverPending runs this per page load).
  const rows = await db.select().from(savedSearches).where(and(eq(savedSearches.marketId, task.marketId), eq(savedSearches.alert, 'instant'), onlyUserId ? eq(savedSearches.userId, onlyUserId) : undefined));
  if (rows.length === 0) return [];
  const { names } = await areaMaps(db, task.marketId);
  const since = new Date(marketLocalToUtc(marketDayKey(now), '00:00'));
  const people = [...new Set(rows.map((row) => row.userId))];
  const sentToday = await db
    .select({ userId: notifications.userId, value: count() })
    .from(notifications)
    .where(and(inArray(notifications.userId, people), eq(notifications.type, 'saved_search_match'), gte(notifications.createdAt, since)))
    .groupBy(notifications.userId);
  const sent = new Map(sentToday.map((row) => [row.userId, Number(row.value)]));
  const out: { userId: string; searchId: string; name: string }[] = [];
  for (const row of rows) {
    if (row.userId === task.posterUserId || out.some((match) => match.userId === row.userId)) continue;
    if ((sent.get(row.userId) ?? 0) >= INSTANT_ALERTS_PER_DAY) continue;
    if (!taskMatchesBoard(found.view, parseTaskBoardQuery(row.params), { now, areaNames: names })) continue;
    if (await isBlockedBetween(db, row.userId, task.posterUserId)) continue;
    out.push({ userId: row.userId, searchId: row.id, name: row.name });
  }
  return out;
}

/** The digest goes out from 8 am, market time. */
const DIGEST_HOUR = '08:00';

/**
 * The morning digest (a job): each daily search not sent since this morning counts the tasks posted since its
 * last digest that it fits, and says how many (when there are any). Runs every tick; does its work once a day.
 */
export async function runSavedSearchDigests(db: Db, now: Date): Promise<number> {
  const sendFrom = new Date(marketLocalToUtc(marketDayKey(now), DIGEST_HOUR));
  if (now < sendFrom) return 0;
  const due = await db.select().from(savedSearches).where(and(eq(savedSearches.alert, 'daily'), or(isNull(savedSearches.lastDigestAt), lt(savedSearches.lastDigestAt, sendFrom)))).limit(500);
  let sent = 0;
  for (const row of due) {
    const { ids } = await areaMaps(db, row.marketId);
    const since = new Date(Math.max((row.lastDigestAt ?? row.createdAt).getTime(), now.getTime() - 86_400_000));
    const query = parseTaskBoardQuery(row.params);
    const [found] = await db
      .select({ value: count() })
      .from(tasks)
      .innerJoin(categories, eq(categories.id, tasks.categoryId))
      .where(and(...boardConditions(query, { marketId: row.marketId, now, areaIds: ids }), gte(tasks.publishedAt, since)));
    const total = Number(found?.value ?? 0);
    await db.transaction(async (tx) => {
      await tx.update(savedSearches).set({ lastDigestAt: now }).where(eq(savedSearches.id, row.id));
      if (total > 0) {
        await tx
          .insert(outboxEvents)
          .values({ id: `evt_digest_${row.id}_${marketDayKey(now)}`, type: 'searches.digest', aggregateType: 'saved_search', aggregateId: row.id, payload: { searchId: row.id, userId: row.userId, count: total, name: row.name } })
          .onConflictDoNothing();
      }
    });
    if (total > 0) sent += 1;
  }
  return sent;
}

