import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { adminAccountView, moderateAccount } from '@/modules/accounts/account-moderation';
import { sessions, users } from '@/modules/accounts/schema';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { cancelBookingByStaff, staffCancelView } from '@/modules/bookings/sheets';
import { payments, refunds } from '@/modules/payments/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import type { StaffActor } from '@/modules/support/staff';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Completion plan 5.14 against the database: suspending and banning a whole account (two reviewers for a ban),
 * which ends sessions and suspends the helper profile; and support canceling a booking with a full refund. A
 * helper (a copy of Sam) and a copy of the TV booking made for this file.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const PERSON = 'usr_sc_helper';
const BOOKING = 'bkg_sc_1';
const now = new Date();
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const taylor: StaffActor = { id: 'usr_taylor', roles: ['trust_safety'] };
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const why = 'Repeated harassment reported on two bookings.';
/** Each step a second after the last, as the audit log orders them. */
const at = (step: number) => new Date(now.getTime() + step * 1000);
const statusOf = async () => (await db.select({ status: users.status }).from(users).where(eq(users.id, PERSON)))[0]!.status;
const deps = { db, payments: createDevPaymentProvider() };

beforeAll(async () => {
  const [sam] = await db.select().from(users).where(eq(users.id, 'usr_sam'));
  await db.insert(users).values({ ...sam!, id: PERSON, email: `${PERSON}@example.test`, name: 'SC Helper', phone: null, phoneVerifiedAt: null, status: 'active' });
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
  await db.insert(helperProfiles).values({ ...profile!, userId: PERSON, handle: 'sc-helper', foundingNumber: null, status: 'active' });
  await db.insert(sessions).values([
    { id: 'ses_sc_1', userId: PERSON, token: 'tok_sc_1', expiresAt: new Date(now.getTime() + 86_400_000), createdAt: now, updatedAt: now },
    { id: 'ses_sc_2', userId: PERSON, token: 'tok_sc_2', expiresAt: new Date(now.getTime() + 86_400_000), createdAt: now, updatedAt: now },
  ]);

  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  await db.insert(tasks).values({ ...task!, id: 'tsk_sc_1', slug: 'sc-1', status: 'assigned' });
  await db.insert(bookings).values({ ...booking!, id: BOOKING, taskId: 'tsk_sc_1', offerId: null, status: 'confirmed', seriesId: null, visitIndex: null });
  await db.insert(bookingTerms).values({ ...terms!, id: 'btm_sc_1', bookingId: BOOKING });
  await db.insert(payments).values({ id: 'pay_sc_1', bookingId: BOOKING, purpose: 'booking_funding', payerUserId: booking!.posterUserId, amountCents: 8800, status: 'succeeded', provider: 'dev', providerRef: 'devpi_sc_1', idempotencyKey: 'pay:sc:1' });
});

/** More copies of the TV booking for the refund rules (5.18), each with its own charges. */
const MORE = ['bkg_sc_left', 'bkg_sc_change', 'bkg_sc_own', 'bkg_sc_fails'];
const MORE_PAYMENTS = ['pay_sc_left', 'pay_sc_change', 'pay_sc_change_2', 'pay_sc_own', 'pay_sc_fails'];

async function bookingWith(id: string, charges: { id: string; purpose: string; amountCents: number; refundedCents?: number }[], posterUserId?: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  const taskId = `tsk_sc_${id.slice('bkg_sc_'.length)}`;
  await db.insert(tasks).values({ ...task!, id: taskId, slug: taskId, status: 'assigned', ...(posterUserId ? { posterUserId } : {}) });
  await db.insert(bookings).values({ ...booking!, id, taskId, offerId: null, status: 'confirmed', seriesId: null, visitIndex: null, ...(posterUserId ? { posterUserId } : {}) });
  await db.insert(bookingTerms).values({ ...terms!, id: `btm_${id.slice(4)}`, bookingId: id });
  for (const charge of charges) {
    await db.insert(payments).values({ id: charge.id, bookingId: id, purpose: charge.purpose, payerUserId: posterUserId ?? booking!.posterUserId, amountCents: charge.amountCents, status: charge.refundedCents ? 'partially_refunded' : 'succeeded', provider: 'dev', providerRef: `devpi_${charge.id}`, idempotencyKey: `pay:${charge.id}` });
    if (charge.refundedCents) await db.insert(refunds).values({ id: `ref_${charge.id}`, paymentId: charge.id, bookingId: id, amountCents: charge.refundedCents, reason: 'goodwill', status: 'succeeded', providerRef: `devre_${charge.id}`, idempotencyKey: `refund:${charge.id}:goodwill` });
  }
}

