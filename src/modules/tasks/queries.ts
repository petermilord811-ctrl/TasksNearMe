import { and, asc, count, desc, gt, gte, ilike, inArray, isNull, lt, lte, ne, notInArray, or, eq, sql, type SQL } from 'drizzle-orm';
import { MARKET_TIME_ZONE } from '@/contracts/common';
import type { CategorySlug, FindWorkPageData, TaskBoardQueryState, TaskBoardSort, TaskBoardTime, TaskPublicView } from '@/contracts';
import { taskTypesFor } from '@/shared/task-types';
import type { Db } from '@/platform/db/connect';
import { users } from '../accounts/schema';
import { areas, categories, markets } from '../markets/schema';
import { BOARD_PAGE_SIZE, toTaskPublicView, whenRange, type PublicTaskRow } from './projections';
import { POSTED_MS, TIME_SLOTS } from '@/shared/board-match';
import { taskMarks, tasks } from './schema';
import { rowScopeCondition, type RowScope } from '@/shared/sample-data';

/** Public task reads. Only open tasks whose window hasn't ended are listed. */

const columns = {
  id: tasks.id,
  slug: tasks.slug,
  title: tasks.title,
  description: tasks.description,
  categorySlug: categories.slug,
  details: tasks.details,
  mode: tasks.mode,
  status: tasks.status,
  pricingType: tasks.pricingType,
  budgetCents: tasks.budgetCents,
  hourlyRateCents: tasks.hourlyRateCents,
  estimatedHours: tasks.estimatedHours,
  hoursCap: tasks.hoursCap,
  windowStart: tasks.windowStart,
  windowEnd: tasks.windowEnd,
  flexible: tasks.flexible,
  publicLat: tasks.publicLat,
  publicLng: tasks.publicLng,
  offerCount: tasks.offerCount,
  publishedAt: tasks.publishedAt,
  createdAt: tasks.createdAt,
  areaName: areas.name,
  marketSlug: markets.slug,
  marketName: markets.name,
  marketId: tasks.marketId,
  posterName: users.name,
  posterFirstName: users.firstName,
  posterLastName: users.lastName,
  posterCreatedAt: users.createdAt,
  posterPhoneVerifiedAt: users.phoneVerifiedAt,
};

export function selectPublic(db: Db) {
  return db
    .select(columns)
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .innerJoin(markets, eq(markets.id, tasks.marketId))
    .innerJoin(users, eq(users.id, tasks.posterUserId))
    .leftJoin(areas, eq(areas.id, tasks.publicAreaId));
}

type Row = Awaited<ReturnType<ReturnType<typeof selectPublic>['execute']>>[number];

export function toRow(row: Row): PublicTaskRow {
  return {
    ...row,
    poster: {
      name: row.posterName,
      firstName: row.posterFirstName,
      lastName: row.posterLastName,
      createdAt: row.posterCreatedAt,
      phoneVerifiedAt: row.posterPhoneVerifiedAt,
    },
  };
}

/**
 * Open, not past, and not hidden by staff: what the board, the feeds and the public pages list. `rows: 'real'` leaves
 * sample tasks out, for the public where samples are hidden (src/shared/sample-data.ts); signed-in readers keep `all`.
 */
export function openIn(marketId: string, now: Date, rows: RowScope = 'all'): SQL[] {
  const conditions = [eq(tasks.marketId, marketId), eq(tasks.status, 'open'), gt(tasks.windowEnd, now), isNull(tasks.hiddenAt)];
  const real = rowScopeCondition(rows, tasks.id);
  return real ? [...conditions, real] : conditions;
}

/** The scope the board's filters apply in: the market, the time, its neighborhoods by slug, and which rows count. */
export interface BoardScope {
  marketId: string;
  now: Date;
  areaIds: ReadonlyMap<string, string>;
  /** `real` for the public where samples are hidden (src/shared/sample-data.ts). Saved-search alerts keep `all`. */
  rows?: RowScope;
}

/** The board's filters (completion plan 7.4), as `parseTaskBoardQuery` returns them. */
export type BoardFilters = Pick<TaskBoardQueryState, 'when' | 'remoteOnly'> & Partial<Omit<TaskBoardQueryState, 'when' | 'remoteOnly'>>;
/** A filter a facet count leaves out, so an option's count never counts itself out. */
export type BoardFilterKey = 'category' | 'type' | 'q' | 'areas' | 'price' | 'pricing' | 'posted' | 'times' | 'few' | 'when' | 'remote';

/** What a client offers for the whole task: the fixed price, or the rate × the estimated hours. */
export const taskPriceCents = sql<number>`coalesce(${tasks.budgetCents}, round(${tasks.hourlyRateCents} * coalesce(${tasks.estimatedHours}, 1)))`;

