import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevGiftCardProvider } from '@/integrations/gift-cards';
import { users } from '@/modules/accounts/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { rewardGrants } from '@/modules/rewards/schema';
import { getRewardsPage, redeemReward } from '@/modules/rewards/service';
import { decideReward } from '@/modules/rewards/staff';
import { runWelcomeRewards, welcomeCardFor } from '@/modules/rewards/welcome';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * T-22, the welcome gift card through its whole life under the owner's rule of 2026-11-14: every helper whose
 * phone, ID and background checks have passed gets $50, with no booking, window or cohort. The job runner's sweep
 * gives it to a helper verified before the change (the backfill); a missing background check earns nothing; our
 * team's quick check makes it ready (the helper is told), it's redeemed once, and an unredeemed card expires.
 * Turned down after a review, it never comes back. New helpers made for this file (copies of Sam, whose ID and
 * background checks are done), removed after it.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const giftCards = createDevGiftCardProvider();
const DAY = 86_400_000;
const HELPER = 'usr_t22_helper';
const NO_BACKGROUND = 'usr_t22_nobg';
const TURNED_DOWN = 'usr_t22_down';
const morgan = { id: 'usr_morgan', roles: ['support_lead' as const] };

const welcomeOf = async (helperUserId: string) => db.select().from(rewardGrants).where(and(eq(rewardGrants.helperUserId, helperUserId), eq(rewardGrants.program, 'welcome')));
const eventsOf = async (type: string, userId: string) => db.select().from(outboxEvents).where(and(eq(outboxEvents.type, type), sql`${outboxEvents.payload}->>'userId' = ${userId}`));

/** A helper with a verified phone and ID, and a background check cleared at `background` (null: not done). */
async function helper(id: string, background: string | null) {
  const [sam] = await db.select().from(users).where(eq(users.id, 'usr_sam'));
  const [samProfile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
  await db.insert(users).values({ ...sam!, id, email: `${id}@example.test`, name: `T22 ${id.slice(-4)}`, phone: null, phoneVerifiedAt: new Date('2019-12-01T12:00:00.000Z') });
  await db.insert(helperProfiles).values({ ...samProfile!, userId: id, handle: id.replace(/_/g, '-'), foundingNumber: null, completedCount: 0, ratingAverage: null, ratingCount: 0, backgroundCheckedAt: background });
}

beforeAll(async () => {
  // Checked long before anyone else, so the sweep's oldest-first batch of one is this helper.
  await helper(HELPER, '2019-12-02T12:00:00.000Z');
  await helper(NO_BACKGROUND, null);
  await helper(TURNED_DOWN, '2019-12-09T12:00:00.000Z');
});

afterAll(async () => {
  const helpers = (await db.select({ id: users.id }).from(users).where(like(users.id, 'usr\\_t22\\_%'))).map((row) => row.id);
  if (helpers.length > 0) {
    await db.delete(rewardGrants).where(inArray(rewardGrants.helperUserId, helpers));
    await db.delete(outboxEvents).where(and(inArray(outboxEvents.type, ['reward.earned', 'reward.ready']), inArray(sql`${outboxEvents.payload}->>'userId'`, helpers)));
    await db.delete(helperProfiles).where(inArray(helperProfiles.userId, helpers));
    await db.delete(users).where(inArray(users.id, helpers));
  }
  await pool.end();
});

describe('T-22: the welcome gift card', () => {
  it('reaches a helper verified before the change through the sweep, with no booking, and says so once', async () => {
    expect(await runWelcomeRewards(db, new Date(), { limit: 1 })).toBe(1);
    const [grant, ...more] = await welcomeOf(HELPER);
    expect(more).toHaveLength(0);
    expect(grant).toMatchObject({ amountCents: 5000, bookingId: null, status: 'in_review' });
    expect(await eventsOf('reward.earned', HELPER)).toHaveLength(1);
    // The page shows it on its way; asking again changes nothing.
    const page = await getRewardsPage(db, { id: HELPER, helperReady: true }, new Date());
    expect(page.welcome).toMatchObject({ state: 'earned', amountCents: 5000 });
    expect(page.grants.filter((item) => item.program === 'welcome')).toEqual([expect.objectContaining({ status: 'in_review', actions: [] })]);
    expect(page.totals.pendingCents).toBe(5000);
    expect(await welcomeOf(HELPER)).toHaveLength(1);
  });

  it('isn’t earned without the background check: the card shows what’s left', async () => {
    const page = await getRewardsPage(db, { id: NO_BACKGROUND, helperReady: true }, new Date());
    expect(page.grants.filter((item) => item.program === 'welcome')).toEqual([]);
    expect(page.welcome).toMatchObject({ state: 'open', checks: [{ check: 'phone', state: 'done' }, { check: 'identity', state: 'done' }, { check: 'background', state: expect.not.stringMatching(/^done$/) }] });
    expect(await welcomeOf(NO_BACKGROUND)).toHaveLength(0);
  });

  it('is ready once our team approves it (the helper is told), redeems once, and the card says it was sent', async () => {
    const [grant] = await welcomeOf(HELPER);
    expect(await redeemReward({ db, giftCards }, HELPER, grant!.id, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await decideReward(db, giftCards, morgan, { grantId: grant!.id, action: 'approve_review', note: 'Checks all clear; one account.' }, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await eventsOf('reward.ready', HELPER)).toHaveLength(1);
    expect(await welcomeCardFor(db, HELPER, new Date())).toMatchObject({ state: 'ready', expiresAt: expect.any(String) });

    expect(await redeemReward({ db, giftCards }, HELPER, grant!.id, new Date())).toEqual({ ok: true, code: 'submitted' });
    expect(await welcomeCardFor(db, HELPER, new Date())).toMatchObject({ state: 'delivered' });
    expect(await redeemReward({ db, giftCards }, HELPER, grant!.id, new Date())).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('expires when it isn’t redeemed within 90 days of being ready', async () => {
    // The rewards page gives it lazily, like the verification event would.
    await getRewardsPage(db, { id: TURNED_DOWN, helperReady: true }, new Date());
    const [grant] = await welcomeOf(TURNED_DOWN);
    await db.update(rewardGrants).set({ status: 'redeemable', redeemableAt: new Date(Date.now() - 91 * DAY), expiresAt: new Date(Date.now() - DAY) }).where(eq(rewardGrants.id, grant!.id));
    const page = await getRewardsPage(db, { id: TURNED_DOWN, helperReady: true }, new Date());
    expect(page.grants.find((item) => item.id === grant!.id)).toMatchObject({ status: 'expired' });
    // Expired: no second card, and the card no longer shows.
    expect(await welcomeOf(TURNED_DOWN)).toHaveLength(1);
    expect(page.welcome).toBeUndefined();
  });

  it('never comes back once our team turns it down', async () => {
    const [grant] = await welcomeOf(TURNED_DOWN);
    await db.update(rewardGrants).set({ status: 'in_review', expiresAt: null, redeemableAt: null }).where(eq(rewardGrants.id, grant!.id));
    expect(await decideReward(db, giftCards, morgan, { grantId: grant!.id, action: 'reject_review', note: 'Second account of a helper we know.' }, new Date())).toEqual({ ok: true, code: 'updated' });
    await getRewardsPage(db, { id: TURNED_DOWN, helperReady: true }, new Date());
    expect((await welcomeOf(TURNED_DOWN)).filter((row) => row.status !== 'voided')).toHaveLength(0);
    expect(await welcomeCardFor(db, TURNED_DOWN, new Date())).toBeUndefined();
  });
});