afterAll(async () => {
  const cases = (await db.select({ metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.action, 'payment.refund_case_opened'), inArray(auditLog.targetId, MORE_PAYMENTS)))).map((row) => (row.metadata as { caseId: string }).caseId);
  if (cases.length) {
    await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, cases));
    await db.delete(supportCases).where(inArray(supportCases.id, cases));
  }
  await db.delete(auditLog).where(inArray(auditLog.targetId, [...MORE, ...MORE_PAYMENTS]));
  await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, MORE));
  await db.delete(refunds).where(inArray(refunds.bookingId, MORE));
  await db.delete(payments).where(inArray(payments.id, MORE_PAYMENTS));
  await db.delete(bookingTerms).where(inArray(bookingTerms.bookingId, MORE));
  await db.delete(bookings).where(inArray(bookings.id, MORE));
  await db.delete(auditLog).where(and(inArray(auditLog.targetId, [PERSON, BOOKING])));
  await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, BOOKING));
  await db.delete(refunds).where(eq(refunds.bookingId, BOOKING));
  await db.delete(payments).where(eq(payments.id, 'pay_sc_1'));
  await db.delete(bookingTerms).where(eq(bookingTerms.id, 'btm_sc_1'));
  await db.delete(bookings).where(eq(bookings.id, BOOKING));
  await db.delete(tasks).where(like(tasks.id, 'tsk\\_sc\\_%'));
  await db.delete(sessions).where(eq(sessions.userId, PERSON));
  await db.delete(helperProfiles).where(eq(helperProfiles.userId, PERSON));
  await db.delete(users).where(eq(users.id, PERSON));
  await pool.end();
});

