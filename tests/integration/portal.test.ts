import { and, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { routes } from '@/contracts';
import { getPortal, getPortalMore } from '@/modules/community/portal';
import { communityPosts, communitySaves } from '@/modules/community/schema';
import { communityPostForTask, createCommunityPost, getCommunityPost, linkCommunityPostToTask, moderateCommunityItem, saveCommunityPost } from '@/modules/community/service';
import { blocks } from '@/modules/messaging/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

/**
 * The neighborhood portal (completion plan 9.10) on the seeded Austin people: Ben (who posted the seeded leaf
 * cleanup) asks and posts here, Lee (helper) and Maya (poster) read, Taylor (trust and safety) moderates. Its own
 * posts and copies of Ben's task, found by unique titles, since other test files share the database (community.test.ts
 * posts as Maya, so Ben posts here and neither runs into the other's daily limit).
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
const now = new Date();
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const maya = { id: 'usr_maya', staff: null };
const lee = { id: 'usr_lee', staff: null };
const ben = { id: 'usr_ben', staff: null };
const taylor = { id: 'usr_taylor', roles: ['trust_safety' as const] };
const taskId = `tsk_portal_${run}`;
const askTaskId = `tsk_portal_ask_${run}`;
const mayaTaskId = `tsk_portal_maya_${run}`;
const all = (extra: Record<string, string> = {}) => ({ area: 'all', sort: 'new', ...extra });
const items = async (viewer: { id: string; staff: null }, params: Record<string, string>) => (await getPortal(db, viewer, params, now))?.items ?? [];

async function post(viewer: { id: string; staff: null }, title: string, kind: 'recommendation' | 'question' | 'tip' = 'recommendation') {
  const result = await createCommunityPost(db, viewer, { kind, title, body: 'Looking for someone careful with a flat-pack desk this weekend.', categorySlug: 'furniture-assembly' }, now);
  expect(result).toMatchObject({ ok: true });
  return (result as { redirectTo: string }).redirectTo.split('/').at(-1)!;
}

beforeAll(async () => {
  const [yard] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_yard'));
  if (!yard) throw new Error('The seeded yard task is missing');
  const open = { status: 'open', version: 1, publishedAt: now, createdAt: now, windowStart: new Date(now.getTime() + 2 * 86_400_000), windowEnd: new Date(now.getTime() + 2 * 86_400_000 + 3 * 3_600_000), hiddenAt: null, offerCount: 0 };
  await db.insert(tasks).values([
    { ...yard, ...open, id: taskId, slug: `portal-${taskId}`, title: `Portal leaves ${run}` },
    { ...yard, ...open, id: askTaskId, slug: `portal-${askTaskId}`, title: `Portal desk ${run}`, description: 'A flat-pack desk to put together, about 40 parts.' },
    { ...yard, ...open, id: mayaTaskId, slug: `portal-${mayaTaskId}`, title: `Portal shelf ${run}`, description: 'A bookshelf to anchor to the wall.', posterUserId: 'usr_maya' },
  ]);
});

afterAll(async () => {
  await db.update(communityPosts).set({ taskId: null }).where(like(communityPosts.title, `%${run}%`));
  await db.delete(tasks).where(like(tasks.id, `tsk_portal_%${run}`));
  await pool.end();
});

describe('the neighborhood portal', () => {
  it('keeps posts on Neighbors and tasks on Open tasks, each task opening where it should for the viewer (2026-11-24)', async () => {
    const postId = await post(ben, `Portal desk help ${run}`);
    // Neighbors: the posts only, its counts too; the place's tasks show once, in "Open tasks near you".
    const neighbors = await getPortal(db, lee, all(), now);
    expect(neighbors?.items.some((item) => item.type === 'post' && item.id === postId)).toBe(true);
    expect(neighbors?.items.every((item) => item.type === 'post')).toBe(true);
    expect(neighbors?.facets.types.task).toBe(0);
    expect(neighbors?.facets.types.all).toBe(neighbors?.totalCount);
    expect(neighbors?.openTasks?.items.some((view) => view.task.id === taskId)).toBe(true);
    expect(neighbors?.stats.openTasks).toBeGreaterThanOrEqual(1);
    const forLee = await items(lee, all({ type: 'task' }));
    expect(forLee.some((item) => item.type === 'post')).toBe(false);
    const leeTask = forLee.find((item) => item.type === 'task' && item.id === taskId);
    // Lee helps with furniture and computers: find work's answer for a yard job is that he doesn't offer it (audit M23).
    expect(leeTask?.type === 'task' && leeTask.task).toMatchObject({ relation: 'helper', href: routes.app.findWorkTask(taskId), blockedReason: 'category_not_offered' });
    const mayaTask = (await items(maya, all({ type: 'task' }))).find((item) => item.type === 'task' && item.id === taskId);
    expect(mayaTask?.type === 'task' && mayaTask.task).toMatchObject({ relation: 'neighbor', href: routes.publicTask(`portal-${taskId}`) });
    expect(mayaTask?.type === 'task' && mayaTask.task.blockedReason).toBeUndefined();
    // Ben's own task isn't in his stream or its counts: it waits in Your stuff (audit M20).
    const forBen = await getPortal(db, ben, all({ type: 'task' }), now);
    expect(forBen?.items.some((item) => item.type === 'task' && item.id === taskId)).toBe(false);
    expect(forBen?.rail.yourTasks.map((task) => task.id)).toContain(taskId);
    // Tasks never name more than the neighborhood.
    expect(JSON.stringify(leeTask)).not.toMatch(/line1|zip|accessNotes/);
  });

  it('filters by type and counts each type with the other filters, each tab its own', async () => {
    const page = await getPortal(db, lee, all({ type: 'task' }), now);
    expect(page?.items.every((item) => item.type === 'task')).toBe(true);
    expect(page?.facets.types.task).toBe(page?.totalCount);
    // Open tasks counts tasks only, its neighborhoods' too.
    expect(page?.facets.types.all).toBe(page?.facets.types.task);
    expect(page?.facets.types.recommendation).toBe(0);
    expect(page?.areas.reduce((sum, area) => sum + area.count, 0)).toBeLessThanOrEqual(page?.facets.all ?? 0);
    const posts = await items(lee, all({ type: 'recommendation' }));
    expect(posts.every((item) => item.type === 'post' && item.post.kind === 'recommendation')).toBe(true);
    // The words find the task on its tab, not on Neighbors.
    expect((await items(lee, all({ type: 'task', q: `leaves ${run}` }))).map((item) => item.id)).toEqual([taskId]);
    expect(await items(lee, all({ q: `leaves ${run}` }))).toEqual([]);
  });

  it('lists by neighborhood with counts, citywide last, and pages the rest without repeats', async () => {
    const list = await getPortal(db, lee, all({ view: 'list' }), now);
    expect(list?.sections?.length).toBeGreaterThan(0);
    expect(list?.sections?.every((section, index, sections) => section.kind !== 'market' || index === sections.length - 1)).toBe(true);
    expect(list?.sections?.every((section) => section.items.length <= 5 && section.count >= section.items.length)).toBe(true);
    const first = await getPortal(db, lee, all(), now);
    if ((first?.pageCount ?? 1) > 1) {
      const more = await getPortalMore(db, lee, { area: 'all', sort: 'new', page: 2 }, now);
      const seen = new Set(first!.items.map((item) => `${item.type}:${item.id}`));
      expect(more?.items.some((item) => seen.has(`${item.type}:${item.id}`))).toBe(false);
    }
  });

  it('lists only what belongs to no neighborhood under area=citywide, by day, with the market’s helpers (sweep P10)', async () => {
    const citywide = await getPortal(db, lee, { area: 'citywide', view: 'list' }, now);
    expect(citywide?.place).toEqual({ kind: 'citywide' });
    expect(citywide?.sections).toBeUndefined();
    for (const item of citywide?.items ?? []) {
      if (item.type === 'post') expect(item.post.areaSlug).toBeUndefined();
      else expect(item.task.task.location.kind).toBe('remote');
    }
    // The same items as the List's "Across {market}" section, which links here.
    const sections = await getPortal(db, lee, all({ view: 'list', sort: 'hot' }), now);
    const across = sections?.sections?.find((section) => section.kind === 'market');
    expect(citywide?.totalCount ?? 0).toBe(across?.count ?? 0);
    // Citywide work is anyone's in the market: the rail counts the market's helpers.
    const market = await getPortal(db, lee, all(), now);
    expect(citywide?.stats.helpers).toBe(market?.stats.helpers);
  });

  it('saves a post for later, and Saved reads through the hidden and blocked rules', async () => {
    const postId = await post(ben, `Portal saved ${run}`, 'tip');
    expect(await saveCommunityPost(db, lee, { postId, saved: true }, now)).toMatchObject({ ok: true });
    expect(await saveCommunityPost(db, lee, { postId, saved: true }, now)).toMatchObject({ ok: true });
    let saved = await getPortal(db, lee, all({ saved: '1' }), now);
    expect(saved?.items.find((item) => item.id === postId)).toMatchObject({ type: 'post', post: { saved: true } });
    expect(saved?.facets.saved).toBeGreaterThanOrEqual(1);
    // Someone blocked, either way: out of Saved and its count.
    await db.insert(blocks).values({ blockerId: 'usr_ben', blockedId: 'usr_lee', createdAt: now }).onConflictDoNothing();
    try {
      saved = await getPortal(db, lee, all({ saved: '1' }), now);
      expect(saved?.items.some((item) => item.id === postId)).toBe(false);
      expect(await saveCommunityPost(db, lee, { postId, saved: true }, now)).toMatchObject({ ok: false, code: 'not_found' });
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, 'usr_ben'), eq(blocks.blockedId, 'usr_lee')));
    }
    // Hidden by staff: out of Saved for members.
    await moderateCommunityItem(db, taylor, 'post', postId, { action: 'hide', reason: 'Checking saved posts' }, now);
    saved = await getPortal(db, lee, all({ saved: '1' }), now);
    expect(saved?.items.some((item) => item.id === postId)).toBe(false);
    expect(await saveCommunityPost(db, lee, { postId, saved: false }, now)).toMatchObject({ ok: true });
    expect(await db.select().from(communitySaves).where(and(eq(communitySaves.userId, 'usr_lee'), eq(communitySaves.postId, postId)))).toHaveLength(0);
  });

  it('turns the author’s own ask into a task draft and links the two both ways, once', async () => {
    const postId = await post(ben, `Portal ask ${run}`);
    const mine = (await items(ben, all())).find((item) => item.id === postId);
    expect(mine?.type === 'post' && mine.post.askForHelpHref).toBe(routes.app.newTask({ fromPost: postId }));
    const theirs = (await items(lee, all())).find((item) => item.id === postId);
    expect(theirs?.type === 'post' && theirs.post.askForHelpHref).toBeUndefined();
    expect(await communityPostForTask(db, 'usr_lee', postId)).toBeNull();
    expect(await communityPostForTask(db, 'usr_ben', postId)).toMatchObject({ id: postId, title: `Portal ask ${run}`, categorySlug: 'furniture-assembly' });

    // Only the author's own post, the poster's own task, and only once.
    expect(await linkCommunityPostToTask(db, 'usr_lee', postId, askTaskId, now)).toBe(false);
    expect(await linkCommunityPostToTask(db, 'usr_ben', postId, mayaTaskId, now)).toBe(false);
    expect(await linkCommunityPostToTask(db, 'usr_ben', postId, askTaskId, now)).toBe(true);
    expect(await linkCommunityPostToTask(db, 'usr_ben', postId, taskId, now)).toBe(false);
    const page = await getCommunityPost(db, ben, postId, now);
    expect(page?.post.task).toMatchObject({ id: askTaskId, state: 'open', href: routes.app.task(askTaskId) });
    expect(page?.post.askForHelpHref).toBeUndefined();
    const task = (await items(lee, all({ type: 'task' }))).find((item) => item.id === askTaskId);
    expect(task?.type === 'task' && task.task.fromPost).toEqual({ id: postId, title: `Portal ask ${run}` });

    // A canceled task keeps its link, closed.
    await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, askTaskId));
    expect((await getCommunityPost(db, lee, postId, now))?.post.task).toMatchObject({ state: 'closed' });
  });

  it('opens Open tasks as the board does: its sorts, the board’s filters and their counts, and a look from Neighbors (2026-11-23)', async () => {
    const [yard] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_yard'));
    if (!yard) throw new Error('The seeded yard task is missing');
    // Two of Ben's, three days out on Austin's clock (UTC−6 in November): a cheap fixed price on a morning (9 to 11 a.m.),
    // and a dear hourly one ($50 × 4 hours) on an evening (5:30 to 7:30 p.m.) a day later, already with three offers.
    const day = new Date(now.getTime() + 3 * 86_400_000);
    day.setUTCHours(0, 0, 0, 0);
    const at = (hours: number) => new Date(day.getTime() + hours * 3_600_000);
    const cheapId = `tsk_portal_cheap_${run}`;
    const dearId = `tsk_portal_dear_${run}`;
    const copy = { ...yard, status: 'open', version: 1, publishedAt: now, createdAt: now, hiddenAt: null, flexible: false, description: 'A flat-pack shelf to put together.' };
    await db.insert(tasks).values([
      { ...copy, id: cheapId, slug: `portal-${cheapId}`, title: `Portal filters ${run} cheap`, pricingType: 'fixed', budgetCents: 3000, hourlyRateCents: null, estimatedHours: null, windowStart: at(15), windowEnd: at(17), offerCount: 0 },
      { ...copy, id: dearId, slug: `portal-${dearId}`, title: `Portal filters ${run} dear`, pricingType: 'hourly', budgetCents: null, hourlyRateCents: 5000, estimatedHours: 4, hoursCap: 5, windowStart: at(47.5), windowEnd: at(49.5), offerCount: 3 },
    ]);
    const open = async (extra: Record<string, string>) => (await getPortal(db, lee, all({ type: 'task', sort: 'soonest', q: `filters ${run}`, ...extra }), now))!;
    const ids = async (extra: Record<string, string>) => (await open(extra)).items.map((item) => item.id);

    // Its defaults: the List, soonest first; and the board's sorts.
    const tab = await getPortal(db, lee, { type: 'task' }, now);
    expect(tab?.query).toMatchObject({ type: 'task', sort: 'soonest', view: 'list' });
    expect(await ids({})).toEqual([cheapId, dearId]);
    expect(await ids({ sort: 'price_high' })).toEqual([dearId, cheapId]);
    expect(await ids({ sort: 'price_low' })).toEqual([cheapId, dearId]);
    // By the day they're on: the soonest day first, whatever the sort within a day.
    expect(await ids({ sort: 'price_high', group: 'day' })).toEqual([cheapId, dearId]);

    // The board's filters: the price (a fixed price, or the rate × the hours), fixed or hourly, the time of day, few offers.
    expect(await ids({ min: '100' })).toEqual([dearId]);
    expect(await ids({ max: '50' })).toEqual([cheapId]);
    expect(await ids({ pricing: 'hourly' })).toEqual([dearId]);
    expect(await ids({ slot: 'morning' })).toEqual([cheapId]);
    expect(await ids({ slot: 'evening' })).toEqual([dearId]);
    expect(await ids({ few: '1' })).toEqual([cheapId]);
    // Each counted with the others, its own left out.
    expect((await open({ few: '1' })).facets.tasks).toMatchObject({ prices: { under50: 1, from200: 0 }, pricing: { fixed: 1, hourly: 0 }, slots: { morning: 1, evening: 0 }, few: 1 });
    expect((await open({})).facets.tasks).toMatchObject({ prices: { under50: 1, from200: 1 }, pricing: { fixed: 1, hourly: 1 }, slots: { morning: 1, evening: 1 }, few: 1 });
    // "Show more" reads the same filters.
    const more = await getPortalMore(db, lee, { area: 'all', type: 'task', q: `filters ${run}`, minPrice: 100, group: 'day', page: 1 }, now);
    expect(more?.items.map((item) => item.id)).toEqual([dearId]);
    // Neighbors holds no tasks, whatever the board's filters say; the public board's link carries them for "Save this search".
    expect((await getPortal(db, lee, all({ q: `filters ${run}`, min: '100' }), now))?.items).toEqual([]);
    expect((await open({ min: '100', slot: 'evening' })).boardHref).toMatch(/min=100.*time=evening/);

    // From Neighbors, the place's newest open tasks, counted as the heading counts them; never the viewer's own.
    const neighbors = await getPortal(db, lee, all(), now);
    const preview = neighbors?.openTasks?.items ?? [];
    expect(preview.length).toBeGreaterThan(0);
    expect(preview.length).toBeLessThanOrEqual(5);
    expect(preview.map((view) => view.task.postedAt)).toEqual(preview.map((view) => view.task.postedAt).sort().reverse());
    expect(neighbors?.openTasks?.count).toBe(neighbors?.stats.openTasks);
    const forBen = await getPortal(db, ben, all(), now);
    expect(forBen?.openTasks?.items.some((view) => view.task.id === cheapId || view.task.id === dearId)).toBe(false);
    // Open tasks is that list itself.
    expect(tab?.openTasks).toBeUndefined();
  });
});
