import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TaskBoardQueryState, TaskPublicView } from '@/contracts';
import { areas } from '@/modules/markets/schema';
import { boardFacets, boardSections, boardStats } from '@/modules/tasks/board';
import { parseTaskBoardQuery } from '@/modules/tasks/projections';
import { listBoardTasks } from '@/modules/tasks/queries';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { marketClockTime, marketDayKey, marketLocalToUtc } from '@/shared/format';
import { taskTypeOf } from '@/shared/task-types';

/**
 * The Craigslist-style board (completion plan 7.4) against the seeded Austin market: every facet count equals
 * the number of tasks its filter shows, sections group by neighborhood with their counts, and the filters do
 * what they say (keywords literally, prices inclusive, times of day in Central time, task types from details).
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
const marketId = 'mkt_austin';
const now = new Date();
let areaRows: { id: string; slug: string; name: string }[] = [];
let areaIds = new Map<string, string>();
let all: TaskPublicView[] = [];
let rows: (typeof tasks.$inferSelect)[] = [];

const query = (params: Record<string, string> = {}): TaskBoardQueryState => parseTaskBoardQuery(params);
const scope = () => ({ marketId, now, areaIds });
async function total(params: Record<string, string>): Promise<number> {
  return (await listBoardTasks(db, { marketId, query: query(params), now, areaIds })).totalCount;
}

beforeAll(async () => {
  areaRows = await db.select({ id: areas.id, slug: areas.slug, name: areas.name }).from(areas).where(eq(areas.marketId, marketId));
  areaIds = new Map(areaRows.map((area) => [area.slug, area.id]));
  all = (await listBoardTasks(db, { marketId, query: query({ group: 'none' }), now, areaIds })).tasks;
  rows = await db.select().from(tasks).where(and(eq(tasks.marketId, marketId), eq(tasks.status, 'open')));
  expect(all.length).toBeGreaterThan(3);
});

afterAll(() => pool.end());

describe('the task board', () => {
  it('counts every option as the list it opens would show', async () => {
    const facets = await boardFacets(db, query(), scope(), areaRows);
    for (const [category, count] of Object.entries(facets.categories)) expect(await total({ category }), category).toBe(count);
    for (const area of facets.areas) expect(await total({ area: area.slug }), area.slug).toBe(area.count);
    expect(await total({ pricing: 'fixed' })).toBe(facets.pricing.fixed);
    expect(await total({ pricing: 'hourly' })).toBe(facets.pricing.hourly);
    expect(await total({ few: '1' })).toBe(facets.few);
    expect(await total({ remote: '1' })).toBe(facets.remote);
    for (const posted of ['24h', '3d', '7d'] as const) expect(await total({ posted })).toBe(facets.posted[posted]);
    for (const time of ['morning', 'afternoon', 'evening'] as const) expect(await total({ time })).toBe(facets.times[time]);
    for (const when of ['today', 'this_week', 'this_weekend'] as const) expect(await total({ when })).toBe(facets.when[when]);
    expect(await total({ max: '49' })).toBe(facets.prices.under50);
    expect(await total({ min: '200' })).toBe(facets.prices.from200);
    expect(Object.values(facets.categories).reduce((sum, count) => sum + count, 0)).toBe(all.length);
  });

  it('leaves a facet’s own filter out of its counts, and keeps the others', async () => {
    const facets = await boardFacets(db, query({ category: 'furniture-assembly', pricing: 'fixed' }), scope(), areaRows);
    // Categories ignore the category filter but keep the pricing one.
    expect(facets.categories['furniture-assembly']).toBe(await total({ category: 'furniture-assembly', pricing: 'fixed' }));
    // Task types are counted within the category, from the tasks' own details.
    const furniture = rows.filter((row) => all.some((task) => task.id === row.id && task.categorySlug === 'furniture-assembly' && task.budget.type === 'fixed'));
    for (const type of facets.types) expect(type.count, type.slug).toBe(furniture.filter((row) => taskTypeOf('furniture-assembly', row.details) === type.slug).length);
  });

  it('finds keywords in titles and descriptions, literally', async () => {
    const found = (await listBoardTasks(db, { marketId, query: query({ q: 'DESK', group: 'none' }), now, areaIds })).tasks;
    expect(found.length).toBeGreaterThan(0);
    for (const task of found) expect(`${task.title} ${rows.find((row) => row.id === task.id)!.description}`.toLowerCase()).toContain('desk');
    expect(await total({ q: '%' })).toBe(0);
    expect(await total({ q: '_' })).toBe(0);
  });

  it('filters prices inclusively and times of day in Central time', async () => {
    const priced = (await listBoardTasks(db, { marketId, query: query({ min: '60', max: '120', group: 'none' }), now, areaIds })).tasks;
    for (const task of priced) {
      const cents = task.budget.type === 'fixed' ? task.budget.priceCents : Math.round(task.budget.rateCents * task.budget.estimatedHours);
      expect(cents).toBeGreaterThanOrEqual(6000);
      expect(cents).toBeLessThanOrEqual(12000);
    }
    const mornings = (await listBoardTasks(db, { marketId, query: query({ time: 'morning', group: 'none' }), now, areaIds })).tasks;
    for (const task of mornings) expect(task.schedule.flexible || marketClockTime(task.schedule.windowStart) < '12:00').toBe(true);
  });

  it('groups by neighborhood: a few rows each, most tasks first, remote work last', async () => {
    const sections = await boardSections(db, query(), scope(), areaRows);
    const facets = await boardFacets(db, query(), scope(), areaRows);
    expect(sections.reduce((sum, section) => sum + section.count, 0)).toBe(all.length);
    for (const section of sections) {
      expect(section.tasks.length).toBeLessThanOrEqual(5);
      expect(section.tasks.length).toBe(Math.min(5, section.count));
      if (section.kind === 'area') expect(section.count).toBe(facets.areas.find((area) => area.slug === section.areaSlug)!.count);
      const starts = section.tasks.map((task) => task.schedule.windowStart);
      expect([...starts].sort()).toEqual(starts);
    }
    const local = sections.filter((section) => section.kind === 'area').map((section) => section.count);
    expect([...local].sort((a, b) => b - a)).toEqual(local);
    const remoteAt = sections.findIndex((section) => section.kind === 'remote');
    if (remoteAt >= 0) expect(remoteAt).toBe(sections.length - 1);
  });

  it('counts the market’s open tasks and the ones posted since midnight', async () => {
    const stats = await boardStats(db, marketId, now);
    expect(stats.openCount).toBe(all.length);
    const midnight = new Date(marketLocalToUtc(marketDayKey(now), '00:00'));
    expect(stats.postedToday).toBe(all.filter((task) => new Date(task.postedAt) >= midnight).length);
  });
});
