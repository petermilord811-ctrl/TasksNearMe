import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevGiftCardProvider } from '@/integrations/gift-cards';
import { users } from '@/modules/accounts/schema';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { quoteBreakdown } from '@/modules/payments/fees';
import { paymentMethods, payments } from '@/modules/payments/schema';
import { reviews } from '@/modules/reviews/schema';
import { rewardGrants } from '@/modules/rewards/schema';
import { getRewardsPage } from '@/modules/rewards/service';
import { decideReward } from '@/modules/rewards/staff';
import type { StaffActor } from '@/modules/support/staff';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Reward risk (blueprint 10 §3.2 T-25, T-27): a repeat reward earned by a self-dealing pair (the client paid
 * with a card the helper saved) goes to staff review when its hold ends, and a rejection voids it; reviews,
 * even a 1★ one, never change a reward. Two helper–client pairs made for this file.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const DAY = 86_400_000;
const giftCards = createDevGiftCardProvider();
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const SHARED_CARD = 'devpm_t25_shared';

async function person(id: string, source: string) {
  const [copy] = await db.select().from(users).where(eq(users.id, source));
  // Old accounts, so "new account" signals don't apply.
  await db.insert(users).values({ ...copy!, id, email: `${id}@example.test`, name: `P ${id.slice(-6)}`, phone: null, phoneVerifiedAt: null, createdAt: new Date(Date.now() - 200 * DAY) });
}

/** Three paid bookings between the pair within a month; the third completed and paid out 8 days ago. */
async function threeBookings(prefix: string, helperUserId: string, posterUserId: string, cardRef: string) {
  const [tv] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  for (const n of [1, 2, 3]) {
    const id = `bkg_${prefix}${n}`;
    const confirmedAt = new Date(Date.now() - (30 - n * 5) * DAY);
    const completed = n === 3;
    await db.insert(tasks).values({ ...task!, id: `tsk_${prefix}${n}`, slug: `${prefix}-${n}`, posterUserId, status: completed ? 'completed' : 'assigned' });
    await db.insert(bookings).values({ ...tv!, id, taskId: `tsk_${prefix}${n}`, offerId: null, posterUserId, helperUserId, status: completed ? 'completed' : 'confirmed', confirmedAt, createdAt: confirmedAt, ...(completed ? { completedAt: new Date(Date.now() - 8 * DAY), completedVia: 'poster' } : {}) });
    await db.insert(bookingTerms).values({ ...terms!, id: `btm_${prefix}${n}`, bookingId: id, priceCents: 3000, breakdown: quoteBreakdown(DEFAULT_FEES, { type: 'fixed', priceCents: 3000 }) });
    await db.insert(payments).values({ id: `pay_${prefix}${n}`, bookingId: id, purpose: 'booking_funding', payerUserId: posterUserId, amountCents: 3300, status: 'succeeded', provider: 'dev', providerRef: `devpi_${prefix}${n}`, methodRef: cardRef, methodBrand: 'visa', methodLast4: '4242', methodExpMonth: 12, methodExpYear: 2030, idempotencyKey: `test:${prefix}${n}`, createdAt: confirmedAt, updatedAt: confirmedAt });
    if (completed) {
      const transferredAt = new Date(Date.now() - 8 * DAY);
      await db.insert(earnings).values({ id: `ern_${prefix}${n}`, bookingId: id, helperUserId, kind: 'earnings', amountCents: 2700, status: 'transferred', transferredAt, createdAt: transferredAt });
    }
  }
}

const repeatOf = async (helperUserId: string) => (await getRewardsPage(db, { id: helperUserId, helperReady: true }, new Date())).grants.find((grant) => grant.program === 'repeat');

