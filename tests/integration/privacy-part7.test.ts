import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EmailProvider } from '@/integrations/email';
import type { FileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { communityPosts, communityReactions, communityReplies } from '@/modules/community/schema';
import { savedReplies } from '@/modules/messaging/schema';
import { buildDataExport } from '@/modules/privacy/data-export';
import { anonymizeAccount } from '@/modules/privacy/requests';
import { savedSearches } from '@/modules/searches/schema';
import { auditLog } from '@/platform/audit/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';

/**
 * Part 7's content in a person's copy of their data and when they delete their account: their community posts
 * and replies, saved searches and saved replies are in the copy; on deletion the saved things go, what they wrote
 * comes down (removed, rows kept for reports), and their reactions go with the counts following.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
const cipher = fieldCipherFromEnv();
const storage: FileStorage = { put: async () => undefined, get: async () => null, delete: async () => undefined } as unknown as FileStorage;
const email: EmailProvider = { name: 'memory', send: vi.fn(async () => undefined) };
const LEAVER = `usr_tmp_p7_${Date.now().toString(36)}`;
const now = new Date();
const theirPost = `cpo_p7_${Date.now().toString(36)}`;
const otherPost = `${theirPost}_other`;

beforeAll(async () => {
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  await db.insert(users).values({ ...chris!, id: LEAVER, email: `${LEAVER}@example.test`, name: 'Pat P.', firstName: 'Pat', lastName: 'Part', phone: null });
  await db.insert(communityPosts).values([
    { id: theirPost, marketId: 'mkt_austin', authorUserId: LEAVER, kind: 'tip', title: 'Count the hardware bags first', body: 'It saves a trip to the store.' },
    { id: otherPost, marketId: 'mkt_austin', authorUserId: 'usr_chris', kind: 'question', title: 'Leaf bags this week?', body: 'Is pickup still weekly?', helpfulCount: 1 },
  ]);
  await db.insert(communityReplies).values({ id: `${theirPost}_r`, postId: otherPost, authorUserId: LEAVER, body: 'Yes, every week on trash day.' });
  await db.insert(communityReactions).values({ targetKind: 'post', targetId: otherPost, userId: LEAVER, kind: 'helpful' });
  await db.insert(savedSearches).values({ id: `ssr_${theirPost}`, userId: LEAVER, marketId: 'mkt_austin', name: 'Desks', source: 'board', params: { category: 'furniture-assembly' } });
  await db.insert(savedReplies).values({ id: `srp_${theirPost}`, userId: LEAVER, title: 'Hi', body: 'Hi {first_name}!' });
});

afterAll(async () => {
  await db.delete(communityReactions).where(inArray(communityReactions.targetId, [theirPost, otherPost]));
  await db.delete(communityReplies).where(inArray(communityReplies.postId, [theirPost, otherPost]));
  await db.delete(communityPosts).where(inArray(communityPosts.id, [theirPost, otherPost]));
  await db.delete(auditLog).where(eq(auditLog.targetId, LEAVER));
  await db.delete(users).where(eq(users.id, LEAVER));
  await pool.end();
});

describe('Part 7 and privacy', () => {
  it('puts their posts, replies, saved searches and saved replies in their copy', async () => {
    const copy = (await buildDataExport(db, cipher, LEAVER, now)) as Record<string, unknown>;
    expect(copy.community).toMatchObject({ posts: [expect.objectContaining({ title: 'Count the hardware bags first' })], replies: [expect.objectContaining({ body: 'Yes, every week on trash day.' })] });
    expect(copy.savedSearches).toEqual([expect.objectContaining({ name: 'Desks', alerts: 'off' })]);
    expect(copy.savedReplies).toEqual([expect.objectContaining({ title: 'Hi' })]);
  });

  it('takes it down on deletion: saved things go, writing is removed, reactions go and counts follow', async () => {
    await anonymizeAccount(db, { storage, cipher, email, appUrl: 'http://localhost:3000' }, LEAVER, now);
    expect(await db.select().from(savedSearches).where(eq(savedSearches.userId, LEAVER))).toEqual([]);
    expect(await db.select().from(savedReplies).where(eq(savedReplies.userId, LEAVER))).toEqual([]);
    const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, theirPost));
    expect(post).toMatchObject({ status: 'removed', moderationReason: 'account_deleted' });
    const [reply] = await db.select().from(communityReplies).where(eq(communityReplies.id, `${theirPost}_r`));
    expect(reply?.status).toBe('removed');
    expect(await db.select().from(communityReactions).where(and(eq(communityReactions.userId, LEAVER)))).toEqual([]);
    const [other] = await db.select({ helpful: communityPosts.helpfulCount }).from(communityPosts).where(eq(communityPosts.id, otherPost));
    expect(other?.helpful).toBe(0);
  });
});
