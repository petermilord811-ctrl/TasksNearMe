import { and, count, eq, inArray, isNotNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { communityPosts } from '@/modules/community/schema';
import { recommendedByCounts } from '@/modules/community/service';
import {
  getCategoryPageData,
  getCategorySupply,
  getHelperProfilePageData,
  getHomePageData,
  getMarketPageData,
  getPublicTaskPageData,
  getTaskBoardPageData,
  getWaitlistPageData,
  listHelperHandles,
  listRecentTaskSlugs,
} from '@/modules/marketing/queries';
import { areas, markets } from '@/modules/markets/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { reviews } from '@/modules/reviews/schema';
import { loadSitemapEntries } from '@/modules/seo/sitemap';
import { parseTaskBoardQuery } from '@/modules/tasks/projections';
import { tasks } from '@/modules/tasks/schema';
import { newId } from '@/platform/db/ids';
import { isRealRecordId, isSampleId, realRowsOnly, rowsFor, searchEngineRows } from '@/shared/sample-data';

/**
 * Sample rows on public pages (owner, 2026-11-17; src/shared/sample-data.ts). Next to the base seed's people and
 * tasks, this file makes a real helper, a real client and a real open task (ids from newId), then reads the public
 * pages' data as a production build would: the public gets the real rows only, with counts and ratings from real
 * rows; signed-in testers get the samples too; what search engines read is the public's, whoever asks.
 *
 * The switch is on in production builds only (devHelpersOn() is true here), so `rowsFor(audience, true)` turns it on.
 * The cached reads use the app's database client and next/cache, so both are swapped for this file.
 *
 * The home page, the prebuilt task pages and the sitemap follow the default market, so this file makes it Austin,
 * where the base seed's cast lives (production's first city, Gainesville, has no seeded helpers).
 */

const PREVIOUS_DEFAULT_MARKET = vi.hoisted(() => {
  const previous = process.env.DEFAULT_MARKET_SLUG;
  process.env.DEFAULT_MARKET_SLUG = 'austin';
  return previous;
});
const { db, pool } = await vi.hoisted(async () => {
  const { createDb } = await import('@/platform/db/connect');
  return createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
});
vi.mock('@/platform/db/client', () => ({ db }));
vi.mock('next/cache', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/cache')>()), cacheLife: () => undefined, cacheTag: () => undefined }));

const HIDING = true;
const PUBLIC = rowsFor('public', HIDING);
const TESTERS = rowsFor('testers', HIDING);
const SEARCH = searchEngineRows(HIDING);
const MARKET = 'austin';
const CATEGORY = 'furniture-assembly';
const HOUR = 3_600_000;

const helperId = newId('usr');
const clientId = newId('usr');
const taskId = newId('tsk');
const suffix = taskId.slice(-8);
const handle = `real-helper-${suffix}`;
const taskSlug = `real-desk-${suffix}`;
const reviewIds = [newId('rev'), newId('rev')];
const postIds = [newId('cpo'), newId('cpo')];
let sampleHandle = '';
let sampleSlug = '';

beforeAll(async () => {
  const [sam] = await db.select().from(users).where(eq(users.id, 'usr_sam'));
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [review] = await db.select().from(reviews).where(eq(reviews.authorUserId, 'usr_maya')).limit(1);
  const services = await db.select().from(helperServices).where(eq(helperServices.userId, 'usr_sam'));
  if (!sam || !maya || !profile || !desk || !review || services.length === 0) throw new Error('The seeded Sam, Maya, desk or review is missing');
  sampleHandle = profile.handle;
  sampleSlug = desk.slug;
  const now = Date.now();

  await db.insert(users).values([
    { ...sam, id: helperId, email: `${helperId}@example.test`, phone: null, phoneVerifiedAt: null, name: 'Rhea R.', firstName: 'Rhea', lastName: 'Real' },
    { ...maya, id: clientId, email: `${clientId}@example.test`, phone: null, phoneVerifiedAt: null },
  ]);
  // The top of every list it's in: more completed tasks than any seeded helper.
  await db.insert(helperProfiles).values({ ...profile, userId: helperId, handle, foundingNumber: null, completedCount: 500, ratingCount: 2, ratingAverage: 4.5 });
  await db.insert(helperServices).values(services.map((service) => ({ ...service, id: newId('hsv'), userId: helperId })));
  await db.insert(tasks).values({
    ...desk,
    id: taskId,
    slug: taskSlug,
    posterUserId: clientId,
    status: 'open',
    offerCount: 0,
    hiddenAt: null,
    windowStart: new Date(now + 48 * HOUR),
    windowEnd: new Date(now + 51 * HOUR),
    publishedAt: new Date(now),
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });
  // A review of the real helper from the real client, and one from a sample client (it can't happen in production).
  await db.insert(reviews).values([
    { ...review, id: reviewIds[0]!, bookingId: null, authorUserId: clientId, subjectUserId: helperId, direction: 'client_to_helper', status: 'published', publishedAt: new Date(now) },
    { ...review, id: reviewIds[1]!, bookingId: null, authorUserId: 'usr_maya', subjectUserId: helperId, direction: 'client_to_helper', status: 'published', publishedAt: new Date(now) },
  ]);
  // Thanks posts naming the real helper, from the real client and from a sample one.
  await db.insert(communityPosts).values(
    [clientId, 'usr_maya'].map((authorUserId, index) => ({ id: postIds[index]!, marketId: 'mkt_austin', authorUserId, kind: 'thanks', helperUserId: helperId, title: 'Thank you', body: 'Quick and careful.', status: 'visible' })),
  );
});

afterAll(async () => {
  await db.delete(communityPosts).where(inArray(communityPosts.id, postIds));
  await db.delete(reviews).where(inArray(reviews.id, reviewIds));
  await db.delete(tasks).where(eq(tasks.id, taskId));
  await db.delete(helperServices).where(eq(helperServices.userId, helperId));
  await db.delete(helperProfiles).where(eq(helperProfiles.userId, helperId));
  await db.delete(users).where(inArray(users.id, [helperId, clientId]));
  await pool.end();
  if (PREVIOUS_DEFAULT_MARKET === undefined) delete process.env.DEFAULT_MARKET_SLUG;
  else process.env.DEFAULT_MARKET_SLUG = PREVIOUS_DEFAULT_MARKET;
});

const allReal = (ids: string[]) => ids.every(isRealRecordId);
const someSample = (ids: string[]) => ids.some(isSampleId);

/** Austin's active, ID-verified helpers, real ones only or all. */
async function verifiedHelpers(realOnly: boolean): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(and(eq(areas.marketId, 'mkt_austin'), eq(helperProfiles.status, 'active'), isNotNull(helperProfiles.idVerifiedAt), eq(users.status, 'active'), realOnly ? realRowsOnly(users.id) : undefined));
  return row?.value ?? 0;
}

describe('the audiences', () => {
  it('reads real rows for the public and every row for testers where samples are hidden; search engines read the public', () => {
    expect(PUBLIC).toBe('real');
    expect(TESTERS).toBe('all');
    expect(SEARCH).toBe('real');
  });
});

describe('the market and home pages', () => {
  it('feature real helpers and real tasks only for the public, and the samples too for testers', async () => {
    const shown = (await getMarketPageData(MARKET, PUBLIC))!.data;
    expect(allReal(shown.featuredHelpers.map((helper) => helper.id))).toBe(true);
    expect(allReal(shown.recentTasks.map((task) => task.id))).toBe(true);
    expect(shown.featuredHelpers[0]).toMatchObject({ id: helperId, displayName: 'Rhea R.', completedCount: 500, rating: { average: 4.5, count: 2 } });
    expect(shown.recentTasks.map((task) => task.id)).toContain(taskId);

    const testers = (await getMarketPageData(MARKET, TESTERS))!.data;
    expect(testers.featuredHelpers.map((helper) => helper.id)).toContain(helperId);
    expect(someSample(testers.featuredHelpers.map((helper) => helper.id))).toBe(true);
  });

  it("counts real verified helpers only in the public's hero, and pins real tasks only on its map", async () => {
    const shown = (await getHomePageData(PUBLIC))!.data;
    expect(shown.helpers.verified).toBe(await verifiedHelpers(true));
    expect(shown.helpers.verified).toBeGreaterThanOrEqual(1);
    expect(allReal(shown.map.pins.map((pin) => pin.id))).toBe(true);
    expect(shown.map.pins.map((pin) => pin.id)).toContain(taskId);
    expect(allReal(shown.featuredHelpers.map((helper) => helper.id))).toBe(true);
    // Configuration is never filtered: the same areas and categories for both.
    const testers = (await getHomePageData(TESTERS))!.data;
    expect(testers.helpers.verified).toBe(await verifiedHelpers(false));
    expect(testers.helpers.verified).toBeGreaterThan(shown.helpers.verified);
    expect(testers.map.pins.map((pin) => pin.id)).toContain(taskId);
    expect(shown.map.areas).toEqual(testers.map.areas);
    expect(shown.categories).toEqual(testers.categories);
  });
});

describe('the category page', () => {
  it("lists real helpers and tasks for the public, and states real counts to everyone", async () => {
    const shown = (await getCategoryPageData(MARKET, CATEGORY, PUBLIC))!.data;
    expect(allReal([...shown.topHelpers.map((helper) => helper.id), ...shown.recentTasks.map((task) => task.id)])).toBe(true);
    expect(shown.topHelpers.map((helper) => helper.id)).toContain(helperId);
    expect(shown.recentTasks.map((task) => task.id)).toContain(taskId);
    const testers = (await getCategoryPageData(MARKET, CATEGORY, TESTERS))!.data;
    expect(someSample(testers.topHelpers.map((helper) => helper.id))).toBe(true);
    expect(shown.category).toEqual(testers.category);

    const supply = await getCategorySupply(MARKET, CATEGORY);
    expect(supply.helperCount).toBeGreaterThanOrEqual(1);
    expect(supply.openTaskCount).toBeGreaterThanOrEqual(1);
  });
});

describe('the task board', () => {
  it("lists and counts real tasks only for the public: rows, sections, facets, type tiles and stats", async () => {
    const realOpen = (await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.marketId, 'mkt_austin'), eq(tasks.status, 'open'), realRowsOnly(tasks.id)))).length;
    // By neighborhood (the default): every section's rows and its "See all N" count.
    const board = (await getTaskBoardPageData(MARKET, parseTaskBoardQuery({}), PUBLIC))!.data;
    const sectioned = (board.sections ?? []).flatMap((section) => section.tasks).map((task) => task.id);
    expect(sectioned.length).toBeGreaterThanOrEqual(1);
    expect(allReal(sectioned)).toBe(true);
    expect(board.stats.openCount).toBeLessThanOrEqual(realOpen);
    expect(board.stats.openCount).toBeGreaterThanOrEqual(1);
    expect(board.totalCount).toBe(board.stats.openCount);
    expect(Object.values(board.facets.categories).reduce((sum, n) => sum + n, 0)).toBe(board.stats.openCount);
    expect(board.facets.areas.reduce((sum, area) => sum + area.count, 0)).toBeLessThanOrEqual(board.stats.openCount);
    // One list, newest first: the real task leads.
    const newest = (await getTaskBoardPageData(MARKET, parseTaskBoardQuery({ group: 'none', sort: 'newest' }), PUBLIC))!.data;
    expect(allReal(newest.tasks.map((task) => task.id))).toBe(true);
    expect(newest.tasks.map((task) => task.id)).toContain(taskId);

    const testers = (await getTaskBoardPageData(MARKET, parseTaskBoardQuery({}), TESTERS))!.data;
    expect(testers.stats.openCount).toBeGreaterThan(board.stats.openCount);
    expect(testers.totalCount).toBe(testers.stats.openCount);

    // The category's type tiles count real tasks only too.
    const hub = (await getTaskBoardPageData(MARKET, parseTaskBoardQuery({ category: CATEGORY, group: 'none' }), PUBLIC))!.data;
    const hubTesters = (await getTaskBoardPageData(MARKET, parseTaskBoardQuery({ category: CATEGORY, group: 'none' }), TESTERS))!.data;
    expect(allReal(hub.tasks.map((task) => task.id))).toBe(true);
    const tiles = (data: typeof hub) => data.facets.types.reduce((sum, type) => sum + type.count, 0);
    expect(tiles(hub)).toBeLessThanOrEqual(hub.totalCount);
    expect(tiles(hubTesters)).toBeGreaterThan(tiles(hub));
  });
});

