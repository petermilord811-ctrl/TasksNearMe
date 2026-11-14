import { and, asc, count, desc, gt, isNull, lt, ne, notInArray, or, eq, sql, type SQL } from 'drizzle-orm';
import type { CategorySlug, FindWorkPageData, TaskBoardPageData, TaskPublicView } from '@/contracts';
import type { Db } from '@/platform/db/connect';
import { users } from '../accounts/schema';
import { areas, categories, markets } from '../markets/schema';
import { BOARD_PAGE_SIZE, toTaskPublicView, whenRange, type PublicTaskRow } from './projections';
import { taskMarks, tasks } from './schema';
import { GENERATED_ID_PATTERN } from '@/shared/sample-data';

/** Public task reads. Only open tasks whose window hasn't ended are listed. */

const columns = {
  id: tasks.id,
  slug: tasks.slug,
  title: tasks.title,
  description: tasks.description,
  categorySlug: categories.slug,
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

function selectPublic(db: Db) {
  return db
    .select(columns)
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .innerJoin(markets, eq(markets.id, tasks.marketId))
    .innerJoin(users, eq(users.id, tasks.posterUserId))
    .leftJoin(areas, eq(areas.id, tasks.publicAreaId));
}

type Row = Awaited<ReturnType<ReturnType<typeof selectPublic>['execute']>>[number];

function toRow(row: Row): PublicTaskRow {
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

/** Open, not past, and not hidden by staff: what the board, the feeds and the public pages list. */
function openIn(marketId: string, now: Date): SQL[] {
  return [eq(tasks.marketId, marketId), eq(tasks.status, 'open'), gt(tasks.windowEnd, now), isNull(tasks.hiddenAt)];
}

export async function listBoardTasks(
  db: Db,
  options: { marketId: string; query: TaskBoardPageData['query']; now: Date },
): Promise<{ tasks: TaskPublicView[]; totalCount: number }> {
  const { query, now } = options;
  const conditions = openIn(options.marketId, now);
  if (query.category) conditions.push(eq(categories.slug, query.category));
  if (query.remoteOnly) conditions.push(eq(tasks.mode, 'remote'));
  const range = whenRange(query.when, now);
  if (range) conditions.push(lt(tasks.windowStart, range.to), gt(tasks.windowEnd, range.from));
  const where = and(...conditions);

  const [total] = await db
    .select({ value: count() })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(where);
  const rows = await selectPublic(db)
    .where(where)
    .orderBy(...(query.sort === 'newest' ? [desc(tasks.publishedAt), asc(tasks.id)] : [asc(tasks.windowStart), asc(tasks.id)]))
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
  const conditions = openIn(options.marketId, now);
  if (options.excludePosterIds.length > 0) conditions.push(notInArray(tasks.posterUserId, options.excludePosterIds));
  if (query.category) conditions.push(eq(categories.slug, query.category));
  if (query.remoteOnly) conditions.push(eq(tasks.mode, 'remote'));
  const range = whenRange(query.when, now);
  if (range) conditions.push(lt(tasks.windowStart, range.to), gt(tasks.windowEnd, range.from));
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

/** Newest open tasks, for the home, market, and category pages. */
export async function listRecentOpenTasks(
  db: Db,
  options: { marketId: string; categorySlug?: CategorySlug; limit: number; now: Date; excludeTaskId?: string },
): Promise<TaskPublicView[]> {
  const conditions = openIn(options.marketId, options.now);
  if (options.categorySlug) conditions.push(eq(categories.slug, options.categorySlug));
  if (options.excludeTaskId) conditions.push(ne(tasks.id, options.excludeTaskId));
  const rows = await selectPublic(db)
    .where(and(...conditions))
    .orderBy(desc(tasks.publishedAt), asc(tasks.id))
    .limit(options.limit);
  return rows.map((row) => toTaskPublicView(toRow(row)));
}

/**
 * How many open tasks the board lists in the market (and category). `realOnly` leaves sample data out
 * (src/shared/sample-data.ts), for counts shown as facts on public pages.
 */
export async function countOpenTasks(
  db: Db,
  options: { marketId: string; categorySlug?: CategorySlug; now: Date; realOnly?: boolean },
): Promise<number> {
  const conditions = openIn(options.marketId, options.now);
  if (options.categorySlug) conditions.push(eq(categories.slug, options.categorySlug));
  if (options.realOnly) conditions.push(sql`${tasks.id} ~ ${GENERATED_ID_PATTERN}`);
  const [row] = await db
    .select({ value: count() })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(and(...conditions));
  return row?.value ?? 0;
}

/**
 * The sitemap's tasks in a market: the ones the board lists (open, not past, not hidden), newest first, with their
 * category and last change. Closed tasks stay reachable but are noindex, so they're left out.
 */
export async function listOpenTaskDates(
  db: Db,
  options: { marketId: string; now: Date; limit: number },
): Promise<{ slug: string; categorySlug: string; updatedAt: Date }[]> {
  return db
    .select({ slug: tasks.slug, categorySlug: categories.slug, updatedAt: tasks.updatedAt })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(and(...openIn(options.marketId, options.now)))
    .orderBy(desc(tasks.publishedAt), asc(tasks.id))
    .limit(options.limit);
}

/** A task anyone may see by its slug (drafts never), and whether it still takes offers. */
export async function findPublicTask(
  db: Db,
  slug: string,
  now: Date,
): Promise<{ task: TaskPublicView; marketId: string; marketSlug: string; acceptingOffers: boolean } | null> {
  const [row] = await selectPublic(db)
    .where(and(eq(tasks.slug, slug), ne(tasks.status, 'draft'), isNull(tasks.hiddenAt)))
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
