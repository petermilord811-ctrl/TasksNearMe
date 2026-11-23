import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { confirmBooking, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookings } from '@/modules/bookings/schema';
import { creditRedemptions, posterCredits } from '@/modules/credits/schema';
import { availableCredit, CREDIT_RULES, ensureWelcomeCredit } from '@/modules/credits/service';
import { recordCompletionMoney } from '@/modules/earnings/service';
import { featureFlags } from '@/modules/markets/schema';
import { offers } from '@/modules/offers/schema';
import { payments, refunds } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

/** Credits for clients (blueprint 01 P2): a welcome credit shown at checkout and refunded when the job is done. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_tmp_credits';
const deps = { db, payments: createDevPaymentProvider() };
const now = new Date();
let marketId = '';

async function copyDesk(taskId: string, offerId: string) {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  marketId = desk!.marketId;
  await db.insert(tasks).values({ ...desk!, id: taskId, slug: `${taskId}-slug`, posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer!, id: offerId, taskId, status: 'pending', revision: 1, expiresAt: new Date(now.getTime() + 86_400_000) });
}
const setFlag = (enabled: boolean) => db.update(featureFlags).set({ enabled }).where(eq(featureFlags.key, 'credit.poster_welcome'));

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values({ ...maya!, id: CLIENT, email: 'tmp-credits@example.test', name: 'Cleo C.', firstName: 'Cleo', lastName: 'Cruz', phone: '+15125550614' });
  await copyDesk('tsk_credit_1', 'off_credit_1');
  await copyDesk('tsk_credit_2', 'off_credit_2');
});

afterAll(async () => {
  await setFlag(false);
  await db.delete(posterCredits).where(eq(posterCredits.userId, CLIENT));
  await pool.end();
});

describe('client credits', () => {
  it('gives none while the market hasn’t switched them on', async () => {
    await setFlag(false);
    await ensureWelcomeCredit(db, CLIENT, marketId, now);
    expect(await availableCredit(db, CLIENT, now)).toBeNull();
  });

  it('shows a first-time client their welcome credit at checkout', async () => {
    await setFlag(true);
    const page = await getBookingConfirmPage(deps, CLIENT, 'tsk_credit_1', 'off_credit_1', now);
    if (page?.kind !== 'page') throw new Error('expected the page');
    // What comes back on this booking: at most what the platform earns on it, the $3.00 hold fee (2026-11-23).
    expect(page.data.credit).toEqual({ amountCents: 300, expiresAt: expect.any(String) });
    // Only one welcome credit, however often the page opens.
    await ensureWelcomeCredit(db, CLIENT, marketId, now);
    expect(await db.select().from(posterCredits).where(eq(posterCredits.userId, CLIENT))).toHaveLength(1);
  });

  it('comes back to the card when the job is done, up to what the platform earned, once', async () => {
    const booked = await confirmBooking(deps, CLIENT, 'tsk_credit_1', 'off_credit_1', { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now);
    if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
    const bookingId = booked.redirectTo.split('/').pop()!;
    await db.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: now }).where(eq(bookings.id, bookingId));

    await recordCompletionMoney(db, bookingId, now, deps.payments);
    await recordCompletionMoney(db, bookingId, now, deps.payments);
    const back = await db.select().from(refunds).where(and(eq(refunds.bookingId, bookingId), eq(refunds.reason, 'poster_credit')));
    expect(back).toHaveLength(1);
    // Up to the $3.00 the platform earned (the hold fee); the other $7.00 of the welcome credit stays for later.
    expect(back[0]).toMatchObject({ amountCents: 300, status: 'succeeded', idempotencyKey: `credit:${bookingId}` });
    const [paid] = await db.select({ status: payments.status }).from(payments).where(eq(payments.bookingId, bookingId));
    expect(paid?.status).toBe('partially_refunded');
    expect(await db.select({ amount: creditRedemptions.amountCents }).from(creditRedemptions).where(eq(creditRedemptions.bookingId, bookingId))).toEqual([{ amount: 300 }]);
    expect(await availableCredit(db, CLIENT, now)).toMatchObject({ amountCents: CREDIT_RULES.welcomeCents - 300 });
  });

  it('gives no second welcome credit once a booking is done', async () => {
    await db.delete(posterCredits).where(eq(posterCredits.userId, CLIENT));
    await ensureWelcomeCredit(db, CLIENT, marketId, now);
    expect(await availableCredit(db, CLIENT, now)).toBeNull();
  });
});
