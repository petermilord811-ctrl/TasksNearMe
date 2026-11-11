import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { acceptChange, declineChange, finishChangeVerification, getChangeReviewPage, getProposeChangePage, payChangeDifference, proposeChange, quoteChange, withdrawChange } from '@/modules/bookings/changes';
import { confirmBooking } from '@/modules/bookings/confirm';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { offers } from '@/modules/offers/schema';
import { payments, refunds } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const pay = createDevPaymentProvider();
const deps = { db, payments: pay };
const now = () => new Date();
const idOf = (redirect: string | undefined) => redirect!.split('/').pop()!;

/** Ruth books Jordan for a copy of the desk ($60, charged $66), confirmed and not started yet. */
let bookingId = '';
beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  await db.insert(tasks).values({ ...desk!, id: 'tsk_chg', slug: 'chg-desk', posterUserId: 'usr_ruth', status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer!, id: 'off_chg', taskId: 'tsk_chg', status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
  const booked = await confirmBooking(deps, 'usr_ruth', 'tsk_chg', 'off_chg', { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now());
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  bookingId = idOf(booked.redirectTo);
});

const termsVersion = async () => (await db.select({ v: bookings.termsVersion }).from(bookings).where(eq(bookings.id, bookingId)))[0]!.v;

describe('change requests', () => {
  it('quotes and proposes a chair (+$20): the client would pay $22.00 more; strangers see nothing', async () => {
    const page = await getProposeChangePage(db, 'usr_ruth', bookingId, now());
    expect(page?.allowedTypes).toEqual(['price', 'scope', 'schedule', 'expense_allowance']);
    expect(await getProposeChangePage(db, 'usr_sam', bookingId, now())).toBeNull();
    const chair = { priceCents: 8000, scopeText: 'Assemble the desk and the matching chair.', message: 'Could you also assemble the matching chair?' };
    expect(await quoteChange(db, 'usr_ruth', bookingId, chair, now())).toMatchObject({ ok: true, differenceCents: 2200, after: { posterTotalCents: 8800, helperEarningsCents: 7200 } });
    // The helper's quote shows earnings, not the client's difference.
    expect(await quoteChange(db, 'usr_jordan', bookingId, chair, now())).toMatchObject({ ok: true, differenceCents: 0 });

    const sent = await proposeChange(db, 'usr_ruth', bookingId, chair, now());
    expect(sent).toMatchObject({ ok: true, code: 'sent' });
    const changeId = idOf(sent.ok ? sent.redirectTo : undefined);
    expect(await proposeChange(db, 'usr_jordan', bookingId, { priceCents: 7000, message: 'Another change at the same time.' }, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getChangeReviewPage(db, pay, 'usr_jordan', bookingId, changeId, now()))?.change).toMatchObject({ fromMe: false, actions: ['accept_change', 'decline_change'] });
    expect((await getChangeReviewPage(db, pay, 'usr_ruth', bookingId, changeId, now()))?.change).toMatchObject({ fromMe: true, differenceCents: 2200, actions: ['withdraw_change'] });

    // Jordan accepts: the change waits for Ruth's payment, then applies.
    expect(await acceptChange(deps, 'usr_jordan', bookingId, changeId, {}, now())).toMatchObject({ ok: true, code: 'updated' });
    const payPage = await getChangeReviewPage(db, pay, 'usr_ruth', bookingId, changeId, now());
    expect(payPage?.change).toMatchObject({ status: 'accepted_pending_funding', actions: ['pay_change_difference'] });
    expect(payPage?.payment).toBeDefined();
    expect(await payChangeDifference(deps, 'usr_ruth', bookingId, changeId, { payment: { kind: 'dev_card', card: 'declined', save: false } }, now())).toMatchObject({ ok: false, code: 'payment_declined' });
    expect(await payChangeDifference(deps, 'usr_ruth', bookingId, changeId, { payment: { kind: 'dev_card', card: 'success', save: false } }, now())).toMatchObject({ ok: true, code: 'paid' });
    expect(await termsVersion()).toBe(2);
    const [terms] = await db.select().from(bookingTerms).where(and(eq(bookingTerms.bookingId, bookingId), eq(bookingTerms.version, 2)));
    expect(terms?.breakdown).toMatchObject({ taskPriceCents: 8000, posterTotalCents: 8800 });
    expect((await db.select().from(payments).where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'change_funding'), eq(payments.status, 'succeeded'))))[0]?.amountCents).toBe(2200);
  });

  it('refunds a lower price at once; declines and withdrawals keep the terms', async () => {
    const lower = await proposeChange(db, 'usr_jordan', bookingId, { priceCents: 7000, message: 'The chair was quicker than expected.' }, now());
    const lowerId = idOf(lower.ok ? lower.redirectTo : undefined);
    expect(await acceptChange(deps, 'usr_ruth', bookingId, lowerId, {}, now())).toMatchObject({ ok: true, code: 'updated' });
    expect(await termsVersion()).toBe(3);
    expect((await db.select().from(refunds).where(and(eq(refunds.bookingId, bookingId), eq(refunds.reason, 'change_decrease'))))[0]?.amountCents).toBe(1100);

    const later = await proposeChange(db, 'usr_ruth', bookingId, { scopeText: 'Assemble the desk and the chair, and take the boxes out.', message: 'Could you also take the boxes out?' }, now());
    const laterId = idOf(later.ok ? later.redirectTo : undefined);
    expect(await withdrawChange(db, 'usr_jordan', bookingId, laterId, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await declineChange(db, 'usr_jordan', bookingId, laterId, now())).toMatchObject({ ok: true, code: 'updated' });
    const again = await proposeChange(db, 'usr_ruth', bookingId, { scopeText: 'Assemble the desk and the chair, and take the boxes out.', message: 'Could you also take the boxes out?' }, now());
    const againId = idOf(again.ok ? again.redirectTo : undefined);
    expect(await withdrawChange(db, 'usr_ruth', bookingId, againId, now())).toMatchObject({ ok: true, code: 'updated' });
    expect(await termsVersion()).toBe(3);
  });

  it('lets the client finish a bank check when paying a difference', async () => {
    const more = await proposeChange(db, 'usr_jordan', bookingId, { priceCents: 9000, message: 'The chair needs extra parts assembled.' }, now());
    const moreId = idOf(more.ok ? more.redirectTo : undefined);
    const asked = await acceptChange(deps, 'usr_ruth', bookingId, moreId, { payment: { kind: 'dev_card', card: 'requires_verification', save: false } }, now());
    expect(asked).toMatchObject({ ok: false, code: 'requires_bank_verification' });
    const paymentId = !asked.ok && 'verification' in asked ? asked.verification.paymentId : '';
    expect(await finishChangeVerification(deps, 'usr_ruth', bookingId, moreId, paymentId, 'approved', now())).toMatchObject({ ok: true, code: 'paid' });
    expect(await termsVersion()).toBe(4);
  });
});
