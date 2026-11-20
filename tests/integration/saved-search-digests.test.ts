import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { blocks } from '@/modules/messaging/schema';
import { notifications } from '@/modules/notifications/schema';
import { planNotifications } from '@/modules/notifications/service';
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
// Nothing of this file's is left for later ones: its tasks close; its people's searches, block, alerts and digests go.
afterAll(async () => {
  const mine = `%${run}`;
  await db.execute(sql`update tasks set status = 'canceled' where id like ${`tsk_dg_%${run}`}`);
  await db.execute(sql`delete from saved_searches where user_id like ${mine}`);
  await db.execute(sql`delete from blocks where blocker_id like ${mine} or blocked_id like ${mine}`);
  await db.execute(sql`delete from notifications where user_id like ${mine}`);
  await db.execute(sql`delete from outbox_events where (type = 'searches.digest' and payload->>'userId' like ${mine}) or id like ${`evt_dg_%${run}`}`);
  await pool.end();
});

const run = Date.now().toString(36);
const word = `zebracorn${run}`;
const reader = `usr_digest_${run}`;
const blockedPoster = `usr_digest_blocked_${run}`;
const CHICAGO = 'America/Chicago';
const HOUR = 3_600_000;
// 9 am in Austin today: the digest's run.
const nine = new Date(marketLocalToUtc(marketDayKey(new Date(), CHICAGO), '09:00', CHICAGO));

async function postTask(id: string, posterUserId: string, publishedAt: Date, keyword = word, from = 'tsk_desk') {
  const [source] = await db.select().from(tasks).where(eq(tasks.id, from));
  if (!source) throw new Error(`The seeded ${from} is missing`);
  await db.insert(tasks).values({ ...source, id, slug: `dg-${id}`, title: `${source.title} ${keyword}`, posterUserId, status: 'open', offerCount: 0, publishedAt, createdAt: publishedAt, updatedAt: publishedAt, version: 1 });
}

const digestsOf = (userId: string) =>
  db
    .select()
    .from(outboxEvents)
    .where(and(eq(outboxEvents.type, 'searches.digest'), sql`${outboxEvents.payload}->>'userId' = ${userId}`))
    .orderBy(desc(outboxEvents.createdAt));

async function latestDigestCount(userId: string): Promise<number> {
  const [event] = await digestsOf(userId);
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

describe('one digest per person (SS6)', () => {
  it("carries what an instant search didn't alert about (past the day's cap) into the next morning, never what it did", async () => {
    const person = await throwawayClient(db, `usr_dg_cap_${run}`);
    const keyword = `quokka${run}`;
    const searchId = `ssr_dg_cap_${run}`;
    const last = new Date(nine.getTime() - 20 * HOUR);
    await db.insert(savedSearches).values({ id: searchId, userId: person, marketId: 'mkt_austin', name: 'Quokka desks', source: 'board', params: { q: keyword }, alert: 'instant', lastDigestAt: last, createdAt: last, updatedAt: last });
    // Two new tasks fit: one was alerted at once; the other came after the day's 10 alerts.
    const alerted = `tsk_dg_alerted_${run}`;
    await postTask(alerted, 'usr_chris', new Date(nine.getTime() - 5 * HOUR), keyword);
    await postTask(`tsk_dg_over_${run}`, 'usr_chris', new Date(nine.getTime() - 4 * HOUR), keyword);
    const posted = `evt_dg_posted_${run}`;
    await db.insert(outboxEvents).values({ id: posted, type: 'task.posted', aggregateType: 'task', aggregateId: alerted, payload: { taskId: alerted } });
    await db.insert(notifications).values({ id: `ntf_dg_${run}`, userId: person, type: 'saved_search_match', target: { kind: 'saved_search', searchId }, sourceEventId: posted, createdAt: new Date(nine.getTime() - 5 * HOUR) });
    await runSavedSearchDigests(db, nine);
    const [event] = await digestsOf(person);
    expect(event?.payload).toMatchObject({ count: 1, searches: [{ id: searchId, name: 'Quokka desks', count: 1 }] });
    expect(await planNotifications(db, event!)).toEqual([
      expect.objectContaining({ userId: person, type: 'saved_search_digest', target: { kind: 'saved_search', searchId }, params: { count: 1, search: 'Quokka desks' } }),
    ]);
  });

  it('gives a person one digest over all their searches, each task counted once', async () => {
    const person = await throwawayClient(db, `usr_dg_two_${run}`);
    const keyword = `wombat${run}`;
    const last = new Date(nine.getTime() - 20 * HOUR);
    const row = (id: string, name: string, params: Record<string, string>) => ({ id, userId: person, marketId: 'mkt_austin', name, source: 'board', params, alert: 'daily', lastDigestAt: last, createdAt: last, updatedAt: last });
    await db.insert(savedSearches).values([row(`ssr_dg_all_${run}`, 'Everything wombat', { q: keyword }), row(`ssr_dg_desks_${run}`, 'Wombat furniture', { q: keyword, category: 'furniture-assembly' })]);
    // Two desks fit both searches, a yard job only the first.
    await postTask(`tsk_dg_w1_${run}`, 'usr_chris', new Date(nine.getTime() - 3 * HOUR), keyword);
    await postTask(`tsk_dg_w2_${run}`, 'usr_chris', new Date(nine.getTime() - 2 * HOUR), keyword);
    await postTask(`tsk_dg_w3_${run}`, 'usr_chris', new Date(nine.getTime() - HOUR), keyword, 'tsk_yard');
    await runSavedSearchDigests(db, nine);
    await runSavedSearchDigests(db, new Date(nine.getTime() + 10 * 60_000));
    const events = await digestsOf(person);
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ count: 3, searches: [{ name: 'Everything wombat', count: 3 }, { name: 'Wombat furniture', count: 2 }] });
    expect(await planNotifications(db, events[0]!)).toEqual([
      expect.objectContaining({ userId: person, type: 'saved_searches_digest', target: { kind: 'saved_searches' }, params: { count: 3, search: 'Everything wombat' } }),
    ]);
  });
});
