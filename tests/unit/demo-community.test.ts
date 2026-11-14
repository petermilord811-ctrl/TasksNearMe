import { describe, expect, it } from 'vitest';
import { FEED_PAGE_SIZE } from '@/modules/community/domain';
import { buildDemoCommunity } from '../../db/seeds/demo/community';
import { buildDemoPlan, defaultDemoPolicies } from '../../db/seeds/demo/plan';

/**
 * The demo marketplace's community (completion plan 7.11): busier markets talk more, so Austin's feed runs past
 * one page and reads as continuous; every row is a demo row, on its own post and market, and nothing is dated
 * after "now".
 */
const now = new Date('2026-11-14T15:00:00.000Z');
const plan = buildDemoPlan({ now, policies: defaultDemoPolicies() });
const community = buildDemoCommunity(plan, now);
const postsIn = (marketId: string) => community.posts.filter((post) => post.marketId === marketId);

describe('the demo community', () => {
  it('gives Austin more than a page of posts, and every market with neighbors a few', () => {
    expect(postsIn('mkt_austin').length).toBeGreaterThan(FEED_PAGE_SIZE);
    const markets = [...new Set(plan.clients.map((client) => client.marketId))];
    for (const marketId of markets) expect(postsIn(marketId).length, marketId).toBeGreaterThanOrEqual(5);
    // All four kinds in the busiest market.
    expect(new Set(postsIn('mkt_austin').map((post) => post.kind))).toEqual(new Set(['recommendation', 'question', 'tip', 'thanks']));
  });

  it('marks every row as demo, once each, with replies on their own posts and nothing in the future', () => {
    const ids = [...community.posts.map((post) => post.id), ...community.replies.map((reply) => reply.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toContain('_demo_');
    const posts = new Map(community.posts.map((post) => [post.id, post]));
    for (const reply of community.replies) {
      expect(posts.has(reply.postId), reply.id).toBe(true);
      expect(reply.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
    for (const post of community.posts) {
      expect(post.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(post.replyCount).toBe(community.replies.filter((reply) => reply.postId === post.id).length);
    }
    // One thank-you per booking.
    const thanked = community.posts.filter((post) => post.bookingId).map((post) => post.bookingId);
    expect(new Set(thanked).size).toBe(thanked.length);
  });

  it('is the same every time for the same moment', () => {
    expect(buildDemoCommunity(buildDemoPlan({ now, policies: defaultDemoPolicies() }), now)).toEqual(community);
  });
});