describe('task pages and helper profiles', () => {
  it('are not found for the public when they are samples, and found for testers', async () => {
    expect(await getPublicTaskPageData(sampleSlug, PUBLIC)).toBeNull();
    expect((await getPublicTaskPageData(sampleSlug, TESTERS))?.data.task.slug).toBe(sampleSlug);
    expect(await getHelperProfilePageData(sampleHandle, PUBLIC)).toBeNull();
    expect((await getHelperProfilePageData(sampleHandle, TESTERS))?.helper.handle).toBe(sampleHandle);
  });

  it('show a real task with real similar tasks, and a real profile with real reviews and recommendations', async () => {
    const task = (await getPublicTaskPageData(taskSlug, PUBLIC))!.data;
    expect(task.task.id).toBe(taskId);
    expect(allReal(task.similarTasks.map((similar) => similar.id))).toBe(true);
    expect((await getPublicTaskPageData(taskSlug, TESTERS))!.data.task.id).toBe(taskId);

    const profile = (await getHelperProfilePageData(handle, PUBLIC))!;
    expect(profile.reviews.map((review) => review.id)).toEqual([reviewIds[0]]);
    expect(profile.helper.recommendedBy).toBe(1);
    const testers = (await getHelperProfilePageData(handle, TESTERS))!;
    expect(testers.reviews.map((review) => review.id).sort()).toEqual([...reviewIds].sort());
    expect(testers.helper.recommendedBy).toBe(2);
    expect(await recommendedByCounts(db, [helperId], 'real')).toEqual(new Map([[helperId, 1]]));
  });

  it("give generateStaticParams the public's slugs and handles", async () => {
    const slugs = await listRecentTaskSlugs(SEARCH, 100);
    expect(slugs).toContain(taskSlug);
    expect(slugs).not.toContain(sampleSlug);
    const handles = await listHelperHandles(SEARCH);
    expect(handles).toContain(handle);
    expect(handles).not.toContain(sampleHandle);
  });
});

