import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking } from '@/modules/bookings/confirm';
import { runBookingAction } from '@/modules/bookings/hub';
import { bookings } from '@/modules/bookings/schema';
import { cancelBookingBy } from '@/modules/bookings/sheets';
import { addCard, getEarningsPage, getPaymentsPage, getReceiptPage, makeDefaultCard, removeCard } from '@/modules/earnings/service';
import { offers } from '@/modules/offers/schema';
import { paymentMethods } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const provider = createDevPaymentProvider();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Lee is the helper here (no other file pays Lee), and Ben the client, so totals are this file's own.
const HELPER = 'usr_lee';

async function booked(id: string, startsInMs: number): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  const start = new Date(Date.now() + startsInMs);
  await db.insert(tasks).values({ ...desk, id, slug: `${id}-slug`, posterUserId: 'usr_ben', status: 'open', offerCount: 1, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR) });
  await db.insert(offers).values({ ...offer, id: `off_${id}`, taskId: id, helperUserId: HELPER, status: 'pending', revision: 1, proposedStart: start, expiresAt: new Date(Math.min(start.getTime(), Date.now() + 72 * HOUR)) });
  const result = await confirmBooking({ db, payments: provider }, 'usr_ben', id, `off_${id}`, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
  if (!result.ok || !result.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(result)}`);
  return result.redirectTo.split('/').pop()!;
}

let completedId = '';
let canceledId = '';
beforeAll(async () => {
  completedId = await booked('tsk_ern_done', 3 * DAY);
  // Approve without the completion form: the work was submitted.
  await db.update(bookings).set({ status: 'completion_submitted', approvalDueAt: new Date(Date.now() + 72 * HOUR) }).where(eq(bookings.id, completedId));
  const approved = await runBookingAction(db, 'usr_ben', completedId, 'approve', new Date());
  if (!approved.ok) throw new Error(`Approve failed: ${JSON.stringify(approved)}`);
  canceledId = await booked('tsk_ern_late', 5 * HOUR);
  await cancelBookingBy({ db, payments: provider }, 'usr_ben', canceledId, { reason: 'plans_changed', note: '' }, new Date());
});

describe("the helper's earnings", () => {
  it('transfers the earnings on approval and the compensation on a late cancellation', async () => {
    const page = await getEarningsPage(db, HELPER, new Date());
    const mine = page.rows.filter((row) => [completedId, canceledId].includes(row.bookingId));
    expect(mine.map((row) => [row.kind, row.amountCents, row.status]).sort()).toEqual([
      ['cancellation_compensation', 1200, 'transferred'],
      ['earnings', 5400, 'transferred'],
    ]);
    expect(page.totals.onTheWayCents).toBeGreaterThanOrEqual(6600);
    expect(page.firstPayoutNotice).toBe(true);
  });

  it('pays out two days later and counts it for the year', async () => {
    await getEarningsPage(db, HELPER, new Date(Date.now() + 2 * DAY + HOUR));
    const later = await getEarningsPage(db, HELPER, new Date(Date.now() + 4 * DAY));
    const row = later.rows.find((r) => r.bookingId === completedId && r.kind === 'earnings');
    expect(row).toMatchObject({ status: 'paid_out', payout: { status: 'paid', bankLast4: '6789' } });
    expect(later.totals.paidThisYearCents).toBeGreaterThanOrEqual(6600);
    expect(later.firstPayoutNotice).toBe(false);
  });
});

describe("the client's receipts and cards", () => {
  it('lists receipts with refunds and nets, and shows one receipt to its client only', async () => {
    const page = await getPaymentsPage(db, 'usr_ben');
    const late = page.receipts.find((r) => r.bookingId === canceledId);
    expect(late).toMatchObject({ chargedCents: 6600, refundedCents: 5400, netCents: 1200, status: 'partially_refunded' });
    const receipt = await getReceiptPage(db, 'usr_ben', canceledId);
    expect(receipt?.lines.map((l) => [l.kind, l.amountCents, l.reason ?? null])).toEqual([
      ['charge', 6600, null],
      ['refund', 5400, 'cancellation'],
    ]);
    expect(receipt?.netCents).toBe(1200);
    expect(await getReceiptPage(db, 'usr_maya', canceledId)).toBeNull();
  });

  it('adds, defaults and removes cards', async () => {
    expect(await addCard(db, 'usr_ben', { card: 'declined', makeDefault: false }, new Date(), provider)).toEqual({ ok: false, code: 'payment_declined' });
    expect(await addCard(db, 'usr_ben', { card: 'success', makeDefault: false }, new Date(), provider)).toEqual({ ok: true, code: 'saved' });
    expect(await addCard(db, 'usr_ben', { card: 'requires_verification', makeDefault: false }, new Date(), provider)).toEqual({ ok: true, code: 'saved' });
    let cards = (await getPaymentsPage(db, 'usr_ben')).methods;
    expect(cards.map((c) => [c.last4, c.isDefault])).toEqual([
      ['4242', true],
      ['3155', false],
    ]);
    expect(await makeDefaultCard(db, 'usr_ben', cards[1]!.id)).toEqual({ ok: true, code: 'updated' });
    expect(await removeCard(db, 'usr_ben', cards[1]!.id, new Date())).toEqual({ ok: true, code: 'updated' });
    cards = (await getPaymentsPage(db, 'usr_ben')).methods;
    expect(cards.map((c) => [c.last4, c.isDefault])).toEqual([['4242', true]]);
    expect(await removeCard(db, 'usr_maya', cards[0]!.id, new Date())).toEqual({ ok: false, code: 'not_found' });
    const [stored] = await db.select().from(paymentMethods).where(and(eq(paymentMethods.userId, 'usr_ben'), eq(paymentMethods.last4, '3155')));
    expect(stored?.detachedAt).not.toBeNull();
  });
});
