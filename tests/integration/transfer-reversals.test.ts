import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StripeConnect } from '@/integrations/payments/stripe-connect';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { earnings, transferReversals } from '@/modules/earnings/schema';
import { getBookingReversals, reverseTransfer } from '@/modules/payments/reversals';
import { supportCases } from '@/modules/support/schema';
import type { StaffActor } from '@/modules/support/staff';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Completion plan 5.13 against the database: finance takes back part of a helper's transfer, naming a case on
 * the booking; nobody else can; never more than is left; a reversal Stripe refuses is recorded as failed. A copy
 * of the TV booking with Jordan's $54.00 transferred, and a chargeback case on it, made for this file.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const BOOKING = 'bkg_rev_1';
const casey: StaffActor = { id: 'usr_casey', roles: ['finance'] };
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const now = new Date();
const input = (amountCents: number, caseId = 'case_rev_1') => ({ earningsId: 'ern_rev_1', amountCents, caseId, reason: 'Chargeback lost: half the work was done.' });
const stripeSays = (answer: Awaited<ReturnType<StripeConnect['reverseTransfer']>>) => ({ reverseTransfer: async () => answer }) as unknown as StripeConnect;
const statusOf = async () => (await db.select({ status: earnings.status }).from(earnings).where(eq(earnings.id, 'ern_rev_1')))[0]!.status;

beforeAll(async () => {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  await db.insert(tasks).values({ ...task!, id: 'tsk_rev_1', slug: 'rev-1', status: 'completed' });
  await db.insert(bookings).values({ ...booking!, id: BOOKING, taskId: 'tsk_rev_1', offerId: null, status: 'completed', completedAt: now, seriesId: null, visitIndex: null });
  await db.insert(bookingTerms).values({ ...terms!, id: 'btm_rev_1', bookingId: BOOKING });
  await db.insert(earnings).values({ id: 'ern_rev_1', bookingId: BOOKING, helperUserId: booking!.helperUserId, kind: 'earnings', amountCents: 5400, status: 'transferred', transferRef: 'tr_rev_1', transferredAt: now, createdAt: now });
  await db.insert(supportCases).values({ id: 'case_rev_1', type: 'payment_issue', status: 'open', priority: 'urgent', bookingId: BOOKING, openedByUserId: booking!.posterUserId, description: 'Chargeback.' });
});

afterAll(async () => {
  await db.delete(auditLog).where(and(eq(auditLog.targetType, 'booking'), eq(auditLog.targetId, BOOKING)));
  await db.delete(transferReversals).where(eq(transferReversals.bookingId, BOOKING));
  await db.delete(earnings).where(eq(earnings.id, 'ern_rev_1'));
  await db.delete(supportCases).where(eq(supportCases.id, 'case_rev_1'));
  await db.delete(bookingTerms).where(eq(bookingTerms.id, 'btm_rev_1'));
  await db.delete(bookings).where(eq(bookings.id, BOOKING));
  // Only this file's task: another file's `tsk_rev_…` rows (offers on them) aren't ours to remove.
  await db.delete(tasks).where(eq(tasks.id, 'tsk_rev_1'));
  await pool.end();
});

describe('transfer reversals', () => {
  it('are for finance, with a case on the booking, and never more than is left', async () => {
    expect(await reverseTransfer(db, null, alex, BOOKING, input(2000), now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await reverseTransfer(db, null, casey, BOOKING, input(2000, 'case_tv_elsewhere'), now)).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { caseId: ['invalid'] } });
    expect(await reverseTransfer(db, null, casey, BOOKING, input(5401), now)).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { amountCents: ['out_of_range'] } });

    // Development: a stand-in takes it back.
    expect(await reverseTransfer(db, null, casey, BOOKING, input(2000), now)).toEqual({ ok: true, code: 'updated' });
    expect(await statusOf()).toBe('partially_reversed');
    const [audited] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'booking.transfer_reversed'), eq(auditLog.targetId, BOOKING)));
    expect(audited).toMatchObject({ actorId: 'usr_casey', metadata: expect.objectContaining({ amountCents: 2000, caseId: 'case_rev_1' }) });
  });

  it('records a reversal Stripe refuses as failed, and leaves the transfer as it was', async () => {
    expect(await reverseTransfer(db, stripeSays({ ok: false, reason: 'insufficient' }), casey, BOOKING, input(1000), now)).toEqual({ ok: false, code: 'insufficient_funds' });
    expect(await statusOf()).toBe('partially_reversed');
    const failed = await db.select().from(transferReversals).where(and(eq(transferReversals.bookingId, BOOKING), eq(transferReversals.status, 'failed')));
    expect(failed).toHaveLength(1);
  });

  it('marks the transfer reversed once everything is taken back, and shows it all to staff', async () => {
    expect(await reverseTransfer(db, stripeSays({ ok: true, reversalId: 'trr_stripe_9' }), casey, BOOKING, input(3400), now)).toEqual({ ok: true, code: 'updated' });
    expect(await statusOf()).toBe('reversed');
    const view = await getBookingReversals(db, alex, BOOKING);
    expect(view.transfers).toEqual([expect.objectContaining({ earningsId: 'ern_rev_1', transferredCents: 5400, reversedCents: 5400, reversibleCents: 0 })]);
    expect(view.history.map((row) => [row.amountCents, row.status])).toEqual(expect.arrayContaining([[2000, 'succeeded'], [1000, 'failed'], [3400, 'succeeded']]));
    expect(view.canReverse).toBe(false);
    expect(view.cases.map((row) => row.id)).toEqual(['case_rev_1']);
  });
});
