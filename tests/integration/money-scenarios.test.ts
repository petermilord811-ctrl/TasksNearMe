import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { acceptChange, proposeChange } from '@/modules/bookings/changes';
import { submitCompletion } from '@/modules/bookings/completion';
import { confirmBooking } from '@/modules/bookings/confirm';
import { runBookingAction } from '@/modules/bookings/hub';
import { bookingCompletions, bookings } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { offers } from '@/modules/offers/schema';
import { payments, refunds } from '@/modules/payments/schema';
import { files, tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { throwawayClient } from '../support/people';

/**
 * Money to the cent through the whole booking (blueprint 10 §3.2): T-16, hourly with a cap, and T-17, an
 * expense allowance. A client made for this file books Sam on copies of the seeded tasks (Jordan's offers, sent by Sam, so this file
 * shares no rate limits with the other completion tests); the job runner isn't involved.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const deps = { db, payments: createDevPaymentProvider() };
const HOUR = 3_600_000;
const now = () => new Date();
const card = { kind: 'dev_card', card: 'success', save: false } as const;
const HELPER = 'usr_sam';
const CLIENT = 'usr_money_client';

/** A copy of `source` with Jordan's offer `offerId` made by Sam, booked by Chris and checked in. */
async function bookedCopy(id: string, source: string, offerId: string, task: { expenseAllowanceCents?: number } = {}): Promise<string> {
  await throwawayClient(db, CLIENT, 'usr_chris');
  const [original] = await db.select().from(tasks).where(eq(tasks.id, source));
  const [offer] = await db.select().from(offers).where(eq(offers.id, offerId));
  if (!original || !offer) throw new Error(`Seeded ${source} is missing`);
  const start = new Date(Date.now() + 2 * HOUR);
  await db.insert(tasks).values({ ...original, ...task, id, slug: `${id}-slug`, posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 6 * HOUR) });
  await db.insert(offers).values({ ...offer, id: `off_${id}`, taskId: id, helperUserId: HELPER, status: 'pending', revision: 1, proposedStart: start, expiresAt: start });
  const booked = await confirmBooking(deps, CLIENT, id, `off_${id}`, { offerRevision: 1, payment: card, acceptTerms: true }, now());
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  const bookingId = booked.redirectTo.split('/').pop()!;
  await db.update(bookings).set({ status: 'in_progress', arrivedAt: now() }).where(eq(bookings.id, bookingId));
  return bookingId;
}

async function photo(id: string, kind: 'evidence' | 'receipt' = 'evidence') {
  await db.insert(files).values({ id, ownerUserId: HELPER, kind, storageKey: `test/${id}.webp`, contentType: 'image/webp', width: 800, height: 600, bytes: 100 });
  return id;
}

async function moneyOf(bookingId: string) {
  const [charges, back, transfers] = await Promise.all([
    db.select().from(payments).where(and(eq(payments.bookingId, bookingId), eq(payments.status, 'succeeded'))),
    db.select().from(refunds).where(eq(refunds.bookingId, bookingId)),
    db.select().from(earnings).where(eq(earnings.bookingId, bookingId)),
  ]);
  const charged = await db.select().from(payments).where(eq(payments.bookingId, bookingId));
  return {
    charged: charged.filter((row) => ['succeeded', 'partially_refunded'].includes(row.status)).map((row) => ({ purpose: row.purpose, amountCents: row.amountCents })),
    refunds: back.map((row) => ({ amountCents: row.amountCents, reason: row.reason, status: row.status })),
    transfers: Object.fromEntries(transfers.map((row) => [row.kind, row.amountCents])),
    succeeded: charges.length,
  };
}

/** Every cent the client paid is refunded, sent to the helper, or the platform's fees (T-01: the ledger balances). */
async function expectBalanced(bookingId: string) {
  const money = await moneyOf(bookingId);
  const [completion] = await db.select({ final: bookingCompletions.finalBreakdown }).from(bookingCompletions).where(eq(bookingCompletions.bookingId, bookingId));
  const charged = money.charged.reduce((sum, row) => sum + row.amountCents, 0);
  const refunded = money.refunds.filter((row) => row.status === 'succeeded').reduce((sum, row) => sum + row.amountCents, 0);
  const sent = Object.values(money.transfers).reduce((sum, cents) => sum + cents, 0);
  expect(charged - refunded).toBe(sent + completion!.final.platformRevenueCents);
}

let workPhoto = '';
beforeAll(async () => {
  workPhoto = await photo('fil_money_work');
});

