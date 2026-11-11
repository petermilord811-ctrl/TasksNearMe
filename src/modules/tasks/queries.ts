import { and, asc, count, desc, eq, gt, lt, ne, type SQL } from 'drizzle-orm';
import type { CategorySlug, TaskBoardPageData, TaskPublicView } from '@/contracts';
import type { Db } from '@/platform/db/connect';
import { users } from '../accounts/schema';
import { areas, categories, markets } from '../markets/schema';
import { BOARD_PAGE_SIZE, toTaskPublicView, whenRange, type PublicTaskRow } from './projections';
import { tasks } from './schema';

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

function openIn(marketId: string, now: Date): SQL[] {
  return [eq(tasks.marketId, marketId), eq(tasks.status, 'open'), gt(tasks.windowEnd, now)];
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

/** A task anyone may see by its slug (drafts never), and whether it still takes offers. */
export async function findPublicTask(
  db: Db,
  slug: string,
  now: Date,
): Promise<{ task: TaskPublicView; marketId: string; marketSlug: string; acceptingOffers: boolean } | null> {
  const [row] = await selectPublic(db)
    .where(and(eq(tasks.slug, slug), ne(tasks.status, 'draft')))
    .limit(1);
  if (!row) return null;
  return {
    task: toTaskPublicView(toRow(row)),
    marketId: row.marketId,
    marketSlug: row.marketSlug,
    acceptingOffers: row.status === 'open' && row.windowEnd > now,
  };
}