describe('account moderation', () => {
  it('suspends an account (leads, trust and safety, admins): sessions end and the helper profile is suspended', async () => {
    expect((await adminAccountView(db, alex, PERSON))!.actions).toEqual([]);
    expect(await moderateAccount(db, alex, PERSON, { action: 'suspend', reason: why }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await moderateAccount(db, morgan, PERSON, { action: 'suspend', reason: why }, at(1))).toEqual({ ok: true, code: 'updated' });
    expect(await statusOf()).toBe('suspended');
    expect(await db.select().from(sessions).where(eq(sessions.userId, PERSON))).toEqual([]);
    expect((await db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, PERSON)))[0]!.status).toBe('suspended');
    expect(await moderateAccount(db, morgan, PERSON, { action: 'reinstate', reason: 'Appeal reviewed: reports not substantiated.' }, at(2))).toEqual({ ok: true, code: 'updated' });
    expect(await statusOf()).toBe('active');
  });

  it('bans only with a second reviewer, and only an admin lifts a ban', async () => {
    expect(await moderateAccount(db, morgan, PERSON, { action: 'request_ban', reason: why }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await moderateAccount(db, taylor, PERSON, { action: 'request_ban', reason: why }, at(3))).toEqual({ ok: true, code: 'updated' });
    expect((await adminAccountView(db, taylor, PERSON))!).toMatchObject({ pendingBan: { requestedById: 'usr_taylor', reason: why }, actions: expect.not.arrayContaining(['approve_ban']) });
    expect(await moderateAccount(db, taylor, PERSON, { action: 'approve_ban', reason: why }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await moderateAccount(db, riley, PERSON, { action: 'approve_ban', reason: 'Second review: the reports hold up.' }, at(4))).toEqual({ ok: true, code: 'updated' });
    expect(await statusOf()).toBe('banned');
    expect((await adminAccountView(db, morgan, PERSON))!.actions).not.toContain('reinstate');
    expect(await moderateAccount(db, riley, PERSON, { action: 'reinstate', reason: 'Lifted on appeal by the founders.' }, at(5))).toEqual({ ok: true, code: 'updated' });
    expect(await statusOf()).toBe('active');
  });

  it('leaves staff accounts alone', async () => {
    expect(await adminAccountView(db, riley, 'usr_alex')).toMatchObject({ isStaff: true, actions: [] });
  });
});

describe('a pending ban (5.18)', () => {
  it('can’t be dropped by reinstating the suspended account; a reviewer declines it first', async () => {
    const [sam] = await db.select().from(users).where(eq(users.id, 'usr_sam'));
    await db.insert(users).values({ ...sam!, id: 'usr_sc_pending', email: 'usr_sc_pending@example.test', name: 'SC Pending', phone: null, phoneVerifiedAt: null, status: 'active' });
    try {
      expect(await moderateAccount(db, taylor, 'usr_sc_pending', { action: 'suspend', reason: why }, at(20))).toEqual({ ok: true, code: 'updated' });
      expect(await moderateAccount(db, taylor, 'usr_sc_pending', { action: 'request_ban', reason: why }, at(21))).toEqual({ ok: true, code: 'updated' });
      // A lead may reinstate a plain suspension, but not one with a ban request waiting.
      expect((await adminAccountView(db, morgan, 'usr_sc_pending'))?.actions).not.toContain('reinstate');
      expect(await moderateAccount(db, morgan, 'usr_sc_pending', { action: 'reinstate', reason: 'Looks fine to me now.' }, at(22))).toEqual({ ok: false, code: 'not_allowed' });
      expect((await adminAccountView(db, riley, 'usr_sc_pending'))?.pendingBan?.requestedById).toBe('usr_taylor');
      expect((await db.select({ status: users.status }).from(users).where(eq(users.id, 'usr_sc_pending')))[0]!.status).toBe('suspended');
      // Once a second reviewer declines it, the suspension can be lifted.
      expect(await moderateAccount(db, riley, 'usr_sc_pending', { action: 'decline_ban', reason: 'Not enough for a ban yet.' }, at(23))).toEqual({ ok: true, code: 'updated' });
      expect((await adminAccountView(db, morgan, 'usr_sc_pending'))?.actions).toContain('reinstate');
    } finally {
      await db.delete(auditLog).where(eq(auditLog.targetId, 'usr_sc_pending'));
      await db.delete(sessions).where(eq(sessions.userId, 'usr_sc_pending'));
      await db.delete(users).where(eq(users.id, 'usr_sc_pending'));
    }
  });
});

describe('support cancels a booking', () => {
  it('refunds the whole charge, with no strike, for a lead; an agent only within their limit', async () => {
    expect(await staffCancelView(db, alex.roles, { id: BOOKING, status: 'confirmed' })).toEqual({ refundCents: 8800, allowed: true });
    // Cancelling is case work: finance's refund limit isn't a cancel right (blueprint 08 staff roles; lifecycle review #15).
    expect(await staffCancelView(db, ['finance'], { id: BOOKING, status: 'confirmed' })).toEqual({ refundCents: 8800, allowed: false });
    expect(await cancelBookingByStaff(deps, { id: 'usr_casey', roles: ['finance'] }, BOOKING, { note: 'Finance trying to cancel this booking.' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await cancelBookingByStaff(deps, morgan, BOOKING, { note: 'short' }, now)).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await cancelBookingByStaff(deps, morgan, BOOKING, { note: 'The helper is suspended; the client asked to cancel.' }, now)).toEqual({ ok: true, code: 'canceled' });
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, BOOKING));
    expect(booking).toMatchObject({ status: 'canceled', cancelReason: 'admin', canceledBy: 'staff' });
    expect((await db.select().from(refunds).where(eq(refunds.bookingId, BOOKING))).map((row) => [row.amountCents, row.status])).toEqual([[8800, 'succeeded']]);
    const [audited] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'booking.canceled_by_staff'), eq(auditLog.targetId, BOOKING)));
    expect(audited).toMatchObject({ actorId: 'usr_morgan', metadata: { refundCents: 8800 } });
    expect(await cancelBookingByStaff(deps, morgan, BOOKING, { note: 'Trying a second time on purpose.' }, now)).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('refunds what is left of each charge after earlier refunds, and checks the agent’s limit on that (5.18)', async () => {
    // $150 charged, $60 already given back as goodwill: $90 left, within an agent's $100 limit.
    await bookingWith('bkg_sc_left', [{ id: 'pay_sc_left', purpose: 'booking_funding', amountCents: 15000, refundedCents: 6000 }]);
    expect(await staffCancelView(db, alex.roles, { id: 'bkg_sc_left', status: 'confirmed' })).toEqual({ refundCents: 9000, allowed: true });
    expect(await cancelBookingByStaff(deps, alex, 'bkg_sc_left', { note: 'The client asked support to cancel this one.' }, now)).toEqual({ ok: true, code: 'canceled' });
    const left = await db.select().from(refunds).where(eq(refunds.bookingId, 'bkg_sc_left'));
    expect(left.map((row) => [row.reason, row.amountCents, row.status]).sort()).toEqual([['cancellation', 9000, 'succeeded'], ['goodwill', 6000, 'succeeded']]);
    expect((await db.select().from(payments).where(eq(payments.id, 'pay_sc_left')))[0]!.status).toBe('refunded');

    // A partly refunded charge and a paid change: both remainders count, and both go back.
    await bookingWith('bkg_sc_change', [
      { id: 'pay_sc_change', purpose: 'booking_funding', amountCents: 9000, refundedCents: 1000 },
      { id: 'pay_sc_change_2', purpose: 'change_funding', amountCents: 4000 },
    ]);
    expect(await staffCancelView(db, alex.roles, { id: 'bkg_sc_change', status: 'confirmed' })).toEqual({ refundCents: 12000, allowed: false });
    expect(await cancelBookingByStaff(deps, alex, 'bkg_sc_change', { note: 'The client asked support to cancel this one.' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await cancelBookingByStaff(deps, morgan, 'bkg_sc_change', { note: 'The client asked support to cancel this one.' }, now)).toEqual({ ok: true, code: 'canceled' });
    const changed = await db.select().from(refunds).where(and(eq(refunds.bookingId, 'bkg_sc_change'), eq(refunds.reason, 'cancellation')));
    expect(changed.map((row) => [row.paymentId, row.amountCents, row.status]).sort()).toEqual([['pay_sc_change', 8000, 'succeeded'], ['pay_sc_change_2', 4000, 'succeeded']]);
    const [audited] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'booking.canceled_by_staff'), eq(auditLog.targetId, 'bkg_sc_change')));
    expect(audited).toMatchObject({ actorId: 'usr_morgan', actorRole: 'support_lead', metadata: { refundCents: 12000 } });
  });

  it('never cancels a booking the staff member is part of (5.18)', async () => {
    await bookingWith('bkg_sc_own', [{ id: 'pay_sc_own', purpose: 'booking_funding', amountCents: 5000 }], 'usr_morgan');
    expect(await staffCancelView(db, morgan.roles, { id: 'bkg_sc_own', status: 'confirmed' }, 'usr_morgan')).toEqual({ refundCents: 5000, allowed: false });
    expect(await cancelBookingByStaff(deps, morgan, 'bkg_sc_own', { note: 'Canceling my own booking for a full refund.' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect((await db.select().from(bookings).where(eq(bookings.id, 'bkg_sc_own')))[0]!.status).toBe('confirmed');
  });

  it('leaves a trace when the refund call fails: the cancel, a failed refund and a case for finance (5.18)', async () => {
    await bookingWith('bkg_sc_fails', [{ id: 'pay_sc_fails', purpose: 'booking_funding', amountCents: 5000 }]);
    const failing = { db, payments: { ...createDevPaymentProvider(), refund: async () => { throw new Error('Stripe is down'); } } };
    expect(await cancelBookingByStaff(failing, morgan, 'bkg_sc_fails', { note: 'The helper is suspended; cancel and refund.' }, now)).toEqual({ ok: true, code: 'canceled' });
    expect((await db.select().from(bookings).where(eq(bookings.id, 'bkg_sc_fails')))[0]!.status).toBe('canceled');
    expect((await db.select().from(refunds).where(eq(refunds.bookingId, 'bkg_sc_fails'))).map((row) => [row.amountCents, row.status])).toEqual([[5000, 'failed']]);
    expect(await db.select().from(auditLog).where(and(eq(auditLog.action, 'booking.canceled_by_staff'), eq(auditLog.targetId, 'bkg_sc_fails')))).toHaveLength(1);
    const [opened] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'payment.refund_case_opened'), eq(auditLog.targetId, 'pay_sc_fails')));
    // Finance tells a staff cancellation's failed refund apart from a client's (its own case reason).
    expect(opened?.metadata).toMatchObject({ reason: 'staff_cancel_refund_failed' });
  });
});