describe('the waitlist', () => {
  it("offers the public real service areas only, never the demo marketplace's cities (audit M48)", async () => {
    const demo = { id: 'mkt_demo_zz_sample_rows', slug: 'zz-sample-rows', name: 'Sampleton', state: 'KS', timeZone: 'America/Chicago', status: 'prelaunch', centerLat: 37.7, centerLng: -97.9, serviceRadiusKm: 20, zipPrefixes: ['999'] };
    await db.insert(markets).values(demo);
    try {
      const shown = (await getWaitlistPageData(PUBLIC)).markets.map((market) => market.slug);
      expect(shown).toContain(MARKET);
      expect(shown).not.toContain(demo.slug);
      expect((await getWaitlistPageData(TESTERS)).markets.map((market) => market.slug)).toContain(demo.slug);
    } finally {
      await db.delete(markets).where(eq(markets.id, demo.id));
    }
  });
});

describe('what search engines read', () => {
  it('lists real task pages and profiles only in the sitemap, and the samples nowhere', async () => {
    const paths = (rows: 'real' | 'all') => loadSitemapEntries({ listings: true, rows }).then(({ entries }) => entries.map((entry) => new URL(entry.url).pathname));
    const listed = await paths(SEARCH);
    expect(listed).toContain(`/tasks/${taskSlug}`);
    expect(listed).toContain(`/helpers/${handle}`);
    expect(listed.filter((path) => path === `/tasks/${sampleSlug}` || path === `/helpers/${sampleHandle}`)).toEqual([]);
    const realSlugs = new Set((await db.select({ slug: tasks.slug }).from(tasks).where(realRowsOnly(tasks.id))).map((row) => row.slug));
    for (const path of listed.filter((candidate) => candidate.startsWith('/tasks/'))) expect(realSlugs.has(path.slice('/tasks/'.length)), path).toBe(true);
    // Every row would be listed without hiding (development and the e2e build, which crawlers never read).
    expect(await paths('all')).toContain(`/helpers/${sampleHandle}`);
  });

  it("builds structured data from the public's rows: the real profile, never a sample one", async () => {
    expect(await getHelperProfilePageData(sampleHandle, SEARCH)).toBeNull();
    expect(await getPublicTaskPageData(sampleSlug, SEARCH)).toBeNull();
    expect((await getHelperProfilePageData(handle, SEARCH))?.helper.displayName).toBe('Rhea R.');
  });
});
