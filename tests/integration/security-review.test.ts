import { and, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookings, bookingTerms } from '@/modules/bookings/schema';
import { users } from '@/modules/accounts/schema';
import { staffCancelView } from '@/modules/bookings/sheets';
import { requestHelper } from '@/modules/invites/service';
import { offers } from '@/modules/offers/schema';
import { payments, refunds } from '@/modules/payments/schema';
import { refundRequests, supportCases } from '@/modules/support/schema';
import { addCaseNote, getAdminCase, getAdminCases, parseAdminCaseFilters, type StaffActor } from '@/modules/support/staff';
import { decideRefundRequest, resolveCaseWithMoney, staffRefund } from '@/modules/support/staff-money';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/**
 * The security review (2026-11-20) in bookings and support: staff never act on their own bookings or cases, an agent's
 * cancel counts earlier refunds, a booking can't land on a task canceled under it, and invites take offers' price rules.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
const pay = createDevPaymentProvider();
const deps = { db, payments: pay };
const now = new Date();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const note = 'Checking this one for the security review.';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** A client of this file's own (booking has a per-person limit other files use up). */
const CLIENT = 'usr_tmp_sec_client';

/** A confirmed copy of the desk with Alex (on staff) as its helper or client, and a dispute case about it. */
async function ownBooking(id: string, side: 'helper' | 'poster'): Promise<{ bookingId: string; caseId: string }> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [template] = await db.select().from(bookings).limit(1);
  const taskId = `tsk_sec_${id}`;
  const bookingId = `bkg_tmp_sec_${id}`;
  await db.insert(tasks).values({ ...desk!, id: taskId, slug: `tsk-sec-${id}-slug`, status: 'assigned', offerCount: 0, version: 1 });
  await db.insert(bookings).values({
    ...template!,
    id: bookingId,
    taskId,
    offerId: null,
    seriesId: null,
    visitIndex: null,
    posterUserId: side === 'poster' ? 'usr_alex' : 'usr_maya',
    helperUserId: side === 'helper' ? 'usr_alex' : 'usr_jordan',
    status: 'completion_submitted',
    createdAt: now,
    updatedAt: now,
  });
  const [terms] = await db.select().from(bookingTerms).where(and(eq(bookingTerms.bookingId, template!.id), eq(bookingTerms.version, template!.termsVersion)));
  await db.insert(bookingTerms).values({ ...terms!, id: `btm_tmp_sec_${id}`, bookingId });
  await db.insert(payments).values({ id: `pay_tmp_sec_${id}`, bookingId, purpose: 'booking_funding', payerUserId: side === 'poster' ? 'usr_alex' : 'usr_maya', amountCents: 6600, status: 'succeeded', provider: 'dev', providerRef: `devpi_sec_${id}`, idempotencyKey: `tmp-sec-${id}`, createdAt: now, updatedAt: now });
  const caseId = `case_tmp_sec_${id}`;
  await db.insert(supportCases).values({ id: caseId, type: 'dispute', status: 'open', bookingId, openedByUserId: side === 'poster' ? 'usr_jordan' : 'usr_maya', description: 'The work was not done.' });
  return { bookingId, caseId };
}

beforeAll(async () => {
  await db.delete(refundRequests).where(like(refundRequests.bookingId, 'bkg\\_tmp\\_sec\\_%'));
  const [ben] = await db.select().from(users).where(eq(users.id, 'usr_ben'));
  await db.insert(users).values({ ...ben!, id: CLIENT, email: 'tmp-sec-client@example.test', phone: null, phoneVerifiedAt: null });
});

afterAll(async () => {
  await db.delete(refundRequests).where(like(refundRequests.bookingId, 'bkg\\_tmp\\_sec\\_%'));
  await db.update(tasks).set({ status: 'canceled' }).where(like(tasks.id, 'tsk\\_sec\\_%'));
  await db.update(bookings).set({ status: 'canceled' }).where(like(bookings.id, 'bkg\\_tmp\\_sec\\_%'));
  await db.update(supportCases).set({ status: 'closed' }).where(like(supportCases.id, 'case\\_tmp\\_sec\\_%'));
  await pool.end();
});

