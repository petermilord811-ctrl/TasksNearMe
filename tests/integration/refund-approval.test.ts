import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking } from '@/modules/bookings/confirm';
import { offers } from '@/modules/offers/schema';
import { refunds } from '@/modules/payments/schema';
import { getAdminBookings } from '@/modules/support/staff-bookings';
import { refundRequests } from '@/modules/support/schema';
import type { StaffActor } from '@/modules/support/staff';
import { decideRefundRequest, getAdminBooking, staffRefund } from '@/modules/support/staff-money';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { throwawayClient } from '../support/people';

/**
 * T-28, staff limits (blueprint 08): an agent's refund above $100 waits for a lead's approval; above $500 for
 * finance; nobody approves their own request; every step is in the audit log. A client made for this
 * file books Jordan for a $600 job (charged $660) on a copy of the desk.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const pay = createDevPaymentProvider();
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const casey: StaffActor = { id: 'usr_casey', roles: ['finance'] };
const HOUR = 3_600_000;
const note = 'The helper left two hours early; the client asked for most of it back.';
const CLIENT = 'usr_rra_client';

async function bigBooking(id: string): Promise<string> {
  await throwawayClient(db, CLIENT);
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  const start = new Date(Date.now() + 3 * 24 * HOUR);
  await db.insert(tasks).values({ ...desk!, id, slug: `${id}-slug`, posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1, budgetCents: 60000, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR) });
  await db.insert(offers).values({ ...offer!, id: `off_${id}`, taskId: id, status: 'pending', revision: 1, priceCents: 60000, proposedStart: start, expiresAt: start });
  const booked = await confirmBooking({ db, payments: pay }, CLIENT, id, `off_${id}`, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  return booked.redirectTo.split('/').pop()!;
}

const pendingOf = async (bookingId: string) => db.select().from(refundRequests).where(and(eq(refundRequests.bookingId, bookingId), eq(refundRequests.status, 'pending')));

describe('refund approvals', () => {
  it('sends an agent’s $150 refund to a lead, who approves it; the agent can’t approve their own', async () => {
    const bookingId = await bigBooking('tsk_rra_lead');
    expect(await staffRefund(db, pay, alex, bookingId, { amountCents: 15_000, reason: 'goodwill', note }, new Date())).toEqual({ ok: true, code: 'sent' });
    const [request] = await pendingOf(bookingId);
    expect(request).toMatchObject({ amountCents: 15_000, requestedByUserId: 'usr_alex' });
    expect(await db.select().from(refunds).where(eq(refunds.bookingId, bookingId))).toEqual([]);

    // The staff pages: the agent sees it waiting, the lead can decide, the bookings list flags it.
    expect((await getAdminBooking(db, alex, bookingId, new Date()))?.refundRequests).toMatchObject([{ id: request!.id, status: 'pending', canDecide: false }]);
    expect((await getAdminBooking(db, morgan, bookingId, new Date()))?.refundRequests).toMatchObject([{ id: request!.id, canDecide: true, requestedBy: 'Alex P.' }]);
    const attention = await getAdminBookings(db, { filter: 'attention', query: bookingId }, new Date());
    expect(attention.rows.find((row) => row.id === bookingId)?.flags).toContain('refund_approval');

    const decision = { requestId: request!.id, decision: 'approve' as const, note: 'Checked the timeline: the helper left early.' };
    expect(await decideRefundRequest(db, pay, alex, bookingId, decision, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await decideRefundRequest(db, pay, morgan, bookingId, decision, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await decideRefundRequest(db, pay, morgan, bookingId, decision, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await db.select().from(refunds).where(eq(refunds.bookingId, bookingId))).map((row) => [row.amountCents, row.status])).toEqual([[15_000, 'succeeded']]);

    const actions = (await db.select({ action: auditLog.action, actor: auditLog.actorId }).from(auditLog).where(eq(auditLog.targetId, bookingId))).map((row) => `${row.action}:${row.actor}`);
    expect(actions).toEqual(expect.arrayContaining(['booking.refund_requested:usr_alex', 'booking.refund_approved:usr_morgan']));
  });

  it('needs finance above $500, and a decline refunds nothing', async () => {
    const bookingId = await bigBooking('tsk_rra_finance');
    expect(await staffRefund(db, pay, morgan, bookingId, { amountCents: 60_000, reason: 'goodwill', note }, new Date())).toEqual({ ok: true, code: 'sent' });
    const [request] = await pendingOf(bookingId);
    const approve = { requestId: request!.id, decision: 'approve' as const, note: 'A full refund after the review.' };
    // A lead can't approve $600 (their limit is $500); finance can.
    expect(await decideRefundRequest(db, pay, { id: 'usr_riley', roles: ['support_lead'] }, bookingId, approve, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await decideRefundRequest(db, pay, casey, bookingId, approve, new Date())).toEqual({ ok: true, code: 'updated' });

    const second = await bigBooking('tsk_rra_decline');
    await staffRefund(db, pay, alex, second, { amountCents: 20_000, reason: 'goodwill', note }, new Date());
    const [declined] = await pendingOf(second);
    expect(await decideRefundRequest(db, pay, morgan, second, { requestId: declined!.id, decision: 'decline', note: 'The helper finished the work; no refund.' }, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await db.select().from(refunds).where(eq(refunds.bookingId, second))).toEqual([]);
    expect((await db.select().from(refundRequests).where(eq(refundRequests.id, declined!.id)))[0]).toMatchObject({ status: 'declined', decidedByUserId: 'usr_morgan' });
  });

  it('never asks for more than is left of the charge', async () => {
    const bookingId = await bigBooking('tsk_rra_left');
    expect(await staffRefund(db, pay, alex, bookingId, { amountCents: 70_000, reason: 'goodwill', note }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await pendingOf(bookingId)).toEqual([]);
  });
});