/** Minutes after midnight, Central time: morning before noon, afternoon to 5 pm, evening after. */
export { TIME_SLOTS };

const localMinutes = (column: typeof tasks.windowStart | typeof tasks.windowEnd) =>
  sql`(extract(hour from (${column} at time zone ${MARKET_TIME_ZONE})) * 60 + extract(minute from (${column} at time zone ${MARKET_TIME_ZONE})))`;

/** The window touches the slot (a flexible day touches every slot). */
export function timeCondition(time: TaskBoardTime): SQL {
  const [from, to] = TIME_SLOTS[time];
  return or(eq(tasks.flexible, true), and(sql`${localMinutes(tasks.windowStart)} < ${to}`, sql`${localMinutes(tasks.windowEnd)} > ${from}`))!;
}

/** Each word in the title or the description (case-insensitive; LIKE wildcards in the words are literal). */
export function keywordCondition(q: string): SQL | undefined {
  const words = q.split(/\s+/).map((word) => word.trim()).filter(Boolean).slice(0, 6);
  if (words.length === 0) return undefined;
  return and(...words.map((word) => {
    const pattern = `%${word.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    return or(ilike(tasks.title, pattern), ilike(tasks.description, pattern))!;
  }));
}

/** The category's task type (src/shared/task-types.ts) from the task's details. */
export function typeCondition(category: CategorySlug, slug: string): SQL {
  const type = taskTypesFor(category).find((candidate) => candidate.slug === slug);
  if (!type) return sql`false`;
  const value = sql`(${tasks.details} ->> ${type.field})`;
  if (type.values) return sql`${value} in (${sql.join(type.values.map((option) => sql`${option}`), sql`, `)})`;
  const number = sql`(case when ${value} ~ '^[0-9]{1,3}$' then ${value}::int end)`;
  return type.range!.max === undefined ? sql`${number} >= ${type.range!.min}` : sql`${number} between ${type.range!.min} and ${type.range!.max}`;
}

/**
 * Every filter as SQL, on top of "open, not past, not hidden" (needs the categories join). `skip` leaves one
 * filter out, for that filter's own counts. `areaIds` maps the market's neighborhood slugs to ids; `rows` which
 * rows count (every count and list the public board shows goes through here).
 */
export function boardConditions(query: BoardFilters, scope: BoardScope, skip?: BoardFilterKey): SQL[] {
  const { now } = scope;
  const conditions = openIn(scope.marketId, now, scope.rows);
  if (query.category && skip !== 'category') {
    conditions.push(eq(categories.slug, query.category));
    if (query.type && skip !== 'type') conditions.push(typeCondition(query.category, query.type));
  }
  if (query.q && skip !== 'q') {
    const keyword = keywordCondition(query.q);
    if (keyword) conditions.push(keyword);
  }
  if (query.areas?.length && skip !== 'areas') {
    const ids = query.areas.map((slug) => scope.areaIds.get(slug)).filter((id): id is string => Boolean(id));
    conditions.push(ids.length > 0 ? inArray(tasks.publicAreaId, ids) : sql`false`);
  }
  if (skip !== 'price') {
    if (query.minPrice !== undefined) conditions.push(sql`${taskPriceCents} >= ${query.minPrice * 100}`);
    if (query.maxPrice !== undefined) conditions.push(sql`${taskPriceCents} <= ${query.maxPrice * 100}`);
  }
  if (query.pricing && skip !== 'pricing') conditions.push(eq(tasks.pricingType, query.pricing));
  if (query.posted && skip !== 'posted') conditions.push(gte(tasks.publishedAt, new Date(now.getTime() - POSTED_MS[query.posted])));
  if (query.times?.length && skip !== 'times') conditions.push(or(...query.times.map(timeCondition))!);
  if (query.few && skip !== 'few') conditions.push(lte(tasks.offerCount, 1));
  if (skip !== 'when') {
    const range = whenRange(query.when, now);
    if (range) conditions.push(lt(tasks.windowStart, range.to), gt(tasks.windowEnd, range.from));
  }
  if (query.remoteOnly && skip !== 'remote') conditions.push(eq(tasks.mode, 'remote'));
  return conditions;
}

/** The board's order: soonest window, newest post, or price (high or low), with a stable tie-break. */
export function boardOrder(sort: TaskBoardSort | undefined): SQL[] {
  if (sort === 'newest') return [desc(tasks.publishedAt), asc(tasks.id)];
  if (sort === 'price_high') return [sql`${taskPriceCents} desc nulls last`, asc(tasks.windowStart), asc(tasks.id)];
  if (sort === 'price_low') return [sql`${taskPriceCents} asc nulls last`, asc(tasks.windowStart), asc(tasks.id)];
  return [asc(tasks.windowStart), asc(tasks.id)];
}

/** The market's neighborhoods by slug (the board's `area` filter names them). */
export async function marketAreaIds(db: Db, marketId: string): Promise<Map<string, string>> {
  const rows = await db.select({ id: areas.id, slug: areas.slug }).from(areas).where(eq(areas.marketId, marketId));
  return new Map(rows.map((row) => [row.slug, row.id]));
}

/** One page of the board's matching tasks, in its order. */
export async function listBoardTasks(
  db: Db,
  options: { marketId: string; query: BoardFilters & Pick<TaskBoardQueryState, 'sort' | 'page'>; now: Date; areaIds?: ReadonlyMap<string, string>; rows?: RowScope },
): Promise<{ tasks: TaskPublicView[]; totalCount: number }> {
  const { query, now } = options;
  const areaIds = options.areaIds ?? (query.areas?.length ? await marketAreaIds(db, options.marketId) : new Map<string, string>());
  const where = and(...boardConditions(query, { marketId: options.marketId, now, areaIds, rows: options.rows }));

  const [total] = await db
    .select({ value: count() })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(where);
  const rows = await selectPublic(db)
    .where(where)
    .orderBy(...boardOrder(query.sort))
    .limit(BOARD_PAGE_SIZE)
    .offset((query.page - 1) * BOARD_PAGE_SIZE);
  return { tasks: rows.map((row) => toTaskPublicView(toRow(row))), totalCount: total?.value ?? 0 };
}

/** Great-circle miles from a point to a task's public point (null for tasks without one). */
function milesFrom(center: { lat: number; lng: number }): SQL<number | null> {
  const lat = sql`${center.lat}::double precision`;
  const lng = sql`${center.lng}::double precision`;
  return sql<number | null>`(3958.8 * 2 * asin(sqrt(
    power(sin(radians(${tasks.publicLat} - ${lat}) / 2), 2)
    + cos(radians(${lat})) * cos(radians(${tasks.publicLat})) * power(sin(radians(${tasks.publicLng} - ${lng}) / 2), 2)
  )))`;
}

/**
 * The helper feed: the board's filters, without the helper's own tasks, plus a distance limit from the
 * helper's area. Remote tasks have no distance and stay in at every limit.
 */
export async function listFeedTasks(
  db: Db,
  options: {
    marketId: string;
    query: FindWorkPageData['query'];
    now: Date;
    /** The viewer, and people they blocked or who blocked them. */
    excludePosterIds: string[];
    /** The helper's area center; without one, distances are unknown and the limit is ignored. */
    center: { lat: number; lng: number } | null;
    maxMiles: number | null;
    /** The helper: their hidden tasks stay out, and `query.saved` keeps only the saved ones. */
    viewerId?: string;
  },
): Promise<{ tasks: { view: TaskPublicView; distanceMiles: number | null; posterUserId: string; status: string; windowEnd: Date }[]; totalCount: number }> {
  const { query, now, center } = options;
  // The board's own filters (completion plan 7.4: keyword, type, neighborhoods, price, time of day, posted…), then
  // find work's: blocked people, the distance, the helper's hidden and saved tasks.
  const areaIds = new Map((await db.select({ id: areas.id, slug: areas.slug }).from(areas).where(eq(areas.marketId, options.marketId))).map((area) => [area.slug, area.id]));
  const { sort: _sort, view: _view, distance: _distance, saved: _saved, page: _page, ...filters } = query;
  const conditions = boardConditions({ ...filters, areas: filters.areas ?? [], times: filters.times ?? [], few: filters.few ?? false }, { marketId: options.marketId, now, areaIds });
  if (options.excludePosterIds.length > 0) conditions.push(notInArray(tasks.posterUserId, options.excludePosterIds));
  const miles = center ? milesFrom(center) : sql<number | null>`null`;
  if (center && options.maxMiles !== null) {
    conditions.push(or(eq(tasks.mode, 'remote'), sql`${miles} <= ${options.maxMiles}`)!);
  }
  if (options.viewerId) {
    const mark = (kind: 'saved' | 'hidden') =>
      sql`exists (select 1 from ${taskMarks} where ${taskMarks.userId} = ${options.viewerId} and ${taskMarks.taskId} = ${tasks.id} and ${taskMarks.kind} = ${kind})`;
    conditions.push(sql`not ${mark('hidden')}`);
    if (query.saved) conditions.push(mark('saved'));
  }
  const where = and(...conditions);
  // What the client offers for the whole task: the fixed price, or the rate times the hours cap.
  const pay = sql`coalesce(${tasks.budgetCents}, round(${tasks.hourlyRateCents} * ${tasks.hoursCap}))`;
  const order =
    query.sort === 'newest'
      ? [desc(tasks.publishedAt), asc(tasks.id)]
      : query.sort === 'nearest' && center
        ? [sql`${miles} asc nulls last`, asc(tasks.windowStart), asc(tasks.id)]
        : query.sort === 'pay'
          ? [sql`${pay} desc nulls last`, asc(tasks.windowStart), asc(tasks.id)]
          : [asc(tasks.windowStart), asc(tasks.id)];

  const [total] = await db
    .select({ value: count() })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(where);
  const rows = await db
    .select({ ...columns, distanceMiles: miles, posterUserId: tasks.posterUserId })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .innerJoin(markets, eq(markets.id, tasks.marketId))
    .innerJoin(users, eq(users.id, tasks.posterUserId))
    .leftJoin(areas, eq(areas.id, tasks.publicAreaId))
    .where(where)
    .orderBy(...order)
    .limit(BOARD_PAGE_SIZE)
    .offset((query.page - 1) * BOARD_PAGE_SIZE);
  return {
    tasks: rows.map(({ distanceMiles, posterUserId, ...row }) => ({
      view: toTaskPublicView(toRow(row)),
      distanceMiles: distanceMiles === null || distanceMiles === undefined ? null : Number(distanceMiles),
      posterUserId,
      status: row.status,
      windowEnd: row.windowEnd,
    })),
    totalCount: total?.value ?? 0,
  };
}

/** Newest open tasks, for the home, market, and category pages (`rows`: which rows count, as in `openIn`). */
export async function listRecentOpenTasks(
  db: Db,
  options: { marketId: string; categorySlug?: CategorySlug; limit: number; now: Date; excludeTaskId?: string; rows?: RowScope },
): Promise<TaskPublicView[]> {
  const conditions = openIn(options.marketId, options.now, options.rows);
  if (options.categorySlug) conditions.push(eq(categories.slug, options.categorySlug));
  if (options.excludeTaskId) conditions.push(ne(tasks.id, options.excludeTaskId));
  const rows = await selectPublic(db)
    .where(and(...conditions))
    .orderBy(desc(tasks.publishedAt), asc(tasks.id))
    .limit(options.limit);
  return rows.map((row) => toTaskPublicView(toRow(row)));
}

/**
 * How many open tasks the board lists in the market (and category). `rows: 'real'` leaves sample data out
 * (src/shared/sample-data.ts), for counts shown as facts on public pages.
 */
export async function countOpenTasks(
  db: Db,
  options: { marketId: string; categorySlug?: CategorySlug; now: Date; rows?: RowScope },
): Promise<number> {
  const conditions = openIn(options.marketId, options.now, options.rows);
  if (options.categorySlug) conditions.push(eq(categories.slug, options.categorySlug));
  const [row] = await db
    .select({ value: count() })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(and(...conditions));
  return row?.value ?? 0;
}

/**
 * The sitemap's tasks in a market: the ones the board lists (open, not past, not hidden), newest first, with their
 * category and last change. Closed tasks stay reachable but are noindex, so they're left out. `rows`: which rows
 * count, as in `openIn` (search engines read the public's, src/shared/sample-data.ts `searchEngineRows`).
 */
export async function listOpenTaskDates(
  db: Db,
  options: { marketId: string; now: Date; limit: number; rows?: RowScope },
): Promise<{ slug: string; categorySlug: string; updatedAt: Date }[]> {
  return db
    .select({ slug: tasks.slug, categorySlug: categories.slug, updatedAt: tasks.updatedAt })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(and(...openIn(options.marketId, options.now, options.rows)))
    .orderBy(desc(tasks.publishedAt), asc(tasks.id))
    .limit(options.limit);
}

/**
 * A task anyone may see by its slug (drafts never), and whether it still takes offers. With `rows: 'real'` a sample
 * task is not found (the public where samples are hidden).
 */
export async function findPublicTask(
  db: Db,
  slug: string,
  now: Date,
  rows: RowScope = 'all',
): Promise<{ task: TaskPublicView; marketId: string; marketSlug: string; acceptingOffers: boolean } | null> {
  const [row] = await selectPublic(db)
    .where(and(eq(tasks.slug, slug), ne(tasks.status, 'draft'), isNull(tasks.hiddenAt), rowScopeCondition(rows, tasks.id)))
    .limit(1);
  if (!row) return null;
  return {
    task: toTaskPublicView(toRow(row)),
    marketId: row.marketId,
    marketSlug: row.marketSlug,
    acceptingOffers: row.status === 'open' && row.windowEnd > now,
  };
}

/** A task by id with its public view (any status), for the poster's own pages. */
export async function findTaskWithPublicView(db: Db, taskId: string) {
  const [row] = await selectPublic(db).where(eq(tasks.id, taskId)).limit(1);
  return row ? { row, view: toTaskPublicView(toRow(row)) } : null;
}
