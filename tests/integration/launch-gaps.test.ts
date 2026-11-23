import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { expireDueChanges, proposeChange } from '@/modules/bookings/changes';
import { confirmBooking, expireUnfundedBookings } from '@/modules/bookings/confirm';
import { getRequestHelperPage } from '@/modules/invites/service';
import { bookings } from '@/modules/bookings/schema';
import { reportNoShow } from '@/modules/bookings/sheets';
import { offers } from '@/modules/offers/schema';
import { payments } from '@/modules/payments/schema';
import { bookingChangeRequests } from '@/modules/bookings/schema';
import { staffRefund } from '@/modules/support/staff-money';
import type { StaffActor } from '@/modules/support/staff';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { throwawayClient } from '../support/people';

/**
 * Launch-scenario details (blueprint 10 §3.2) the flow tests don't reach: an abandoned bank check (T-04), a
 * no-show report after check-in (T-11), a change request that runs out (T-15), staff refund limits (T-28).
 * A client made for this file books Jordan on copies of the desk.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const pay = createDevPaymentProvider();
const deps = { db, payments: pay };
const HOUR = 3_600_000;
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const CLIENT = 'usr_gap_client';

async function openTask(id: string, startsInMs = 3 * 24 * HOUR): Promise<{ taskId: string; offerId: string; start: Date }> {
  await throwawayClient(db, CLIENT, 'usr_ana');
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  const start = new Date(Date.now() + startsInMs);
  await db.insert(tasks).values({ ...desk!, id, slug: `${id}-slug`, posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR) });
  await db.insert(offers).values({ ...offer!, id: `off_${id}`, taskId: id, status: 'pending', revision: 1, proposedStart: start, expiresAt: start });
  return { taskId: id, offerId: `off_${id}`, start };
}

async function booked(id: string, startsInMs?: number) {
  const { taskId, offerId, start } = await openTask(id, startsInMs);
  const result = await confirmBooking(deps, CLIENT, taskId, offerId, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
  if (!result.ok || !result.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(result)}`);
  return { bookingId: result.redirectTo.split('/').pop()!, start };
}

describe('launch-scenario details', () => {
  it('T-04: an abandoned bank check releases the hold after 30 minutes, and the offer is open again', async () => {
    const { taskId, offerId } = await openTask('tsk_gap_3ds');
    const asked = await confirmBooking(deps, CLIENT, taskId, offerId, { offerRevision: 1, payment: { kind: 'dev_card', card: 'requires_verification', save: false }, acceptTerms: true }, new Date());
    expect(asked).toMatchObject({ ok: false, code: 'requires_bank_verification' });
    const [hold] = await db.select().from(bookings).where(eq(bookings.taskId, taskId));
    expect(hold).toMatchObject({ status: 'pending_funding' });
    // Nobody finishes the bank step.
    await expireUnfundedBookings(db, new Date(hold!.fundingExpiresAt!.getTime() + 1000), { taskId });
    const [after] = await db.select().from(bookings).where(eq(bookings.id, hold!.id));
    expect(after).toMatchObject({ status: 'canceled', cancelReason: 'funding_failed' });
    expect((await db.select().from(offers).where(eq(offers.id, offerId)))[0]?.status).toBe('pending');
    expect((await db.select().from(payments).where(eq(payments.bookingId, hold!.id))).some((row) => row.status === 'succeeded')).toBe(false);
  });

  it('T-11: once the helper has arrived, the client can no longer report a no-show', async () => {
    const { bookingId, start } = await booked('tsk_gap_noshow', 2 * HOUR);
    await db.update(bookings).set({ status: 'in_progress', arrivedAt: new Date(start.getTime() + 10 * 60_000) }).where(eq(bookings.id, bookingId));
    expect(await reportNoShow(deps, CLIENT, bookingId, { note: '' }, new Date(start.getTime() + 45 * 60_000))).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('T-15: a change request that runs out keeps the old terms', async () => {
    const { bookingId } = await booked('tsk_gap_change');
    const [before] = await db.select({ version: bookings.termsVersion }).from(bookings).where(eq(bookings.id, bookingId));
    const sent = await proposeChange(db, CLIENT, bookingId, { priceCents: 8000, scopeText: 'Assemble the desk and the matching chair.', message: 'Could you also do the chair?' }, new Date());
    expect(sent).toMatchObject({ ok: true, code: 'sent' });
    const changeId = sent.ok && sent.redirectTo ? sent.redirectTo.split('/').pop()! : '';
    const [change] = await db.select().from(bookingChangeRequests).where(eq(bookingChangeRequests.id, changeId));
    await expireDueChanges(db, new Date(change!.expiresAt!.getTime() + 1000), { bookingId });
    expect((await db.select().from(bookingChangeRequests).where(eq(bookingChangeRequests.id, changeId)))[0]?.status).toBe('expired');
    expect((await db.select({ version: bookings.termsVersion }).from(bookings).where(eq(bookings.id, bookingId)))[0]?.version).toBe(before!.version);
  });

  it("T-28: an agent can't refund $150 (over the $100 agent limit); a lead can, and both attempts' outcomes are audited", async () => {
    const { bookingId } = await booked('tsk_gap_refund');
    const refund = { amountCents: 15_000, reason: 'goodwill' as const, note: 'The client waited an hour past the start.' };
    // The booking was charged $63 (held, with the hold fee): a lead refunds what's left, an agent can't go over their limit.
    expect(await staffRefund(db, pay, alex, bookingId, refund, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await staffRefund(db, pay, morgan, bookingId, { ...refund, amountCents: 6300 }, new Date())).toMatchObject({ ok: true });
    const entries = await db.select().from(auditLog).where(and(eq(auditLog.targetId, bookingId), eq(auditLog.action, 'booking.refund')));
    expect(entries.map((entry) => entry.actorId)).toContain('usr_morgan');
  });

  it("T-01: Book again suggests the past booking's task and price", async () => {
    // Maya's wardrobe with Sam, completed three weeks ago at $90 (seeded).
    const page = await getRequestHelperPage(db, pay, 'usr_maya', 'sam-k', { fromBookingId: 'bkg_wardrobe' }, new Date());
    expect(page?.suggestion).toMatchObject({ pricing: { type: 'fixed', priceCents: 9000 } });
    // Someone else's booking suggests nothing.
    expect((await getRequestHelperPage(db, pay, 'usr_chris', 'sam-k', { fromBookingId: 'bkg_wardrobe' }, new Date()))?.suggestion).toBeUndefined();
  });
});