describe('staff and their own matters', () => {
  it('never shows staff a case about their own booking, nor lets them resolve it (a helper paying themselves)', async () => {
    const { bookingId, caseId } = await ownBooking('helper', 'helper');
    expect(await getAdminCase(db, alex, caseId, now)).toBeNull();
    expect(await resolveCaseWithMoney(db, pay, alex, caseId, 1, { resolution: 'release_full', summary: 'Released in full; the work was done.' }, now)).toMatchObject({ ok: false });
    expect((await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId)))[0]?.status).toBe('completion_submitted');
    const listed = await getAdminCases(db, alex, parseAdminCaseFilters({}), now);
    expect(listed.cases.some((row) => row.id === caseId)).toBe(false);
    // Somebody else handles it.
    expect(await getAdminCase(db, morgan, caseId, now)).not.toBeNull();
    expect((await getAdminCases(db, morgan, parseAdminCaseFilters({}), now)).cases.some((row) => row.id === caseId)).toBe(true);
  });

  it('never shows a reported staff member the report about them', async () => {
    await db.insert(supportCases).values({ id: 'case_tmp_sec_report', type: 'report', status: 'open', subjectUserId: 'usr_alex', openedByUserId: 'usr_maya', description: 'Rude on the phone.' });
    expect(await getAdminCase(db, alex, 'case_tmp_sec_report', now)).toBeNull();
    expect(await addCaseNote(db, alex, 'case_tmp_sec_report', { body: 'Nothing to see here at all.' }, now)).toMatchObject({ ok: false });
    // Another agent notes it, and the note is audited.
    const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
    expect(await addCaseNote(db, riley, 'case_tmp_sec_report', { body: 'Called the client back today.' }, now)).toEqual({ ok: true, code: 'saved' });
    expect(await db.select().from(auditLog).where(and(eq(auditLog.action, 'case.note_added'), eq(auditLog.targetId, 'case_tmp_sec_report')))).toHaveLength(1);
  });

  it('refunds and approves nothing on a staff member’s own booking', async () => {
    const { bookingId } = await ownBooking('poster', 'poster');
    expect(await staffRefund(db, pay, alex, bookingId, { amountCents: 500, reason: 'goodwill', note }, now)).toEqual({ ok: false, code: 'not_allowed' });
    await db.insert(refundRequests).values({ id: 'rrq_tmp_sec', bookingId, amountCents: 500, reason: 'goodwill', note, requestedByUserId: 'usr_morgan', status: 'pending', createdAt: now });
    expect(await decideRefundRequest(db, pay, alex, bookingId, { requestId: 'rrq_tmp_sec', decision: 'approve', note }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await db.select().from(refunds).where(eq(refunds.bookingId, bookingId))).toHaveLength(0);
  });
});

describe('limits', () => {
  it('counts what staff already gave back toward an agent’s cancel', async () => {
    const bookingId = 'bkg_tmp_sec_limit';
    await db.insert(payments).values({ id: 'pay_tmp_sec_limit', bookingId, purpose: 'booking_funding', payerUserId: 'usr_maya', amountCents: 15_000, status: 'partially_refunded', provider: 'dev', providerRef: 'devpi_sec_limit', idempotencyKey: 'tmp-sec-limit', createdAt: now, updatedAt: now });
    await db.insert(refunds).values({ id: 'ref_tmp_sec_limit', paymentId: 'pay_tmp_sec_limit', bookingId, amountCents: 6000, reason: 'goodwill', status: 'succeeded', providerRef: 're_tmp_sec_limit', idempotencyKey: 'tmp-sec-limit-goodwill', createdAt: now });
    // $90 left to refund, and $60 already given back: $150 on the booking, over an agent's $100.
    expect(await staffCancelView(db, ['support_agent'], { id: bookingId, status: 'confirmed' })).toEqual({ refundCents: 9000, allowed: false });
    expect(await staffCancelView(db, ['support_lead'], { id: bookingId, status: 'confirmed' })).toEqual({ refundCents: 9000, allowed: true });
  });
});

describe('a booking on a task canceled under it', () => {
  it('lands nowhere: the task is checked again under its lock', async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
    const start = new Date(now.getTime() + 3 * DAY);
    await db.insert(tasks).values({ ...desk!, id: 'tsk_sec_race', slug: 'tsk-sec-race-slug', posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 6 * HOUR) });
    await db.insert(offers).values({ ...offer!, id: 'off_sec_race', taskId: 'tsk_sec_race', status: 'pending', revision: 1, proposedStart: start, expiresAt: new Date(now.getTime() + 72 * HOUR) });
    await getBookingConfirmPage(deps, CLIENT, 'tsk_sec_race', 'off_sec_race', now);
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = db.transaction(async (tx) => {
      await tx.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, 'tsk_sec_race'));
      locked();
      await gate;
    });
    await isLocked;
    const booking = confirmBooking(deps, CLIENT, 'tsk_sec_race', 'off_sec_race', { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now);
    await sleep(500);
    release();
    await holder;
    expect(await booking).toMatchObject({ ok: false });
    expect(await db.select().from(bookings).where(and(eq(bookings.taskId, 'tsk_sec_race'), eq(bookings.status, 'confirmed')))).toHaveLength(0);
  });
});

describe('invite prices', () => {
  it('take the category’s minimum, a ceiling, and no more hours estimated than the cap', async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const windowStart = new Date(now.getTime() + 3 * DAY);
    await db.insert(tasks).values({ ...desk!, id: 'tsk_sec_price', slug: 'tsk-sec-price-slug', posterUserId: 'usr_chris', status: 'open', offerCount: 0, version: 1, windowStart, windowEnd: new Date(windowStart.getTime() + 6 * HOUR) });
    const ask = (pricing: Parameters<typeof requestHelper>[3]['pricing']) =>
      requestHelper(deps, 'usr_chris', 'jordan-t', { taskId: 'tsk_sec_price', start: new Date(windowStart.getTime() + HOUR).toISOString(), pricing, message: 'Same kind of flat-pack as last time.', payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now);
    expect(await ask({ type: 'fixed', priceCents: 100 })).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { pricing: ['out_of_range'] } });
    expect(await ask({ type: 'hourly', rateCents: 4000, estimatedHours: 6, hoursCap: 4 })).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await ask({ type: 'fixed', priceCents: 20_000_000 })).toMatchObject({ ok: false, code: 'validation_failed' });
  });
});
