import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevGiftCardProvider } from '@/integrations/gift-cards';
import { users } from '@/modules/accounts/schema';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { rewardGrants } from '@/modules/rewards/schema';
import { getRewardsPage, redeemReward } from '@/modules/rewards/service';
import { decideReward } from '@/modules/rewards/staff';
import { tasks } from '@/modules/tasks/schema';
import { identityVerifications } from '@/modules/verification/schema';
import { createDb } from '@/platform/db/connect';

/**
 * T-22, the welcome reward through its whole life: a $35 task earns nothing, a $60 one is pending, a
 * cancellation voids it and the next qualifying booking earns a new one, which qualifies when paid out,
 * waits 7 days, is reviewed and redeemed. Past the founding cohort of 100, nothing is granted. New helpers
 * made for this file (and removed after it); Ana is the client.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const giftCards = createDevGiftCardProvider();
const DAY = 86_400_000;
const HELPER = 'usr_t22_helper';
const LATE = 'usr_t22_late';
const morgan = { id: 'usr_morgan', roles: ['support_lead' as const] };

const rewardsOf = async (helperUserId: string, now = new Date()) =>
  (await getRewardsPage(db, { id: helperUserId, helperReady: true }, now)).grants.filter((grant) => grant.program === 'welcome');

async function helper(id: string, verifiedAt: Date) {
  const [sam] = await db.select().from(users).where(eq(users.id, 'usr_sam'));
  await db.insert(users).values({ ...sam!, id, email: `${id}@example.test`, name: `T22 ${id.slice(-4)}`, phone: null, phoneVerifiedAt: null });
  await db.insert(identityVerifications).values({ id: `idv_${id}`, userId: id, provider: 'dev', providerSessionId: `dev_${id}`, status: 'verified', isAdult: true, verifiedAt, createdAt: verifiedAt, updatedAt: verifiedAt });
}

/** A booking funded `daysAgo` for `priceCents`, between Ana and the helper, on a copy of the TV task. */
async function booking(id: string, helperUserId: string, priceCents: number, daysAgo: number) {
  const [tv] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  const confirmedAt = new Date(Date.now() - daysAgo * DAY);
  await db.insert(tasks).values({ ...task!, id: `tsk_${id}`, slug: `t22-${id}`, posterUserId: 'usr_ana', status: 'assigned' });
  await db.insert(bookings).values({ ...tv!, id, taskId: `tsk_${id}`, offerId: null, posterUserId: 'usr_ana', helperUserId, status: 'confirmed', confirmedAt, createdAt: confirmedAt });
  await db.insert(bookingTerms).values({ ...terms!, id: `btm_${id}`, bookingId: id, priceCents, breakdown: quoteBreakdown(DEFAULT_FEES, { type: 'fixed', priceCents }) });
}

beforeAll(async () => {
  await helper(HELPER, new Date(Date.now() - 20 * DAY));
});

afterAll(async () => {
  const helpers = (await db.select({ id: users.id }).from(users).where(like(users.id, 'usr\\_t22\\_%'))).map((row) => row.id);
  if (helpers.length > 0) {
    await db.delete(rewardGrants).where(inArray(rewardGrants.helperUserId, helpers));
    await db.delete(earnings).where(inArray(earnings.helperUserId, helpers));
    const rows = (await db.select({ id: bookings.id }).from(bookings).where(inArray(bookings.helperUserId, helpers))).map((row) => row.id);
    if (rows.length > 0) {
      await db.delete(bookingTerms).where(inArray(bookingTerms.bookingId, rows));
      await db.delete(bookings).where(inArray(bookings.id, rows));
      await db.delete(tasks).where(inArray(tasks.id, rows.map((row) => `tsk_${row}`)));
    }
    await db.delete(identityVerifications).where(inArray(identityVerifications.userId, helpers));
    await db.delete(users).where(inArray(users.id, helpers));
  }
  await pool.end();
});

describe('T-22: the welcome reward', () => {
  it('skips a $35 task, voids with a canceled booking, and grants again for the next qualifying one', async () => {
    await booking('bkg_t22_small', HELPER, 3500, 10);
    expect(await rewardsOf(HELPER)).toEqual([]);

    await booking('bkg_t22_first', HELPER, 6000, 9);
    const [first] = await rewardsOf(HELPER);
    expect(first).toMatchObject({ amountCents: 5000, status: 'pending', booking: { id: 'bkg_t22_first' } });

    await db.update(bookings).set({ status: 'canceled', cancelReason: 'poster_early', canceledAt: new Date() }).where(eq(bookings.id, 'bkg_t22_first'));
    expect((await rewardsOf(HELPER)).find((grant) => grant.id === first!.id)).toMatchObject({ status: 'voided', voidReason: 'booking_canceled' });

    await booking('bkg_t22_second', HELPER, 6000, 8);
    const second = (await rewardsOf(HELPER)).find((grant) => grant.status === 'pending');
    expect(second).toMatchObject({ amountCents: 5000, booking: { id: 'bkg_t22_second' } });
    expect(second!.id).not.toBe(first!.id);
  });

  it('qualifies when the work is paid out, waits 7 days, goes to review, then redeems once', async () => {
    const [grant] = (await rewardsOf(HELPER)).filter((item) => item.status === 'pending');
    const transferredAt = new Date(Date.now() - 2 * DAY);
    await db.update(bookings).set({ status: 'completed', completedAt: transferredAt, completedVia: 'poster' }).where(eq(bookings.id, 'bkg_t22_second'));
    await db.insert(earnings).values({ id: 'ern_t22_second', bookingId: 'bkg_t22_second', helperUserId: HELPER, kind: 'earnings', amountCents: 5400, status: 'transferred', transferredAt, createdAt: transferredAt });
    expect((await rewardsOf(HELPER)).find((item) => item.id === grant!.id)).toMatchObject({ status: 'qualified' });

    // Still on hold 6 days later; after 7 days (5 from now) it goes to staff review.
    expect((await rewardsOf(HELPER, new Date(Date.now() + 3 * DAY))).find((item) => item.id === grant!.id)).toMatchObject({ status: 'qualified' });
    expect((await rewardsOf(HELPER, new Date(Date.now() + 5 * DAY + 60_000))).find((item) => item.id === grant!.id)).toMatchObject({ status: 'in_review' });
    expect(await redeemReward({ db, giftCards }, HELPER, grant!.id, new Date())).toEqual({ ok: false, code: 'not_allowed' });

    expect(await decideReward(db, giftCards, morgan, { grantId: grant!.id, action: 'approve_review', note: 'First booking with a long-standing client.' }, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await redeemReward({ db, giftCards }, HELPER, grant!.id, new Date())).toEqual({ ok: true, code: 'submitted' });
    expect((await rewardsOf(HELPER)).find((item) => item.id === grant!.id)).toMatchObject({ status: 'delivered' });
    expect(await redeemReward({ db, giftCards }, HELPER, grant!.id, new Date())).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('grants nothing once the founding cohort of 100 is full', async () => {
    // 100 helpers verified before this one.
    const earlier = Array.from({ length: 100 }, (_, n) => `usr_t22_c${String(n).padStart(3, '0')}`);
    for (const id of earlier) await helper(id, new Date(Date.now() - 30 * DAY));
    await helper(LATE, new Date(Date.now() - 5 * DAY));
    await booking('bkg_t22_late', LATE, 6000, 2);
    expect(await rewardsOf(LATE)).toEqual([]);
  });
});
