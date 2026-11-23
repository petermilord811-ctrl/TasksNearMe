import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfirmBookingInput } from '@/contracts';
import { needsBankVerification } from '@/contracts';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking, finishBankVerification, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookings } from '@/modules/bookings/schema';
import { getMyTasks } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { paymentMethods, payments } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const deps = { db, payments: createDevPaymentProvider() };
const now = () => new Date();

/** Copies of the desk posted by Maya, so this file never changes the seeded desk other tests read. */
async function copyDesk(id: string, helpers: { offerId: string; helperUserId: string; priceCents: number }[]) {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [jordanOffer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !jordanOffer) throw new Error('The seeded desk is missing');
  await db.insert(tasks).values({ ...desk, id, slug: `${id}-slug`, status: 'open', offerCount: helpers.length, version: 1 });
  for (const helper of helpers) {
    await db.insert(offers).values({
      ...jordanOffer,
      id: helper.offerId,
      taskId: id,
      helperUserId: helper.helperUserId,
      priceCents: helper.priceCents,
      status: 'pending',
      revision: 1,
      expiresAt: new Date(Date.now() + 24 * 3_600_000),
    });
  }
}

const input = (payment: ConfirmBookingInput['payment'], offerRevision = 1): ConfirmBookingInput => ({ offerRevision, payment, acceptTerms: true });
const card = (name: 'success' | 'declined' | 'insufficient_funds' | 'requires_verification', save = false) => ({ kind: 'dev_card' as const, card: name, save });

beforeAll(async () => {
  await copyDesk('tsk_bk1', [
    { offerId: 'off_bk1_jordan', helperUserId: 'usr_jordan', priceCents: 6000 },
    { offerId: 'off_bk1_sam', helperUserId: 'usr_sam', priceCents: 5500 },
  ]);
  await copyDesk('tsk_bk2', [{ offerId: 'off_bk2_jordan', helperUserId: 'usr_jordan', priceCents: 6000 }]);
  await copyDesk('tsk_bk3', [{ offerId: 'off_bk3_priya', helperUserId: 'usr_priya', priceCents: 6000 }]);
});

