import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { communityPosts, communityReactions, communityReplies } from '@/modules/community/schema';
import { getPortal } from '@/modules/community/portal';
import {
  createCommunityPost,
  deleteOwnCommunityItem,
  getCommunityPost,
  getNewCommunityPostPage,
  moderateCommunityItem,
  pinCommunityAnswer,
  reactInCommunity,
  recommendedByCounts,
  replyToCommunityPost,
} from '@/modules/community/service';
import { blocks } from '@/modules/messaging/schema';

/**
 * The community feed (completion plan 7.7–7.8) on the seeded Austin people: Maya (poster, Mueller), Lee and Sam
 * (helpers), Ben (poster), Taylor (trust and safety). Every post here has a unique title, and checks look for
 * their own rows, since other test files share the database.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
const now = new Date();
const maya = { id: 'usr_maya', staff: null };
const lee = { id: 'usr_lee', staff: null };
const ben = { id: 'usr_ben', staff: null };
const taylor = { id: 'usr_taylor', staff: { id: 'usr_taylor', roles: ['trust_safety' as const] } };
const casey = { id: 'usr_casey', staff: { id: 'usr_casey', roles: ['finance' as const] } };
const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

afterAll(() => pool.end());

/**
 * The recommendation requests in the portal (plan 9.10) across the whole market, newest first (every post here is
 * one): what the posts-only feed listed, without the open tasks other test files may be posting meanwhile.
 */
async function marketPosts(viewer: { id: string; staff: null }) {
  const page = await getPortal(db, viewer, { area: 'all', sort: 'new', type: 'recommendation' }, now);
  return { page, posts: page?.items.flatMap((item) => (item.type === 'post' ? [item.post] : [])) ?? [] };
}

async function post(viewer: { id: string; staff: null }, title: string, extra: Record<string, string> = {}) {
  const result = await createCommunityPost(db, viewer, { kind: 'recommendation', title, body: 'Who do you recommend for a flat-pack desk? Call me at 512-555-0199.', categorySlug: 'furniture-assembly', ...extra }, now);
  expect(result).toMatchObject({ ok: true, code: 'sent' });
  return (result as { redirectTo: string }).redirectTo.split('/').at(-1)!;
}

