import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { blocks } from '@/modules/messaging/schema';
import { savedSearches } from '@/modules/searches/schema';
import { runSavedSearchDigests } from '@/modules/searches/service';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';
import { throwawayClient } from '../support/people';

/**
 * The saved searches' morning digest (completion plan 7.10, sweep SS1 to SS3): it never counts the person's own tasks
 * or a blocked poster's, counts from the last digest (up to a week back) so runs further apart than a day lose
 * nothing, and takes only searches that are due, so ones not due yet never crowd them out. Its tasks carry a keyword
 * no other task has, and its people are made for it.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const run = Date.now().toString(36);
const word = `zebracorn${run}`;
const reader = `usr_digest_${run}`;
const blockedPoster = `usr_digest_blocked_${run}`;
const CHICAGO = 'America/Chicago';
const HOUR = 3_600_000;
// 9 am in Austin today: the digest's run.
const nine = new Date(marketLocalToUtc(marketDayKey(new Date(), CHICAGO), '09:00', CHICAGO));

async function postTask(id: string, posterUserId: string, publishedAt: Date) {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  if (!desk) throw new Error('The seeded desk is missing');
  await db.insert(tasks).values({ ...desk, id, slug: `dg-${id}`, title: `Assemble a ${word} desk`, posterUserId, status: 'open', offerCount: 0, publishedAt, createdAt: publishedAt, updatedAt: publishedAt, version: 1 });
}

async function latestDigestCount(userId: string): Promise<number> {
  const [event] = await db
    .select()
    .from(outboxEvents)
    .where(and(eq(outboxEvents.type, 'searches.digest'), sql`${outboxEvents.payload}->>'userId' = ${userId}`))
    .orderBy(desc(outboxEvents.createdAt))
    .limit(1);
  return event ? (event.payload as { count: number }).count : 0;
}

beforeAll(async () => {
  await throwawayClient(db, reader);
  await throwawayClient(db, blockedPoster);
  // Blocked the other way round: the poster blocked the reader.
  await db.insert(blocks).values({ blockerId: blockedPoster, blockedId: reader }).onConflictDoNothing();
  const lastDigest = new Date(nine.getTime() - 30 * HOUR);
  await db.insert(savedSearches).values({ id: `ssr_dg_${run}`, userId: reader, marketId: 'mkt_austin', name: 'Zebracorn desks', source: 'board', params: { q: word }, alert: 'daily', lastDigestAt: lastDigest, createdAt: lastDigest, updatedAt: lastDigest });
  // Since the last digest: someone else's two hours ago (counts), the reader's own and a blocked poster's (never), and
  // one 28 hours before this run but after the last digest 30 hours before (counts).
  await postTask(`tsk_dg_new_${run}`, 'usr_chris', new Date(nine.getTime() - 2 * HOUR));
  await postTask(`tsk_dg_own_${run}`, reader, new Date(nine.getTime() - 2 * HOUR));
  await postTask(`tsk_dg_blk_${run}`, blockedPoster, new Date(nine.getTime() - 2 * HOUR));
  await postTask(`tsk_dg_old_${run}`, 'usr_chris', new Date(nine.getTime() - 28 * HOUR));
});

describe('the morning digest', () => {
  it("counts others' new tasks since the last digest: never the person's own or a blocked poster's (SS1), and none lost to a late run (SS2)", async () => {
    await runSavedSearchDigests(db, nine);
    expect(await latestDigestCount(reader)).toBe(2);
    const [search] = await db.select({ lastDigestAt: savedSearches.lastDigestAt }).from(savedSearches).where(eq(savedSearches.id, `ssr_dg_${run}`));
    expect(search?.lastDigestAt?.getTime()).toBe(nine.getTime());
  });

  it('takes only searches that are due, so ones not due yet never crowd them out (SS3)', async () => {
    // 7:30 in Austin is 8:30 in Gainesville: Gainesville's digests are due, Austin's aren't yet.
    const early = new Date(marketLocalToUtc(marketDayKey(nine, CHICAGO), '07:30', CHICAGO));
    const yesterday = new Date(early.getTime() - 24 * HOUR);
    const crowd = await throwawayClient(db, `usr_dg_crowd_${run}`);
    const gainesville = await throwawayClient(db, `usr_dg_gnv_${run}`, 'usr_grace');
    await db.insert(savedSearches).values(Array.from({ length: 520 }, (_, index) => ({ id: `ssr_dg_crowd_${run}_${index}`, userId: crowd, marketId: 'mkt_austin', name: `Crowd ${index}`, source: 'board', params: {}, alert: 'daily', lastDigestAt: yesterday, createdAt: yesterday, updatedAt: yesterday })));
    await db.insert(savedSearches).values({ id: `ssr_dg_gnv_${run}`, userId: gainesville, marketId: 'mkt_gainesville', name: 'Gainesville', source: 'board', params: {}, alert: 'daily', lastDigestAt: yesterday, createdAt: yesterday, updatedAt: yesterday });
    try {
      await runSavedSearchDigests(db, early);
      const [due] = await db.select({ lastDigestAt: savedSearches.lastDigestAt }).from(savedSearches).where(eq(savedSearches.id, `ssr_dg_gnv_${run}`));
      expect(due?.lastDigestAt?.getTime()).toBe(early.getTime());
      const [waiting] = await db.select({ lastDigestAt: savedSearches.lastDigestAt }).from(savedSearches).where(eq(savedSearches.id, `ssr_dg_crowd_${run}_0`));
      expect(waiting?.lastDigestAt?.getTime()).toBe(yesterday.getTime());
    } finally {
      await db.delete(savedSearches).where(inArray(savedSearches.userId, [crowd, gainesville]));
    }
  });
});