describe('T-16: hourly with a cap', () => {
  it('$35/h, 4 h cap, 3.5 h worked: $154.00 charged, $19.25 back, $110.25 to the helper', async () => {
    const bookingId = await bookedCopy('tsk_t16_moving', 'tsk_moving', 'off_moving_jordan');
    expect((await moneyOf(bookingId)).charged).toEqual([{ purpose: 'booking_funding', amountCents: 15400 }]);

    const result = await submitCompletion(db, HELPER, bookingId, { hoursWorked: 3.5, photoIds: [workPhoto], note: 'Loaded and strapped.', expenses: [] }, now());
    expect(result).toMatchObject({ ok: true, code: 'submitted' });
    expect(await runBookingAction(db, CLIENT, bookingId, 'approve', now())).toMatchObject({ ok: true });
    const money = await moneyOf(bookingId);
    expect(money.refunds).toEqual([{ amountCents: 1925, reason: 'unused_cap', status: 'succeeded' }]);
    expect(money.transfers).toEqual({ earnings: 11025 });
    await expectBalanced(bookingId);
  });

  it('blocks 4.5 h until a bigger cap is accepted and funded, then pays for the hours worked', async () => {
    const bookingId = await bookedCopy('tsk_t16_over', 'tsk_moving', 'off_moving_jordan');
    const over = { hoursWorked: 4.5, photoIds: [workPhoto], note: 'Two more boxes than planned.', expenses: [] };
    expect(await submitCompletion(db, HELPER, bookingId, over, now())).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { hoursWorked: ['out_of_range'] } });

    const sent = await proposeChange(db, HELPER, bookingId, { hoursCap: 5, message: 'There are more boxes than planned; it will take longer.' }, now());
    expect(sent).toMatchObject({ ok: true, code: 'sent' });
    const changeId = sent.ok && sent.redirectTo ? sent.redirectTo.split('/').pop()! : '';
    // Proposed is not enough.
    expect(await submitCompletion(db, HELPER, bookingId, over, now())).toMatchObject({ ok: false, code: 'validation_failed' });
    // Chris accepts the higher total and pays the difference: 5 h at $35 plus the fee is $192.50, $38.50 more.
    expect(await acceptChange(deps, CLIENT, bookingId, changeId, { payment: card }, now())).toMatchObject({ ok: true, code: 'paid' });
    expect((await moneyOf(bookingId)).charged).toEqual(
      expect.arrayContaining([
        { purpose: 'booking_funding', amountCents: 15400 },
        { purpose: 'change_funding', amountCents: 3850 },
      ]),
    );

    expect(await submitCompletion(db, HELPER, bookingId, over, now())).toMatchObject({ ok: true, code: 'submitted' });
    expect(await runBookingAction(db, CLIENT, bookingId, 'approve', now())).toMatchObject({ ok: true });
    // 4.5 h: $157.50 plus $15.75 = $173.25 of the $192.50 charged, so $19.25 back; the helper gets $141.75.
    const money = await moneyOf(bookingId);
    expect(money.refunds).toEqual([{ amountCents: 1925, reason: 'unused_cap', status: 'succeeded' }]);
    expect(money.transfers).toEqual({ earnings: 14175 });
    await expectBalanced(bookingId);
  });
});

describe('T-17: an expense allowance', () => {
  it('$20 allowance, $8 receipt: $86.00 charged, $8.00 reimbursed apart from the earnings, $12.00 back', async () => {
    const bookingId = await bookedCopy('tsk_t17_desk', 'tsk_desk', 'off_jordan', { expenseAllowanceCents: 2000 });
    expect((await moneyOf(bookingId)).charged).toEqual([{ purpose: 'booking_funding', amountCents: 8600 }]);

    const receipt = await photo('fil_money_receipt', 'receipt');
    const result = await submitCompletion(
      db,
      HELPER,
      bookingId,
      { photoIds: [workPhoto], note: 'Desk up; bought wall anchors.', expenses: [{ description: 'Wall anchors', amountCents: 800, receiptPhotoId: receipt }] },
      now(),
    );
    expect(result).toMatchObject({ ok: true, code: 'submitted' });
    expect(await runBookingAction(db, CLIENT, bookingId, 'approve', now())).toMatchObject({ ok: true });
    const money = await moneyOf(bookingId);
    expect(money.transfers).toEqual({ earnings: 5400, reimbursement: 800 });
    expect(money.refunds).toEqual([{ amountCents: 1200, reason: 'unused_allowance', status: 'succeeded' }]);
    await expectBalanced(bookingId);
  });
});
