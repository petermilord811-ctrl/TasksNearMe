import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deskDraft } from '@/fixtures';
import { createFakeGeocoder } from '@/integrations/geocoding';
import { users } from '@/modules/accounts/schema';
import { messages, threadParticipants, threads } from '@/modules/messaging/schema';
import { offerThreadId, sendMessage } from '@/modules/messaging/service';
import { submitOffer } from '@/modules/offers/helper';
import { offers } from '@/modules/offers/schema';
import { createTaskPosting } from '@/modules/tasks/posting';
import { taskLocations, tasks } from '@/modules/tasks/schema';
import { createFieldCipher } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * Request keys (bad connections pass, J-N1, migration 0071): a post or a message sent again after an answer that never
 * arrived, with the same key, is the first one, never a second; and nobody else's key or offer reads as theirs.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 5 });
// Tuesday, Nov 17, 2026, 9:00 am in Austin (the fixtures' "now").
const NOW = new Date('2026-11-17T15:00:00.000Z');
const cipher = createFieldCipher(Buffer.alloc(32, 3).toString('base64'));
const posting = createTaskPosting({ db, geocoder: createFakeGeocoder(), cipher, now: () => NOW });
const draft = { ...deskDraft, photoIds: [] };
const POSTER = 'usr_rk_poster';
const OTHER = 'usr_rk_other';
const KEY = '9b2f1c7e-4a3d-4e5f-8a6b-1c2d3e4f5a6b';
const OFFER_TASK = 'tsk_rk_offers';

async function person(id: string) {
  await db.insert(users).values({
    id,
    email: `${id}@example.test`,
    name: 'Kee R.',
    firstName: 'Kee',
    lastName: 'Requester',
    homeMarketId: 'mkt_austin',
    createdAt: new Date(NOW.getTime() - 90 * 86_400_000),
    phone: `+1512555${String(Math.floor(1000 + Math.random() * 8999))}`,
    phoneVerifiedAt: NOW,
    adultAttestedAt: NOW,
    termsAcceptedAt: NOW,
  });
}

beforeAll(async () => {
  await person(POSTER);
  await person(OTHER);
});

afterAll(async () => {
  const mine = [POSTER, OTHER];
  const theirTasks = (await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.posterUserId, mine))).map((row) => row.id);
  const theirThreads = (await db.select({ threadId: threadParticipants.threadId }).from(threadParticipants).where(inArray(threadParticipants.userId, mine))).map((row) => row.threadId);
  if (theirThreads.length) {
    await db.delete(messages).where(inArray(messages.threadId, theirThreads));
    await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, theirThreads));
    await db.delete(threads).where(inArray(threads.id, theirThreads));
  }
  if (theirTasks.length) {
    await db.delete(offers).where(inArray(offers.taskId, theirTasks));
    await db.delete(tasks).where(inArray(tasks.id, theirTasks));
  }
  await db.delete(taskLocations).where(inArray(taskLocations.ownerUserId, mine));
  await db.delete(rateLimits).where(inArray(rateLimits.key, ['offer:usr_jordan', 'offer:usr_sam', 'messages:usr_jordan', `messages:${POSTER}`]));
  await db.delete(users).where(inArray(users.id, mine));
  await pool.end();
});

const keyed = (posterUserId: string) => db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(and(eq(tasks.posterUserId, posterUserId), eq(tasks.requestKey, KEY)));

describe('a post sent again with its key (J-N1)', () => {
  it('makes one task from two posts at once with one key', async () => {
    const [first, second] = await Promise.all([posting.post(POSTER, draft, { requestKey: KEY }), posting.post(POSTER, draft, { requestKey: KEY })]);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.taskId).toBe(first.taskId);
    expect(await keyed(POSTER)).toEqual([{ id: first.taskId, title: draft.title }]);
  });

  it('returns the first task to a repeat after it went through, even with a changed draft: nothing is posted again', async () => {
    const [before] = await keyed(POSTER);
    const repeat = await posting.post(POSTER, { ...draft, title: 'Assemble a different desk' }, { requestKey: KEY });
    expect(repeat).toMatchObject({ ok: true, taskId: before!.id });
    expect(await keyed(POSTER)).toEqual([before]);
    expect(await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.posterUserId, POSTER), eq(tasks.title, 'Assemble a different desk')))).toEqual([]);
  });

  it("keeps keys to their poster: the same key from someone else is their own new task", async () => {
    const [mine] = await keyed(POSTER);
    const theirs = await posting.post(OTHER, draft, { requestKey: KEY });
    expect(theirs.ok).toBe(true);
    if (!theirs.ok) return;
    expect(theirs.taskId).not.toBe(mine!.id);
    expect(await keyed(OTHER)).toEqual([{ id: theirs.taskId, title: draft.title }]);
  });
});

describe('a message sent again with its key (J-N1)', () => {
  let thread = '';

  beforeAll(async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
    if (!desk || !offer) throw new Error('The seeded desk is missing');
    await db.insert(tasks).values({ ...desk, id: OFFER_TASK, slug: 'rk-offers-desk', posterUserId: POSTER, status: 'open', offerCount: 0, version: 1, requestKey: null });
    await db.insert(offers).values({ ...offer, id: 'off_rk_jordan', taskId: OFFER_TASK, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
    thread = (await offerThreadId(db, 'off_rk_jordan', new Date()))!;
  });

  const keyedMessages = () => db.select({ body: messages.body, senderUserId: messages.senderUserId }).from(messages).where(and(eq(messages.threadId, thread), eq(messages.requestKey, KEY)));

  it('keeps one message from two sends at once with one key, and a repeat after it went through sends nothing', async () => {
    const send = (body: string) => sendMessage(db, 'usr_jordan', thread, { body, attachmentIds: [], requestKey: KEY }, new Date());
    expect(await Promise.all([send('On my way up.'), send('On my way up.')])).toEqual([{ ok: true, code: 'sent' }, { ok: true, code: 'sent' }]);
    expect(await keyedMessages()).toEqual([{ body: 'On my way up.', senderUserId: 'usr_jordan' }]);
    expect(await send('On my way up, edited.')).toEqual({ ok: true, code: 'sent' });
    expect(await keyedMessages()).toEqual([{ body: 'On my way up.', senderUserId: 'usr_jordan' }]);
  });

  it('keeps keys to their sender: the same key from the other person is their own message', async () => {
    expect(await sendMessage(db, POSTER, thread, { body: 'Thanks, the door is open.', attachmentIds: [], requestKey: KEY }, new Date())).toEqual({ ok: true, code: 'sent' });
    expect((await keyedMessages()).map((row) => row.senderUserId).sort()).toEqual([POSTER, 'usr_jordan'].sort());
  });

  it("never reads a stranger's offer as theirs: Sam's own offer on the same task is a new one", async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, OFFER_TASK));
    expect(desk).toBeDefined();
    await db.delete(rateLimits).where(inArray(rateLimits.key, ['offer:usr_sam']));
    const sent = await submitOffer(db, 'usr_sam', OFFER_TASK, { pricing: { type: 'fixed', priceCents: 6000 }, startTime: '10:00', message: 'I can bring a drill.', brings: [] }, NOW);
    expect(sent).toEqual({ ok: true, code: 'sent' });
    const rows = await db.select({ helperUserId: offers.helperUserId }).from(offers).where(eq(offers.taskId, OFFER_TASK));
    expect(rows.map((row) => row.helperUserId).sort()).toEqual(['usr_jordan', 'usr_sam']);
  });
});