describe('booking an offer', () => {
  it('shows the terms, the cancellation terms and the saved cards', async () => {
    const page = await getBookingConfirmPage(deps, 'usr_maya', 'tsk_bk1', 'off_bk1_jordan', now());
    if (page?.kind !== 'page') throw new Error('expected the page');
    expect(page.data.breakdown).toMatchObject({ posterTotalCents: 6300, helperEarningsCents: 6000 });
    expect(page.data.cancellation).toMatchObject({ lateRefundCents: 5100, lateHelperCompensationCents: 1200 });
    expect(page.data.payment.methods.map((m) => [m.id, m.isDefault])).toEqual([
      ['pm_maya_visa', true],
      ['pm_maya_mc', false],
    ]);
    expect(page.data.pending).toBeUndefined();
    expect(page.data.unavailable).toBeUndefined();
    expect(await getBookingConfirmPage(deps, 'usr_chris', 'tsk_bk1', 'off_bk1_jordan', now())).toBeNull();
  });

  it('keeps a 30-minute hold when the card is declined', async () => {
    expect(await confirmBooking(deps, 'usr_maya', 'tsk_bk1', 'off_bk1_jordan', input(card('declined')), now())).toEqual({
      ok: false,
      code: 'payment_declined',
    });
    const page = await getBookingConfirmPage(deps, 'usr_maya', 'tsk_bk1', 'off_bk1_jordan', now());
    if (page?.kind !== 'page') throw new Error('expected the page');
    expect(page.data.pending?.lastFailure).toMatchObject({ code: 'payment_declined', method: { brand: 'visa', last4: '0002' } });
    const held = Date.parse(page.data.pending!.expiresAt) - Date.now();
    expect(held).toBeGreaterThan(29 * 60_000);
    expect(held).toBeLessThanOrEqual(30 * 60_000);
  });

  it('refuses a stale revision and a missing card', async () => {
    expect(await confirmBooking(deps, 'usr_maya', 'tsk_bk1', 'off_bk1_jordan', input(card('success'), 2), now())).toEqual({
      ok: false,
      code: 'version_conflict',
    });
    expect(await confirmBooking(deps, 'usr_maya', 'tsk_bk1', 'off_bk1_jordan', input({ kind: 'saved', methodId: 'pm_nope' }), now())).toEqual({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { 'payment.methodId': ['invalid'] },
    });
    expect(await confirmBooking(deps, 'usr_maya', 'tsk_bk1', 'off_bk1_jordan', { ...input(card('success')), acceptTerms: false }, now())).toMatchObject({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { acceptTerms: ['must_accept'] },
    });
  });

  it('goes through the bank step: a failed check declines, an approved one books', async () => {
    const first = await confirmBooking(deps, 'usr_maya', 'tsk_bk1', 'off_bk1_jordan', input(card('requires_verification', true)), now());
    if (!needsBankVerification(first)) throw new Error('expected the bank step');
    expect(await finishBankVerification(deps, 'usr_chris', first.verification.paymentId, 'approved', now())).toEqual({ ok: false, code: 'not_found' });
    expect(await finishBankVerification(deps, 'usr_maya', first.verification.paymentId, 'failed', now())).toEqual({ ok: false, code: 'payment_declined' });

    const second = await confirmBooking(deps, 'usr_maya', 'tsk_bk1', 'off_bk1_jordan', input(card('requires_verification', true)), now());
    if (!needsBankVerification(second)) throw new Error('expected the bank step');
    const booked = await finishBankVerification(deps, 'usr_maya', second.verification.paymentId, 'approved', now());
    expect(booked).toMatchObject({ ok: true, code: 'booked', redirectTo: expect.stringMatching(/^\/app\/bookings\/bkg_/) });
  });

  it('confirms: the offer is accepted, the others declined, the task assigned, the card saved', async () => {
    const [booking] = await db.select().from(bookings).where(and(eq(bookings.taskId, 'tsk_bk1'), eq(bookings.status, 'confirmed')));
    expect(booking).toMatchObject({ offerId: 'off_bk1_jordan', posterUserId: 'usr_maya', helperUserId: 'usr_jordan' });
    const offerRows = await db.select({ id: offers.id, status: offers.status }).from(offers).where(eq(offers.taskId, 'tsk_bk1'));
    expect(Object.fromEntries(offerRows.map((o) => [o.id, o.status]))).toEqual({ off_bk1_jordan: 'accepted', off_bk1_sam: 'declined' });
    const [task] = await db.select({ status: tasks.status, offerCount: tasks.offerCount }).from(tasks).where(eq(tasks.id, 'tsk_bk1'));
    expect(task).toEqual({ status: 'assigned', offerCount: 0 });
    const paid = await db.select({ status: payments.status, amount: payments.amountCents }).from(payments).where(eq(payments.bookingId, booking!.id));
    expect(paid.filter((p) => p.status === 'succeeded')).toEqual([{ status: 'succeeded', amount: 6300 }]);
    const saved = await db.select().from(paymentMethods).where(and(eq(paymentMethods.userId, 'usr_maya'), eq(paymentMethods.last4, '3155')));
    expect(saved).toHaveLength(1);
    const events = await db.select({ type: outboxEvents.type }).from(outboxEvents).where(eq(outboxEvents.aggregateId, booking!.id));
    expect(events.map((e) => e.type)).toContain('booking.confirmed');

    // The page now sends the poster to the booking; a second click books nothing new.
    expect(await getBookingConfirmPage(deps, 'usr_maya', 'tsk_bk1', 'off_bk1_jordan', now())).toEqual({ kind: 'booked', bookingId: booking!.id });
    expect(await confirmBooking(deps, 'usr_maya', 'tsk_bk1', 'off_bk1_jordan', input(card('success')), now())).toMatchObject({ ok: true, code: 'booked' });
    const sam = await getBookingConfirmPage(deps, 'usr_maya', 'tsk_bk1', 'off_bk1_sam', now());
    expect(sam?.kind === 'page' && sam.data.unavailable).toBe('task_booked');
    const mine = await getMyTasks(db, 'usr_maya', now());
    expect(mine.booked.find((row) => row.id === 'tsk_bk1')?.bookingId).toBe(booking!.id);
    expect(mine.booked.find((row) => row.id === 'tsk_bk1')?.booking).toMatchObject({ status: 'confirmed', helper: { displayName: 'Jordan T.' } });
  });

  it('cancels an unpaid hold after 30 minutes, and the offer stays open', async () => {
    await confirmBooking(deps, 'usr_maya', 'tsk_bk2', 'off_bk2_jordan', input(card('insufficient_funds')), now());
    await db.update(bookings).set({ fundingExpiresAt: new Date(Date.now() - 60_000) }).where(eq(bookings.taskId, 'tsk_bk2'));
    const page = await getBookingConfirmPage(deps, 'usr_maya', 'tsk_bk2', 'off_bk2_jordan', now());
    if (page?.kind !== 'page') throw new Error('expected the page');
    expect(page.data.pending).toBeUndefined();
    expect(page.data.unavailable).toBeUndefined();
    const [hold] = await db.select().from(bookings).where(eq(bookings.taskId, 'tsk_bk2'));
    expect(hold).toMatchObject({ status: 'canceled', cancelReason: 'funding_failed' });
    expect(await confirmBooking(deps, 'usr_maya', 'tsk_bk2', 'off_bk2_jordan', input({ kind: 'saved', methodId: 'pm_maya_visa' }), now())).toMatchObject({
      ok: true,
      code: 'booked',
    });
  });

  it("won't book a helper who can't be booked", async () => {
    expect(await confirmBooking(deps, 'usr_maya', 'tsk_bk3', 'off_bk3_priya', input(card('success')), now())).toEqual({ ok: false, code: 'not_allowed' });
  });
});
