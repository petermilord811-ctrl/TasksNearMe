import { eq, inArray, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HELPER_CONTACT_EARNED_MIN } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { communityPosts, communityReactions } from '@/modules/community/schema';
import { earnedSparks } from '@/modules/sparks/domain';
import { sparksPageData, sparkTallies } from '@/modules/sparks/service';
import { createDb } from '@/platform/db/connect';

/**
 * Whose Helpful and Thanks count toward Sparks (sweep 2026-11-24 A2): two sock accounts marking every post and reply
 * reached the contact-details level in about three days. Now only accounts in good standing that were a week old when
 * they reacted count, and at most five of each kind from any one person. Everyone here is made for the test and removed
 * after it.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const AUTHOR = 'usr_tmp_sparkgiv_author';
/** A neighbor of 60 days who marks all 8 posts Helpful and Thanks: 5 of each count. */
const NEIGHBOR = 'usr_tmp_sparkgiv_neighbor';
/** An account made yesterday: none of its reactions count. */
const FRESH = 'usr_tmp_sparkgiv_fresh';
/** Made 10 days ago and reacting 5 days ago, when it was 5 days old: still none count, now that it's older. */
const EARLY = 'usr_tmp_sparkgiv_early';
/** Old, but banned: its reactions stop counting. */
const BANNED = 'usr_tmp_sparkgiv_banned';
/** Old, but restricted. */
const RESTRICTED = 'usr_tmp_sparkgiv_restricted';
const PEOPLE = [AUTHOR, NEIGHBOR, FRESH, EARLY, BANNED, RESTRICTED];
const now = new Date();
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
const POSTS = Array.from({ length: 8 }, (_, n) => `cpo_tmp_sparkgiv_${n}`);

async function cleanUp() {
  await db.delete(communityReactions).where(or(inArray(communityReactions.userId, PEOPLE), inArray(communityReactions.targetId, POSTS)));
  await db.delete(communityPosts).where(inArray(communityPosts.authorUserId, PEOPLE));
  await db.delete(users).where(inArray(users.id, PEOPLE));
}

beforeAll(async () => {
  await cleanUp();
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  if (!maya) throw new Error('The seeded people are missing');
  const person = (id: string, n: number, createdAt: Date, status = 'active') => ({ ...maya, id, email: `tmp-sparkgiv-${n}@example.test`, name: `Giver ${n}`, firstName: 'Giver', lastName: `N${n}`, phone: `+1512555018${n}`, phoneVerifiedAt: null, status, createdAt, updatedAt: createdAt });
  await db.insert(users).values([
    person(AUTHOR, 0, daysAgo(90)),
    person(NEIGHBOR, 1, daysAgo(60)),
    person(FRESH, 2, daysAgo(1)),
    person(EARLY, 3, daysAgo(10)),
    person(BANNED, 4, daysAgo(60), 'banned'),
    person(RESTRICTED, 5, daysAgo(60), 'restricted'),
  ]);
  // Eight posts over three days (3, 3 and 2: under the daily cap, so all 8 count as posts).
  await db.insert(communityPosts).values(
    POSTS.map((id, n) => {
      const createdAt = daysAgo(3 - Math.floor(n / 3));
      return { id, marketId: 'mkt_austin', authorUserId: AUTHOR, kind: 'tip', title: `Tip ${n}`, body: 'A useful tip for neighbors.', status: 'visible', createdAt, lastActivityAt: createdAt, updatedAt: createdAt };
    }),
  );
  const reactions = (userId: string, at: Date) =>
    POSTS.flatMap((targetId) => (['helpful', 'thanks'] as const).map((kind) => ({ targetKind: 'post', targetId, userId, kind, createdAt: at })));
  await db.insert(communityReactions).values([
    ...reactions(NEIGHBOR, daysAgo(1)),
    ...reactions(FRESH, now),
    ...reactions(EARLY, daysAgo(5)),
    ...reactions(BANNED, daysAgo(1)),
    ...reactions(RESTRICTED, daysAgo(1)),
    // The author's own reactions never count.
    ...reactions(AUTHOR, daysAgo(1)),
  ]);
});

afterAll(async () => {
  await cleanUp();
  await pool.end();
});

describe('Sparks from Helpful and Thanks', () => {
  it('counts five of each kind from one neighbor in good standing, and none from new, banned or restricted accounts', async () => {
    const tally = (await sparkTallies(db, [AUTHOR])).get(AUTHOR);
    expect(tally?.counts).toMatchObject({ helpful: 5, thanks: 5 });
    // 8 posts (40) + 5 Helpful (15) + 5 Thanks (10).
    expect(earnedSparks(tally!.counts).earned).toBe(65);
    const page = await sparksPageData(db, null, AUTHOR, now);
    expect(page.earned).toBe(65);
    expect(page.breakdown.filter((row) => row.source === 'helpful' || row.source === 'thanks')).toEqual([
      { source: 'helpful', count: 5, points: 15 },
      { source: 'thanks', count: 5, points: 10 },
    ]);
    expect(page.rules.find((row) => row.source === 'helpful')).toEqual({ source: 'helpful', points: 3, perGiver: 5 });
    expect(page.giverMinAccountDays).toBe(7);
  });

  it('starts counting a banned account again only if it is reinstated', async () => {
    await db.update(users).set({ status: 'active' }).where(eq(users.id, BANNED));
    try {
      expect((await sparkTallies(db, [AUTHOR])).get(AUTHOR)?.counts).toMatchObject({ helpful: 10, thanks: 10 });
    } finally {
      await db.update(users).set({ status: 'banned' }).where(eq(users.id, BANNED));
    }
    expect(HELPER_CONTACT_EARNED_MIN).toBe(2000);
  });
});
