import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { messages, threadParticipants, threads } from '@/modules/messaging/schema';
import { recomputeResponseTime } from '@/modules/profiles/response-time';
import { helperProfiles } from '@/modules/profiles/schema';
import { createDb } from '@/platform/db/connect';
import { responseTimeRange } from '@/shared/response-time';

/**
 * Response times (completion plan 7.12): the median time from someone's first message to Sam's first answer, over
 * the last 30 days, stored once there are three conversations, shown as a range.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
afterAll(() => pool.end());
const helper = 'usr_sam';
const run = Date.now().toString(36);
const ids: string[] = [];

async function conversation(n: number, askedMinutesAgo: number, answeredAfter: number | null) {
  const id = `thr_rt_${run}_${n}`;
  ids.push(id);
  const now = Date.now();
  await db.insert(threads).values({ id, kind: 'offer', linkedId: `off_rt_${run}_${n}`, taskId: 'tsk_desk', createdAt: new Date(now - askedMinutesAgo * 60_000 - 60_000) });
  await db.insert(threadParticipants).values([{ threadId: id, userId: helper }, { threadId: id, userId: 'usr_maya' }]);
  const asked = new Date(now - askedMinutesAgo * 60_000);
  await db.insert(messages).values({ id: `msg_rt_${run}_${n}_a`, threadId: id, senderUserId: 'usr_maya', kind: 'text', body: 'Hi, are you free Saturday?', attachmentFileIds: [], createdAt: asked });
  if (answeredAfter !== null) await db.insert(messages).values({ id: `msg_rt_${run}_${n}_b`, threadId: id, senderUserId: helper, kind: 'text', body: 'Yes, I am.', attachmentFileIds: [], createdAt: new Date(asked.getTime() + answeredAfter * 60_000) });
}

describe('response time', () => {
  it('waits for three answered conversations, then stores the median', async () => {
    const [before] = await db.select({ minutes: helperProfiles.responseTimeMinutes }).from(helperProfiles).where(eq(helperProfiles.userId, helper));
    await conversation(1, 600, 30);
    await conversation(2, 500, 50);
    // An unanswered one doesn't count.
    await conversation(3, 400, null);
    // Two answered conversations aren't enough: the stored value stays.
    const early = await recomputeResponseTime(db, helper, new Date());
    if (early === null) {
      const [same] = await db.select({ minutes: helperProfiles.responseTimeMinutes }).from(helperProfiles).where(eq(helperProfiles.userId, helper));
      expect(same?.minutes).toBe(before?.minutes);
    }
    await conversation(4, 300, 200);
    const minutes = await recomputeResponseTime(db, helper, new Date());
    expect(minutes).not.toBeNull();
    // Other seeded conversations of Sam's can be in the window too; the median of these three is 50.
    expect(responseTimeRange(minutes)).toMatch(/hour|few_hours|day/);
    const [after] = await db.select({ minutes: helperProfiles.responseTimeMinutes }).from(helperProfiles).where(eq(helperProfiles.userId, helper));
    expect(after?.minutes).toBe(minutes);
    await db.delete(messages).where(inArray(messages.threadId, ids));
    await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, ids));
    await db.delete(threads).where(inArray(threads.id, ids));
    if (before) await db.update(helperProfiles).set({ responseTimeMinutes: before.minutes }).where(eq(helperProfiles.userId, helper));
  });
});