beforeAll(async () => {
  await person('usr_t25_helper', 'usr_sam');
  await person('usr_t25_client', 'usr_ruth');
  await person('usr_t27_helper', 'usr_sam');
  await person('usr_t27_client', 'usr_ruth');
  // The self-dealing pair: the helper saved the card the "client" pays with.
  await db.insert(paymentMethods).values({ id: 'pm_t25_shared', userId: 'usr_t25_helper', provider: 'dev', providerRef: SHARED_CARD, brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030, isDefault: true, createdAt: new Date(Date.now() - 100 * DAY) });
  await threeBookings('t25_', 'usr_t25_helper', 'usr_t25_client', SHARED_CARD);
  await threeBookings('t27_', 'usr_t27_helper', 'usr_t27_client', 'devpm_t27_clients_own');
});

afterAll(async () => {
  const people = ['usr_t25_helper', 'usr_t25_client', 'usr_t27_helper', 'usr_t27_client'];
  const ids = (await db.select({ id: bookings.id }).from(bookings).where(inArray(bookings.helperUserId, people))).map((row) => row.id);
  await db.delete(rewardGrants).where(inArray(rewardGrants.helperUserId, people));
  await db.delete(reviews).where(inArray(reviews.authorUserId, people));
  if (ids.length > 0) {
    await db.delete(earnings).where(inArray(earnings.bookingId, ids));
    await db.delete(payments).where(inArray(payments.bookingId, ids));
    await db.delete(bookingTerms).where(inArray(bookingTerms.bookingId, ids));
    await db.delete(bookings).where(inArray(bookings.id, ids));
  }
  await db.delete(tasks).where(like(tasks.id, 'tsk\\_t2_\\_%'));
  await db.delete(paymentMethods).where(inArray(paymentMethods.userId, people));
  await db.delete(users).where(inArray(users.id, people));
  await pool.end();
});

describe('reward risk', () => {
  it('T-25: a self-dealing pair goes to review after the hold, and a rejection voids the reward', async () => {
    // Each visit moves the grant one step: made, qualified (paid out 8 days ago), then past its 7-day hold.
    await repeatOf('usr_t25_helper');
    expect(await repeatOf('usr_t25_helper')).toMatchObject({ status: 'qualified' });
    const grant = await repeatOf('usr_t25_helper');
    expect(grant).toMatchObject({ status: 'in_review', amountCents: 1000 });

    expect(await decideReward(db, giftCards, morgan, { grantId: grant!.id, action: 'reject_review', note: 'The client paid with the helper’s own saved card.' }, new Date())).toEqual({ ok: true, code: 'updated' });
    // Rejected for risk: no new reward for the pair on the next visit.
    const after = (await getRewardsPage(db, { id: 'usr_t25_helper', helperReady: true }, new Date())).grants.filter((item) => item.program === 'repeat');
    expect(after.map((item) => [item.id, item.status])).toEqual([[grant!.id, 'voided']]);
    const [row] = await db.select().from(rewardGrants).where(eq(rewardGrants.id, grant!.id));
    expect(row).toMatchObject({ status: 'voided', voidReason: 'risk_review' });
    const audited = await db.select().from(auditLog).where(and(eq(auditLog.targetId, grant!.id), eq(auditLog.actorId, 'usr_morgan')));
    expect(audited.length).toBeGreaterThan(0);
  });

  it('T-27: without a risk signal the reward is redeemable after the hold, with or without reviews, even 1★', async () => {
    await repeatOf('usr_t27_helper');
    await repeatOf('usr_t27_helper');
    const before = await repeatOf('usr_t27_helper');
    expect(before).toMatchObject({ status: 'redeemable', amountCents: 1000 });

    const [seeded] = await db.select().from(reviews).where(eq(reviews.id, 'rev_seed_1'));
    await db.insert(reviews).values({ ...seeded!, id: 'rev_t27_low', bookingId: 'bkg_t27_3', authorUserId: 'usr_t27_client', subjectUserId: 'usr_t27_helper', rating: 1, tags: [], body: 'Not great.', status: 'published', publishedAt: new Date() });
    const after = await repeatOf('usr_t27_helper');
    expect(after).toMatchObject({ id: before!.id, status: 'redeemable', amountCents: 1000 });
  });
});
