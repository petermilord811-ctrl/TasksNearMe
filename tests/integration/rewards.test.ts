import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDevGiftCardProvider } from '@/integrations/gift-cards';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { rewardGrants } from '@/modules/rewards/schema';
import { getRewardsPage, redeemReward } from '@/modules/rewards/service';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const deps = { db, giftCards: createDevGiftCardProvider() };

describe('the welcome gift card', () => {
  it('is Jordan’s for his phone, ID and background checks (no booking), and redeems to a gift card link', async () => {
    const page = await getRewardsPage(db, { id: 'usr_jordan', helperReady: true }, new Date());
    const welcome = page.grants.find((grant) => grant.program === 'welcome');
    expect(welcome).toMatchObject({ amountCents: 5000, status: 'in_review', actions: [] });
    expect(welcome).not.toHaveProperty('booking');
    expect(page.welcome).toMatchObject({ state: 'earned', foundingNumber: 63 });
    expect(page.totals.pendingCents).toBeGreaterThanOrEqual(5000);
    // Asking twice changes nothing.
    expect((await getRewardsPage(db, { id: 'usr_jordan', helperReady: true }, new Date())).grants.filter((grant) => grant.program === 'welcome')).toHaveLength(1);

    expect(await redeemReward(deps, 'usr_jordan', welcome!.id, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    // Our team's check passed (the staff tools do this; welcome-reward.test.ts goes through them).
    await db.update(rewardGrants).set({ status: 'redeemable', redeemableAt: new Date(), expiresAt: new Date(Date.now() + 90 * 86_400_000) }).where(eq(rewardGrants.id, welcome!.id));
    expect(await redeemReward(deps, 'usr_sam', welcome!.id, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await redeemReward(deps, 'usr_jordan', welcome!.id, new Date())).toEqual({ ok: true, code: 'submitted' });
    const after = await getRewardsPage(db, { id: 'usr_jordan', helperReady: true }, new Date());
    expect(after.grants.find((grant) => grant.id === welcome!.id)).toMatchObject({ status: 'delivered', deliveryUrl: `/dev/gift-cards/${welcome!.id}`, actions: ['open_gift_card'] });
    expect(after.totals.redeemedThisYearCents).toBe(5000);
    expect(await redeemReward(deps, 'usr_jordan', welcome!.id, new Date())).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('has no window or cohort: Lee, verified in June with no founding number, gets one too; a client gets none', async () => {
    expect((await getRewardsPage(db, { id: 'usr_lee', helperReady: true }, new Date())).grants.filter((grant) => grant.program === 'welcome')).toEqual([expect.objectContaining({ amountCents: 5000 })]);
    expect(await getRewardsPage(db, { id: 'usr_maya', helperReady: false }, new Date())).toMatchObject({ helperReady: false, grants: [] });
    expect((await db.select().from(rewardGrants).where(and(eq(rewardGrants.helperUserId, 'usr_maya'), eq(rewardGrants.program, 'welcome'))))).toEqual([]);
  });
});

describe('the repeat reward', () => {
  it('comes with the third paid booking with the same client, and is voided if that booking is canceled', async () => {
    // Priya books Lee three times (no other test pairs them), with copies of the seeded TV booking and its task.
    const [tv] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
    const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
    const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
    for (const n of [1, 2, 3]) {
      const confirmedAt = new Date(Date.now() - (4 - n) * 86_400_000);
      await db.insert(tasks).values({ ...task!, id: `tsk_rw${n}`, slug: `rw-${n}`, posterUserId: 'usr_priya', status: 'assigned' });
      await db.insert(bookings).values({ ...tv!, id: `bkg_rw${n}`, taskId: `tsk_rw${n}`, offerId: null, posterUserId: 'usr_priya', helperUserId: 'usr_lee', status: 'confirmed', confirmedAt, createdAt: confirmedAt });
      await db.insert(bookingTerms).values({ ...terms!, id: `btm_rw${n}`, bookingId: `bkg_rw${n}` });
    }
    const page = await getRewardsPage(db, { id: 'usr_lee', helperReady: true }, new Date());
    expect(page.grants.find((grant) => grant.program === 'repeat')).toMatchObject({ amountCents: 1000, status: 'pending', clientDisplayName: 'Priya S.', booking: { id: 'bkg_rw3' } });
    // Other clients may show progress; Priya's reward is earned, so there's no progress row for that pair.
    expect(page.repeatProgress.map((row) => row.clientDisplayName)).not.toContain('Priya S.');

    await db.update(bookings).set({ status: 'canceled', canceledAt: new Date() }).where(eq(bookings.id, 'bkg_rw3'));
    const after = await getRewardsPage(db, { id: 'usr_lee', helperReady: true }, new Date());
    expect(after.grants.find((grant) => grant.program === 'repeat')).toMatchObject({ status: 'voided', voidReason: 'booking_canceled' });
    expect(after.repeatProgress).toContainEqual(expect.objectContaining({ clientDisplayName: 'Priya S.', paidBookings: 2, needed: 3 }));
    const live = await db.select().from(rewardGrants).where(and(eq(rewardGrants.helperUserId, 'usr_lee'), eq(rewardGrants.program, 'repeat')));
    expect(live).toHaveLength(1);
  });
});
