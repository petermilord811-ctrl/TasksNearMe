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

afterAll(async () => {
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

describe('support cancels a booking', () => {
  it('refunds the whole charge, with no strike, for a lead; an agent only within their limit', async () => {
    expect(await staffCancelView(db, alex.roles, { id: BOOKING, status: 'confirmed' })).toEqual({ refundCents: 8800, allowed: true });
    expect(await staffCancelView(db, ['finance'], { id: BOOKING, status: 'confirmed' })).toEqual({ refundCents: 8800, allowed: true });
    expect(await cancelBookingByStaff(deps, morgan, BOOKING, { note: 'short' }, now)).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await cancelBookingByStaff(deps, morgan, BOOKING, { note: 'The helper is suspended; the client asked to cancel.' }, now)).toEqual({ ok: true, code: 'canceled' });
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, BOOKING));
    expect(booking).toMatchObject({ status: 'canceled', cancelReason: 'admin', canceledBy: 'staff' });
    expect((await db.select().from(refunds).where(eq(refunds.bookingId, BOOKING))).map((row) => [row.amountCents, row.status])).toEqual([[8800, 'succeeded']]);
    const [audited] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'booking.canceled_by_staff'), eq(auditLog.targetId, BOOKING)));
    expect(audited).toMatchObject({ actorId: 'usr_morgan', metadata: { refundCents: 8800 } });
    expect(await cancelBookingByStaff(deps, morgan, BOOKING, { note: 'Trying a second time on purpose.' }, now)).toEqual({ ok: false, code: 'not_allowed' });
  });
});
