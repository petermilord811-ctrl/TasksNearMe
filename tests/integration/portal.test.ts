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
  it('shows posts and open tasks in one stream, each task opening where it should for the viewer', async () => {
    const postId = await post(ben, `Portal desk help ${run}`);
    const forLee = await items(lee, all());
    expect(forLee.some((item) => item.type === 'post' && item.id === postId)).toBe(true);
    const leeTask = forLee.find((item) => item.type === 'task' && item.id === taskId);
    expect(leeTask?.type === 'task' && leeTask.task).toMatchObject({ relation: 'helper', href: routes.app.findWorkTask(taskId) });
    const mayaTask = (await items(maya, all())).find((item) => item.type === 'task' && item.id === taskId);
    expect(mayaTask?.type === 'task' && mayaTask.task).toMatchObject({ relation: 'neighbor', href: routes.publicTask(`portal-${taskId}`) });
    const benTask = (await items(ben, all())).find((item) => item.type === 'task' && item.id === taskId);
    expect(benTask?.type === 'task' && benTask.task).toMatchObject({ relation: 'yours', href: routes.app.task(taskId) });
    // Tasks never name more than the neighborhood.
    expect(JSON.stringify(leeTask)).not.toMatch(/line1|zip|accessNotes/);
  });

  it('filters by type and counts each type with the other filters', async () => {
    const page = await getPortal(db, lee, all({ type: 'task' }), now);
    expect(page?.items.every((item) => item.type === 'task')).toBe(true);
    expect(page?.facets.types.task).toBe(page?.totalCount);
    expect(page?.facets.types.all).toBeGreaterThanOrEqual((page?.facets.types.task ?? 0) + (page?.facets.types.recommendation ?? 0));
    const posts = await items(lee, all({ type: 'recommendation' }));
    expect(posts.every((item) => item.type === 'post' && item.post.kind === 'recommendation')).toBe(true);
    const words = await items(lee, all({ q: `leaves ${run}` }));
    expect(words.map((item) => item.id)).toEqual([taskId]);
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
    const task = (await items(lee, all())).find((item) => item.id === askTaskId);
    expect(task?.type === 'task' && task.task.fromPost).toEqual({ id: postId, title: `Portal ask ${run}` });

    // A canceled task keeps its link, closed.
    await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, askTaskId));
    expect((await getCommunityPost(db, lee, postId, now))?.post.task).toMatchObject({ state: 'closed' });
  });
});
