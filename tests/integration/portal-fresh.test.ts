import { eq, inArray, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { visibleFreshKeys } from '@/modules/community/portal';
import { communityPosts, communityReplies } from '@/modules/community/schema';
import { getCommunityPost } from '@/modules/community/service';
import { blocks } from '@/modules/messaging/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

/**
 * The portal after aa's sweep: the live pill counts only what the reader would see (P5), and a recommended helper
 * the reader blocked, or who blocked them, gets no card (P11).
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
const READER = 'usr_tmp_portal_reader';
const AUTHOR = 'usr_tmp_portal_author';
const BLOCKED = 'usr_tmp_portal_blocked';
const POSTS = { mine: 'cpost_tmp_pf_mine', other: 'cpost_tmp_pf_other', blocked: 'cpost_tmp_pf_blocked', removed: 'cpost_tmp_pf_removed', ask: 'cpost_tmp_pf_ask' };
const TASKS = { mine: 'tsk_tmp_pf_mine', blocked: 'tsk_tmp_pf_blocked', other: 'tsk_tmp_pf_other' };

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  for (const id of [READER, AUTHOR, BLOCKED]) await db.insert(users).values({ ...maya!, id, email: `${id}@example.test`, phone: null, phoneVerifiedAt: null });
  const market = maya!.homeMarketId;
  const post = (id: string, author: string, status = 'visible') => ({ id, marketId: market, authorUserId: author, kind: 'question', title: 'Who fixes fences?', body: 'Looking for someone who fixes fences.', status });
  await db.insert(communityPosts).values([post(POSTS.mine, READER), post(POSTS.other, AUTHOR), post(POSTS.blocked, BLOCKED), post(POSTS.removed, AUTHOR, 'removed'), { ...post(POSTS.ask, AUTHOR), kind: 'recommendation' }]);
  // A reply on the author's ask recommends Jordan, whom the reader blocks.
  await db.insert(communityReplies).values({ id: 'crep_tmp_pf', postId: POSTS.ask, authorUserId: AUTHOR, body: 'Jordan did great work for me.', recommendedHelperUserId: 'usr_jordan' });
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  for (const [id, poster] of [[TASKS.mine, READER], [TASKS.blocked, BLOCKED], [TASKS.other, AUTHOR]] as const) {
    await db.insert(tasks).values({ ...desk!, id, slug: `${id}-slug`, posterUserId: poster, status: 'open', offerCount: 0, version: 1, hiddenAt: null });
  }
  // Blocks both ways count: the reader blocked one person, and Jordan blocked the reader.
  await db.insert(blocks).values([{ blockerId: READER, blockedId: BLOCKED }, { blockerId: 'usr_jordan', blockedId: READER }]);
});

afterAll(async () => {
  await db.delete(blocks).where(or(inArray(blocks.blockerId, [READER, 'usr_jordan']), inArray(blocks.blockedId, [READER])));
  await db.delete(communityPosts).where(inArray(communityPosts.id, Object.values(POSTS)));
  await db.delete(tasks).where(inArray(tasks.id, Object.values(TASKS)));
  await db.delete(users).where(inArray(users.id, [READER, AUTHOR, BLOCKED]));
  await pool.end();
});

describe('the portal after the sweep', () => {
  it('counts only new items the reader would see: not their own, nobody blocked, still up (P5)', async () => {
    const keys = [...Object.values(POSTS).map((id) => `post:${id}`), ...Object.values(TASKS).map((id) => `task:${id}`), 'post:cpost_unknown', 'nonsense'];
    expect(await visibleFreshKeys(db, READER, keys)).toEqual([`post:${POSTS.other}`, `post:${POSTS.ask}`, `task:${TASKS.other}`]);
  });

  it('gives no card to a recommended helper blocked either way (P11)', async () => {
    const page = await getCommunityPost(db, { id: READER, staff: null }, POSTS.ask, new Date());
    const reply = page?.replies.find((item) => item.id === 'crep_tmp_pf');
    expect(reply).toBeTruthy();
    expect(reply?.recommendedHelper).toBeUndefined();
    // Without the block, the card is there with its Request link.
    await db.delete(blocks).where(eq(blocks.blockerId, 'usr_jordan'));
    const unblocked = await getCommunityPost(db, { id: READER, staff: null }, POSTS.ask, new Date());
    expect(unblocked?.replies.find((item) => item.id === 'crep_tmp_pf')?.recommendedHelper).toMatchObject({ requestHref: expect.stringContaining('/app/helpers/') });
  });
});
