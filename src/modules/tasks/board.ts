import { and, asc, count, eq, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import {
  TASK_BOARD_PRICE_PRESETS,
  type CategorySlug,
  type ISODateTime,
  type TaskBoardFacets,
  type TaskBoardPricePreset,
  type TaskBoardPageData,
  type TaskBoardQueryState,
  type TaskBoardSection,
  type TaskPublicView,
} from '@/contracts';
import { areas, categories } from '@/modules/markets/schema';
import { findPublicMarket, getMarketView, listCategoryViews } from '@/modules/markets/queries';
import { db } from '@/platform/db/client';
import type { Db } from '@/platform/db/connect';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';
import { taskTypeOf, taskTypesFor } from '@/shared/task-types';
import { BOARD_PAGE_SIZE, toTaskPublicView, whenRange } from './projections';
import { boardConditions, boardOrder, listBoardTasks, openIn, selectPublic, taskPriceCents, timeCondition, toRow, type BoardFilterKey } from './queries';
import { tasks } from './schema';

/**
 * The public task board, Craigslist-style (completion plan 7.4): every filter in the URL, a count beside every
 * option, and the rows grouped by neighborhood (the first few of each, most tasks first, remote work last) or
 * one page at a time by day or in one list. Real counts only. Cached per filter set for minutes, under the
 * market's and the tasks' tags, like the rest of the public pages.
 */
const SECTION_SIZE = 5;
type Scope = { marketId: string; now: Date; areaIds: ReadonlyMap<string, string> };

const intOf = (value: unknown) => Number(value ?? 0) || 0;

/** How many tasks each option would show, given the other filters (each count leaves its own filter out). */
export async function boardFacets(database: Db, query: TaskBoardQueryState, scope: Scope, areaRows: { id: string; slug: string; name: string }[]): Promise<TaskBoardFacets> {
  const where = (skip: BoardFilterKey) => and(...boardConditions(query, scope, skip));
  const joined = eq(categories.id, tasks.categoryId);
  const sum = (condition: SQL | undefined) => sql<number>`coalesce(sum(case when ${condition ?? sql`true`} then 1 else 0 end), 0)::int`;
  const typeField = query.category ? taskTypesFor(query.category)[0]?.field : undefined;
  const since = (days: number) => new Date(scope.now.getTime() - days * 86_400_000);
  const range = (key: 'today' | 'this_week' | 'this_weekend') => {
    const span = whenRange(key, scope.now)!;
    return sql`${tasks.windowStart} < ${span.to} and ${tasks.windowEnd} > ${span.from}`;
  };
  const preset = (key: TaskBoardPricePreset) => {
    const found = TASK_BOARD_PRICE_PRESETS.find((candidate) => candidate.key === key)!;
    return and('min' in found ? sql`${taskPriceCents} >= ${found.min * 100}` : undefined, 'max' in found ? sql`${taskPriceCents} <= ${found.max * 100}` : undefined);
  };

  const [byCategory, byArea, byPricing, posted, times, when, prices, few, remote, byType] = await Promise.all([
    database.select({ slug: categories.slug, n: count() }).from(tasks).innerJoin(categories, joined).where(where('category')).groupBy(categories.slug),
    database.select({ area: tasks.publicAreaId, n: count() }).from(tasks).innerJoin(categories, joined).where(where('areas')).groupBy(tasks.publicAreaId),
    database.select({ pricing: tasks.pricingType, n: count() }).from(tasks).innerJoin(categories, joined).where(where('pricing')).groupBy(tasks.pricingType),
    database.select({ '24h': sum(sql`${tasks.publishedAt} >= ${since(1)}`), '3d': sum(sql`${tasks.publishedAt} >= ${since(3)}`), '7d': sum(sql`${tasks.publishedAt} >= ${since(7)}`) }).from(tasks).innerJoin(categories, joined).where(where('posted')),
    database.select({ morning: sum(timeCondition('morning')), afternoon: sum(timeCondition('afternoon')), evening: sum(timeCondition('evening')) }).from(tasks).innerJoin(categories, joined).where(where('times')),
    database.select({ today: sum(range('today')), this_week: sum(range('this_week')), this_weekend: sum(range('this_weekend')) }).from(tasks).innerJoin(categories, joined).where(where('when')),
    database.select({ under50: sum(preset('under50')), from50: sum(preset('from50')), from100: sum(preset('from100')), from200: sum(preset('from200')) }).from(tasks).innerJoin(categories, joined).where(where('price')),
    database.select({ n: sum(lte(tasks.offerCount, 1)) }).from(tasks).innerJoin(categories, joined).where(where('few')),
    database.select({ n: sum(eq(tasks.mode, 'remote')) }).from(tasks).innerJoin(categories, joined).where(where('remote')),
    typeField
      ? database.select({ value: sql<string | null>`(${tasks.details} ->> ${typeField})`, n: count() }).from(tasks).innerJoin(categories, joined).where(where('type')).groupBy(sql`1`)
      : Promise.resolve([] as { value: string | null; n: number }[]),
  ]);

  const areaCounts = new Map(byArea.map((row) => [row.area, row.n]));
  const typeCounts = new Map<string, number>();
  for (const row of byType) {
    const type = query.category && typeField ? taskTypeOf(query.category, { [typeField]: typeField === 'bedrooms' && row.value !== null ? Number(row.value) : row.value }) : undefined;
    if (type) typeCounts.set(type, (typeCounts.get(type) ?? 0) + row.n);
  }
  return {
    categories: Object.fromEntries(byCategory.map((row) => [row.slug as CategorySlug, row.n])),
    types: query.category ? taskTypesFor(query.category).map((type) => ({ slug: type.slug, count: typeCounts.get(type.slug) ?? 0 })) : [],
    areas: [...areaRows].sort((a, b) => a.name.localeCompare(b.name)).map((area) => ({ slug: area.slug, name: area.name, count: areaCounts.get(area.id) ?? 0 })),
    pricing: { fixed: byPricing.find((row) => row.pricing === 'fixed')?.n ?? 0, hourly: byPricing.find((row) => row.pricing === 'hourly')?.n ?? 0 },
    posted: { '24h': intOf(posted[0]?.['24h']), '3d': intOf(posted[0]?.['3d']), '7d': intOf(posted[0]?.['7d']) },
    times: { morning: intOf(times[0]?.morning), afternoon: intOf(times[0]?.afternoon), evening: intOf(times[0]?.evening) },
    when: { today: intOf(when[0]?.today), this_week: intOf(when[0]?.this_week), this_weekend: intOf(when[0]?.this_weekend) },
    prices: { under50: intOf(prices[0]?.under50), from50: intOf(prices[0]?.from50), from100: intOf(prices[0]?.from100), from200: intOf(prices[0]?.from200) },
    few: intOf(few[0]?.n),
    remote: intOf(remote[0]?.n),
  };
}

/** One section per neighborhood with matching tasks (most first, then by name), remote work last; the first few rows of each. */
export async function boardSections(database: Db, query: TaskBoardQueryState, scope: Scope, areaRows: { id: string; slug: string; name: string }[]): Promise<TaskBoardSection[]> {
  const where = and(...boardConditions(query, scope));
  const partition = sql`coalesce(${tasks.publicAreaId}, 'remote')`;
  const ranked = database
    .select({
      id: tasks.id,
      areaId: tasks.publicAreaId,
      rank: sql<number>`row_number() over (partition by ${partition} order by ${sql.join(boardOrder(query.sort), sql`, `)})`.as('rank'),
      total: sql<number>`count(*) over (partition by ${partition})`.as('total'),
    })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(where)
    .as('ranked');
  const top = await database.select().from(ranked).where(lte(ranked.rank, SECTION_SIZE)).orderBy(asc(ranked.rank));
  if (top.length === 0) return [];
  const rows = await selectPublic(database).where(inArray(tasks.id, top.map((row) => row.id)));
  const views = new Map(rows.map((row) => [row.id, toTaskPublicView(toRow(row))]));
  const byArea = new Map(areaRows.map((area) => [area.id, area]));
  const sections = new Map<string, TaskBoardSection>();
  for (const row of top) {
    const view = views.get(row.id);
    if (!view) continue;
    const area = row.areaId ? byArea.get(row.areaId) : undefined;
    const key = area ? area.slug : 'remote';
    const section = sections.get(key) ?? { key, kind: area ? 'area' : 'remote', ...(area ? { areaSlug: area.slug, areaName: area.name } : {}), count: Number(row.total), tasks: [] as TaskPublicView[] };
    section.tasks.push(view);
    sections.set(key, section);
  }
  return [...sections.values()].sort((a, b) => (a.kind === 'remote' ? 1 : 0) - (b.kind === 'remote' ? 1 : 0) || b.count - a.count || (a.areaName ?? '').localeCompare(b.areaName ?? ''));
}

/** Real counts for the market: open tasks, and the ones posted since midnight (market time). */
export async function boardStats(database: Db, marketId: string, now: Date): Promise<TaskBoardPageData['stats']> {
  const midnight = new Date(marketLocalToUtc(marketDayKey(now), '00:00'));
  const [row] = await database
    .select({ open: count(), today: sql<number>`coalesce(sum(case when ${tasks.publishedAt} >= ${midnight} then 1 else 0 end), 0)::int` })
    .from(tasks)
    .where(and(...openIn(marketId, now)));
  return { openCount: intOf(row?.open), postedToday: intOf(row?.today) };
}

/**
 * Everything the board shows for one market and filter set. `category` fixes the category (b7's
 * /[market]/tasks/[category] hub pages), `heading` replaces the board's own title and intro.
 */
export async function loadTaskBoard(
  marketSlug: string,
  query: TaskBoardQueryState,
  options: { category?: CategorySlug; heading?: { title: string; intro: string } } = {},
): Promise<{ data: TaskBoardPageData; now: ISODateTime } | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(`market:${marketSlug}`, 'tasks');
  const market = await findPublicMarket(marketSlug);
  if (!market) return null;
  const now = new Date();
  const effective: TaskBoardQueryState = options.category && options.category !== query.category ? { ...query, category: options.category, type: undefined } : query;
  const areaRows = await db.select({ id: areas.id, slug: areas.slug, name: areas.name }).from(areas).where(eq(areas.marketId, market.id));
  const areaIds = new Map(areaRows.map((area) => [area.slug, area.id]));
  const scope: Scope = { marketId: market.id, now, areaIds };
  // By neighborhood across several (or all) of them; one neighborhood, by day, or one list are paged instead.
  const sectioned = effective.group === 'area' && effective.areas.length !== 1;
  const [view, categoryViews, facets, stats, listing] = await Promise.all([
    getMarketView(market),
    listCategoryViews(market.id),
    boardFacets(db, effective, scope, areaRows),
    boardStats(db, market.id, now),
    sectioned
      ? boardSections(db, effective, scope, areaRows).then((sections) => ({ sections, tasks: sections.flatMap((section) => section.tasks), totalCount: sections.reduce((sum, section) => sum + section.count, 0) }))
      : listBoardTasks(db, { marketId: market.id, query: effective, now, areaIds }).then((page) => ({ sections: undefined, ...page })),
  ]);
  return {
    data: {
      market: view,
      categories: categoryViews,
      query: effective,
      tasks: listing.tasks,
      ...(listing.sections ? { sections: listing.sections } : {}),
      totalCount: listing.totalCount,
      pageCount: listing.sections ? 1 : Math.max(1, Math.ceil(listing.totalCount / BOARD_PAGE_SIZE)),
      facets,
      stats,
      today: marketDayKey(now),
      ...(options.heading ? { heading: options.heading } : {}),
    },
    now: now.toISOString(),
  };
}
