import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadPhoneCheck } from '@/modules/accounts/phone-check';
import { users } from '@/modules/accounts/schema';
import { communityPosts, communityReplies } from '@/modules/community/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

/** The phone check (plan 9.2): off without texts; once texts work, the grace for what people already did without a phone. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
const FRESH = 'usr_tmp_phone_fresh';
const REPLIER = 'usr_tmp_phone_replier';
const POSTER = 'usr_tmp_phone_poster';
const POST = 'cpost_tmp_phone_check';

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  for (const [id, email] of [[FRESH, 'tmp-phone-fresh@example.test'], [REPLIER, 'tmp-phone-replier@example.test'], [POSTER, 'tmp-phone-poster@example.test']] as const) {
    await db.insert(users).values({ ...maya!, id, email, phone: null, phoneVerifiedAt: null });
  }
  await db.insert(communityPosts).values({ id: POST, marketId: maya!.homeMarketId, authorUserId: 'usr_maya', kind: 'question', title: 'Who fixes fences?', body: 'Looking for someone who fixes fences.' });
  await db.insert(communityReplies).values({ id: 'crep_tmp_phone_check', postId: POST, authorUserId: REPLIER, body: 'Try asking a yard helper.' });
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  await db.insert(tasks).values({ ...desk!, id: 'tsk_tmp_phone_check', slug: 'tsk-tmp-phone-check', posterUserId: POSTER, status: 'canceled', offerCount: 0, version: 1 });
});

afterAll(async () => {
  await db.delete(communityPosts).where(eq(communityPosts.id, POST));
  await db.delete(tasks).where(eq(tasks.id, 'tsk_tmp_phone_check'));
  await db.delete(users).where(inArray(users.id, [FRESH, REPLIER, POSTER]));
  await pool.end();
});

describe('the phone check', () => {
  it('is off without texts (a production build without Twilio)', async () => {
    expect(await loadPhoneCheck(db, FRESH, { NODE_ENV: 'production' })).toEqual({ check: 'off', verified: false });
  });

  it('once texts work, asks first-timers for the phone, and only asks someone who already replied in the community (aa’s sweep S5)', async () => {
    const texts = { NODE_ENV: 'production', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_MESSAGING_SERVICE_SID: 'MG1' };
    expect(await loadPhoneCheck(db, FRESH, texts)).toEqual({ check: 'required', verified: false });
    expect(await loadPhoneCheck(db, REPLIER, texts)).toEqual({ check: 'asked', verified: false });
    // Someone who posted a task before texts worked is in the grace too.
    expect(await loadPhoneCheck(db, POSTER, texts)).toEqual({ check: 'asked', verified: false });
  });
});
