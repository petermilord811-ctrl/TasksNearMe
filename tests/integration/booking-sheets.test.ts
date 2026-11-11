import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking } from '@/modules/bookings/confirm';
import { bookings, helperStrikes } from '@/modules/bookings/schema';
import {
  cancelBookingBy,
  expireCantAccess,
  previewCancellation,
  reportCantAccess,
  reportNoShow,
  reportRunningLate,
  submitSafetyReport,
} from '@/modules/bookings/sheets';
import { offers } from '@/modules/offers/schema';
import { payments, refunds } from '@/modules/payments/schema';
import { supportCases } from '@/modules/support/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const deps = { db, payments: createDevPaymentProvider() };
const HOUR = 3_600_000;

/** A booked copy of the desk posted by Ben (paying has a per-person limit), starting `startsIn` from now. */
async function booked(id: string, startsInMs: number): Promise<{ bookingId: string; start: Date }> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  const start = new Date(Date.now() + startsInMs);
  await db.insert(tasks).values({ ...desk, id, slug: `${id}-slug`, posterUserId: 'usr_ben', status: 'open', offerCount: 1, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR) });
  await db.insert(offers).values({ ...offer, id: `off_${id}`, taskId: id, status: 'pending', revision: 1, proposedStart: start, expiresAt: new Date(Math.min(start.getTime(), Date.now() + 72 * HOUR)) });
  const result = await confirmBooking(deps, 'usr_ben', id, `off_${id}`, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
  if (!result.ok || !result.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(result)}`);
  return { bookingId: result.redirectTo.split('/').pop()!, start };
}

async function refundsOf(bookingId: string) {
  return db.select({ amount: refunds.amountCents, status: refunds.status }).from(refunds).where(eq(refunds.bookingId, bookingId));
}

describe('cancelling', () => {
  it('refunds everything when the client cancels early', async () => {
    const { bookingId } = await booked('tsk_sh_early', 3 * 24 * HOUR);
    expect(await previewCancellation(db, 'usr_ben', bookingId, new Date())).toMatchObject({ by: 'poster', late: false, posterRefundCents: 6600, helperCompensationCents: 0 });
    expect(await cancelBookingBy(deps, 'usr_ben', bookingId, { reason: 'unavailable', note: '' }, new Date())).toEqual({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { reason: ['invalid'] },
    });
    expect(await cancelBookingBy(deps, 'usr_ben', bookingId, { reason: 'plans_changed', note: '' }, new Date())).toEqual({ ok: true, code: 'canceled' });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(row).toMatchObject({ status: 'canceled', cancelReason: 'poster_early', canceledBy: 'poster', cancelChoice: 'plans_changed' });
    expect(await refundsOf(bookingId)).toEqual([{ amount: 6600, status: 'succeeded' }]);
    const [charge] = await db.select({ status: payments.status }).from(payments).where(eq(payments.bookingId, bookingId));
    expect(charge?.status).toBe('refunded');
  });

  it('keeps the late compensation for the helper when the client cancels within 24 h', async () => {
    const { bookingId } = await booked('tsk_sh_late', 5 * HOUR);
    expect(await previewCancellation(db, 'usr_ben', bookingId, new Date())).toMatchObject({ late: true, posterRefundCents: 5400, helperCompensationCents: 1200 });
    await cancelBookingBy(deps, 'usr_ben', bookingId, { reason: 'plans_changed', note: 'Sorry!' }, new Date());
    expect(await refundsOf(bookingId)).toEqual([{ amount: 5400, status: 'succeeded' }]);
  });

  it('refunds in full and adds a strike when the helper cancels late', async () => {
    const { bookingId } = await booked('tsk_sh_helper', 5 * HOUR);
    expect(await previewCancellation(db, 'usr_jordan', bookingId, new Date())).toMatchObject({ by: 'helper', posterRefundCents: 6600, helperStrike: true });
    expect(await cancelBookingBy(deps, 'usr_jordan', bookingId, { reason: 'illness', note: '' }, new Date())).toEqual({ ok: true, code: 'canceled' });
    expect(await refundsOf(bookingId)).toEqual([{ amount: 6600, status: 'succeeded' }]);
    const strikes = await db.select().from(helperStrikes).where(eq(helperStrikes.bookingId, bookingId));
    expect(strikes.map((s) => s.reason)).toEqual(['late_cancellation']);
    expect(await cancelBookingBy(deps, 'usr_jordan', bookingId, { reason: 'illness', note: '' }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
  });
});

describe('the day of the task', () => {
  it('reports running late, then a no-show 30 minutes past the start (moved by the late minutes)', async () => {
    const { bookingId, start } = await booked('tsk_sh_noshow', 2 * HOUR);
    expect(await reportRunningLate(db, 'usr_jordan', bookingId, 10, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await reportNoShow(deps, 'usr_ben', bookingId, { note: '' }, new Date(start.getTime() + 35 * 60_000))).toEqual({ ok: true, code: 'canceled' });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(row?.cancelReason).toBe('helper_no_show');
    expect(await refundsOf(bookingId)).toEqual([{ amount: 6600, status: 'succeeded' }]);
  });

  it("cancels as a client no-show when nobody answers a can't-access report", async () => {
    const { bookingId } = await booked('tsk_sh_access', 2 * HOUR);
    await db.update(bookings).set({ status: 'in_progress', arrivedAt: new Date() }).where(eq(bookings.id, bookingId));
    expect(await reportCantAccess(db, 'usr_jordan', bookingId, { note: 'Nobody at the door.' }, new Date())).toEqual({ ok: true, code: 'updated' });
    await expireCantAccess(db, new Date(Date.now() + 31 * 60_000), { bookingId }, deps.payments);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(row).toMatchObject({ status: 'canceled', cancelReason: 'poster_no_show' });
    expect(await refundsOf(bookingId)).toEqual([{ amount: 5400, status: 'succeeded' }]);
  });

  it('turns a safety report into an urgent support case', async () => {
    const { bookingId } = await booked('tsk_sh_safety', 4 * 24 * HOUR);
    expect(await submitSafetyReport(db, 'usr_jordan', bookingId, { kind: 'harassment', description: 'Too short' }, new Date())).toMatchObject({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { description: ['too_short'] },
    });
    expect(
      await submitSafetyReport(db, 'usr_jordan', bookingId, { kind: 'harassment', description: 'The client kept shouting at me.' }, new Date()),
    ).toEqual({ ok: true, code: 'submitted' });
    expect(await submitSafetyReport(db, 'usr_chris', bookingId, { kind: 'other', description: 'Not my booking at all.' }, new Date())).toEqual({ ok: false, code: 'not_found' });
    const cases = await db.select().from(supportCases).where(eq(supportCases.bookingId, bookingId));
    expect(cases).toEqual([expect.objectContaining({ type: 'safety', priority: 'urgent', reason: 'harassment' })]);
  });
});