describe('community posts', () => {
  it('posts in the author’s neighborhood, masks contact details, and shows in the feed with its author’s role', async () => {
    const title = `Desk help near Mueller ${unique()}`;
    const id = await post(maya, title);
    const [row] = await db.select().from(communityPosts).where(eq(communityPosts.id, id));
    expect(row?.body).not.toContain('512-555-0199');
    expect(row?.areaId).not.toBeNull();
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'community.posted'), eq(outboxEvents.aggregateId, id)));
    expect(event?.payload).toMatchObject({ postId: id });

    const feed = await marketPosts(lee);
    const shown = feed.posts.find((candidate) => candidate.id === id);
    expect(shown).toMatchObject({ kind: 'recommendation', title, author: { displayName: 'Maya R.', role: 'poster', isYou: false } });
    expect(feed.page?.stats.postsThisWeek).toBeGreaterThan(0);
  });

  it('turns away safety and crime posts, which belong with the police', async () => {
    const result = await createCommunityPost(db, maya, { kind: 'tip', title: 'Suspicious person on our street', body: 'Saw a suspicious man looking into cars last night.' }, now);
    expect(result).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { body: ['prohibited'] } });
  });

  it('lets a helper answer a recommendation request with themself, once, ranked as a self-tag', async () => {
    const id = await post(maya, `Bed frame help ${unique()}`);
    const page = await getCommunityPost(db, lee, id);
    const self = page?.recommendOptions.find((option) => option.self);
    expect(self).toBeDefined();
    expect(await replyToCommunityPost(db, lee, id, { body: 'I can do it this week.', recommendHandle: self!.handle }, now)).toMatchObject({ ok: true, code: 'sent' });
    expect(await replyToCommunityPost(db, lee, id, { body: 'Me again.', recommendHandle: self!.handle }, now)).toMatchObject({ ok: false, fieldErrors: { recommendHandle: ['in_use'] } });
    const after = await getCommunityPost(db, maya, id);
    expect(after?.post.replyCount).toBe(1);
    expect(after?.replies[0]?.recommendedHelper).toMatchObject({ handle: self!.handle, selfTag: true });
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'community.replied'), eq(outboxEvents.aggregateId, id)));
    expect(event?.payload).toMatchObject({ postAuthorUserId: 'usr_maya', replierUserId: 'usr_lee' });
  });

  it('counts Helpful once per person, tells the author at the first one, and never for their own', async () => {
    const id = await post(maya, `Shelf help ${unique()}`);
    expect(await reactInCommunity(db, maya, { targetKind: 'post', targetId: id, kind: 'helpful', on: true }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await reactInCommunity(db, lee, { targetKind: 'post', targetId: id, kind: 'helpful', on: true }, now)).toMatchObject({ ok: true });
    expect(await reactInCommunity(db, lee, { targetKind: 'post', targetId: id, kind: 'helpful', on: true }, now)).toMatchObject({ ok: true });
    let [row] = await db.select().from(communityPosts).where(eq(communityPosts.id, id));
    expect(row?.helpfulCount).toBe(1);
    const milestone = await db.select().from(outboxEvents).where(eq(outboxEvents.id, `evt_helpful_post_${id}_1`));
    expect(milestone).toHaveLength(1);
    // Off and on again: the count follows, the milestone isn't sent twice.
    await reactInCommunity(db, lee, { targetKind: 'post', targetId: id, kind: 'helpful', on: false }, now);
    [row] = await db.select().from(communityPosts).where(eq(communityPosts.id, id));
    expect(row?.helpfulCount).toBe(0);
    await reactInCommunity(db, lee, { targetKind: 'post', targetId: id, kind: 'helpful', on: true }, now);
    expect(await db.select().from(outboxEvents).where(eq(outboxEvents.id, `evt_helpful_post_${id}_1`))).toHaveLength(1);
    const feed = await marketPosts(lee);
    expect(feed.posts.find((candidate) => candidate.id === id)?.reactions).toMatchObject({ helpful: 1, mine: ['helpful'] });
    expect(await db.select().from(communityReactions).where(and(eq(communityReactions.targetId, id), eq(communityReactions.userId, 'usr_lee')))).toHaveLength(1);
  });

  it('lets only the author pin an answer, and tells the person who wrote it', async () => {
    const id = await post(maya, `Desk assembly ${unique()}`);
    await replyToCommunityPost(db, lee, id, { body: 'Ask for the hardware bag count first.' }, now);
    const replyId = (await getCommunityPost(db, maya, id))!.replies[0]!.id;
    expect(await pinCommunityAnswer(db, lee, id, replyId, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await pinCommunityAnswer(db, maya, id, replyId, now)).toMatchObject({ ok: true });
    const page = await getCommunityPost(db, maya, id);
    expect(page?.replies[0]).toMatchObject({ id: replyId, pinned: true });
    expect(await db.select().from(outboxEvents).where(eq(outboxEvents.id, `evt_pinned_${replyId}`))).toHaveLength(1);
    const feed = await marketPosts(maya);
    expect(feed.posts.find((candidate) => candidate.id === id)?.previewReplies.map((reply) => reply.id)).toEqual([replyId]);
  });

  it('keeps blocked people apart both ways', async () => {
    const id = await post(maya, `Moving boxes ${unique()}`);
    await db.insert(blocks).values({ blockerId: 'usr_maya', blockedId: 'usr_ben', createdAt: now }).onConflictDoNothing();
    try {
      const feed = await marketPosts(ben);
      expect(feed.posts.some((candidate) => candidate.id === id)).toBe(false);
      expect(await getCommunityPost(db, ben, id)).toBeNull();
      expect(await replyToCommunityPost(db, ben, id, { body: 'Hello there' }, now)).toMatchObject({ ok: false });
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, 'usr_maya'), eq(blocks.blockedId, 'usr_ben')));
    }
  });

  it('thanks a helper only for the author’s own completed booking, once, and counts it as a recommendation', async () => {
    const page = await getNewCommunityPostPage(db, maya, 'thanks');
    const wardrobe = page?.thankOptions.find((option) => option.bookingId === 'bkg_wardrobe');
    // Another run may have thanked Sam for it already; then the option is gone and a second thanks is refused.
    if (wardrobe) {
      const result = await createCommunityPost(db, maya, { kind: 'thanks', title: 'Thank you, Sam!', body: 'The wardrobe is solid and the doors line up perfectly.', bookingId: 'bkg_wardrobe' }, now);
      expect(result).toMatchObject({ ok: true });
    }
    const again = await createCommunityPost(db, maya, { kind: 'thanks', title: 'Thanks again, Sam', body: 'Still a great wardrobe, thank you.', bookingId: 'bkg_wardrobe' }, now);
    expect(again).toMatchObject({ ok: false, fieldErrors: { bookingId: ['in_use'] } });
    expect(await createCommunityPost(db, ben, { kind: 'thanks', title: 'Thank you, Sam!', body: 'Not my booking, though.', bookingId: 'bkg_wardrobe' }, now)).toMatchObject({ ok: false, fieldErrors: { bookingId: ['invalid'] } });
    const counts = await recommendedByCounts(db, ['usr_sam']);
    expect(counts.get('usr_sam')).toBeGreaterThanOrEqual(1);
  });

  it('lets staff hide a post with a reason (audited); members stop seeing it, staff see it marked', async () => {
    const id = await post(maya, `Hide me ${unique()}`);
    expect(await moderateCommunityItem(db, taylor.staff, 'post', id, { action: 'hide', reason: 'Off-topic sales pitch' }, now)).toMatchObject({ ok: true });
    expect(await getCommunityPost(db, lee, id)).toBeNull();
    expect((await getCommunityPost(db, taylor, id))?.post.moderation).toEqual({ status: 'hidden', reason: 'Off-topic sales pitch' });
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.targetType, 'community_post'), eq(auditLog.targetId, id)));
    expect(audit).toMatchObject({ action: 'community.post.hide', actorId: 'usr_taylor', reason: 'Off-topic sales pitch' });
  });

  it('leaves moderation to moderators: other staff read hidden posts but neither see the controls nor restore them (security review)', async () => {
    // Ben's post: Maya's hourly posts are counted out for the tests that follow.
    const id = await post(ben, `Moderators only ${unique()}`);
    expect(await moderateCommunityItem(db, taylor.staff, 'post', id, { action: 'hide', reason: 'Off-topic sales pitch' }, now)).toMatchObject({ ok: true });
    const page = await getCommunityPost(db, casey, id);
    expect(page?.post.moderation).toEqual({ status: 'hidden', reason: 'Off-topic sales pitch' });
    expect(page?.viewer.isStaff).toBe(false);
    expect((await getCommunityPost(db, taylor, id))?.viewer.isStaff).toBe(true);
    expect(await moderateCommunityItem(db, casey.staff, 'post', id, { action: 'restore', reason: 'Looks fine to me' }, now)).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('lets authors take down their own reply, which updates the count', async () => {
    const id = await post(maya, `Take down ${unique()}`);
    await replyToCommunityPost(db, lee, id, { body: 'Wrong post, sorry.' }, now);
    const replyId = (await getCommunityPost(db, lee, id))!.replies[0]!.id;
    expect(await deleteOwnCommunityItem(db, maya, 'reply', replyId, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await deleteOwnCommunityItem(db, lee, 'reply', replyId, now)).toMatchObject({ ok: true });
    const [row] = await db.select().from(communityReplies).where(eq(communityReplies.id, replyId));
    expect(row?.status).toBe('removed');
    expect((await getCommunityPost(db, maya, id))?.post.replyCount).toBe(0);
  });
});
