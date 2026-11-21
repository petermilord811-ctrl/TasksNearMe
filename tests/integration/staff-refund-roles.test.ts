import { and, eq, like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { bookings, bookingTerms } from '@/modules/bookings/schema';
import { payments, refunds } from '@/modules/payments/schema';
import { refundRequests, supportCaseEvents, supportCases } from '@/modules/support/schema';
import type { StaffActor } from '@/modules/support/staff';
import { decideRefundRequest, getAdminBooking, resolveCaseWithMoney, staffRefund } from '@/modules/support/staff-money';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Refunds by role (blueprint 08; ab, 2026-11-21). Support refunds up to $100 (agents) or $500 (leads) per booking at once,
 * finance and admins up to $500; above that, up to what was charged, a different finance or admin approves (dual
 * approval). Trust and safety refund nothing. A case resolution over the resolver's limit becomes the same request, and
 * approving it applies the resolution and resolves the case.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
const pay = createDevPaymentProvider();
const now = new Date();
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const taylor: StaffActor = { id: 'usr_taylor', roles: ['trust_safety'] };
const casey: StaffActor = { id: 'usr_casey', roles: ['finance'] };
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const note = 'Checking refunds by role for the staff handbook.';
const CHARGED = 70_000;

/** A copy of the desk booked between Maya and Jordan, the work sent, with a $700 charge that went through. */
async function paidBooking(id: string): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [template] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const taskId = `tsk_rr_${id}`;
  const bookingId = `bkg_tmp_rr_${id}`;
  await db.insert(tasks).values({ ...desk!, id: taskId, slug: `tsk-rr-${id}-slug`, status: 'assigned', offerCount: 0, version: 1 });
  await db.insert(bookings).values({ ...template!, id: bookingId, taskId, offerId: null, seriesId: null, visitIndex: null, posterUserId: 'usr_maya', helperUserId: 'usr_jordan', status: 'completion_submitted', createdAt: now, updatedAt: now });
  const [terms] = await db.select().from(bookingTerms).where(and(eq(bookingTerms.bookingId, template!.id), eq(bookingTerms.version, template!.termsVersion)));
  await db.insert(bookingTerms).values({ ...terms!, id: `btm_tmp_rr_${id}`, bookingId });
  await db.insert(payments).values({ id: `pay_tmp_rr_${id}`, bookingId, purpose: 'booking_funding', payerUserId: 'usr_maya', amountCents: CHARGED, status: 'succeeded', provider: 'dev', providerRef: `devpi_rr_${id}`, idempotencyKey: `tmp-rr-${id}`, createdAt: now, updatedAt: now });
  return bookingId;
}

/** A request from Maya about the booking: goodwill is what support offers there. */
async function requestCase(id: string, bookingId: string): Promise<string> {
  const caseId = `case_tmp_rr_${id}`;
  await db.insert(supportCases).values({ id: caseId, type: 'request', status: 'open', priority: 'normal', bookingId, openedByUserId: 'usr_maya', description: 'The desk wobbles after a week.' });
  return caseId;
}

const refundsOf = async (bookingId: string) => (await db.select({ amountCents: refunds.amountCents }).from(refunds).where(eq(refunds.bookingId, bookingId))).map((row) => row.amountCents);
const pendingOf = (bookingId: string) => db.select().from(refundRequests).where(and(eq(refundRequests.bookingId, bookingId), eq(refundRequests.status, 'pending')));
const refund = (staff: StaffActor, bookingId: string, amountCents: number) => staffRefund(db, pay, staff, bookingId, { amountCents, reason: 'goodwill', note }, now);
const decide = (staff: StaffActor, bookingId: string, requestId: string, decision: 'approve' | 'decline') => decideRefundRequest(db, pay, staff, bookingId, { requestId, decision, note: 'Checked against the photos and the case.' }, now);

afterAll(async () => {
  await db.delete(refundRequests).where(like(refundRequests.bookingId, 'bkg\\_tmp\\_rr\\_%'));
  await db.update(supportCases).set({ status: 'closed' }).where(like(supportCases.id, 'case\\_tmp\\_rr\\_%'));
  await db.update(bookings).set({ status: 'canceled' }).where(like(bookings.id, 'bkg\\_tmp\\_rr\\_%'));
  await db.update(tasks).set({ status: 'canceled' }).where(like(tasks.id, 'tsk\\_rr\\_%'));
  await pool.end();
});

describe('refunds by role on a booking', () => {
  it('lets support refund up to $100 (agents) and $500 (leads) at once, and trust and safety not at all', async () => {
    const agents = await paidBooking('agent');
    expect(await refund(alex, agents, 10_000)).toMatchObject({ ok: true, code: 'submitted' });
    expect(await refund(alex, agents, 20_000)).toMatchObject({ ok: true, code: 'sent' });
    expect(await refundsOf(agents)).toEqual([10_000]);
    const leads = await paidBooking('lead');
    expect(await refund(morgan, leads, 50_000)).toMatchObject({ ok: true, code: 'submitted' });
    expect(await refund(morgan, leads, 1_000)).toMatchObject({ ok: true, code: 'sent' });
    const safety = await paidBooking('safety');
    expect(await refund(taylor, safety, 1_000)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await refundsOf(safety)).toEqual([]);
  });

  it('gives finance and admins the Refund button: up to $500 at once, then a request a different finance or admin approves', async () => {
    const bookingId = await paidBooking('finance');
    for (const staff of [alex, morgan, casey, riley]) expect((await getAdminBooking(db, staff, bookingId, now))?.actions).toContain('refund');
    expect((await getAdminBooking(db, taylor, bookingId, now))?.actions).not.toContain('refund');
    expect(await refund(casey, bookingId, 50_000)).toMatchObject({ ok: true, code: 'submitted' });
    expect(await refund(casey, bookingId, 15_000)).toMatchObject({ ok: true, code: 'sent' });
    const [asked] = await pendingOf(bookingId);
    // Never the requester: Casey can't approve Casey's own request; Riley (admin) can.
    expect((await getAdminBooking(db, casey, bookingId, now))?.refundRequests[0]?.canDecide).toBe(false);
    expect(await decide(casey, bookingId, asked!.id, 'approve')).toMatchObject({ ok: false, code: 'not_allowed' });
    expect((await getAdminBooking(db, riley, bookingId, now))?.refundRequests[0]?.canDecide).toBe(true);
    expect(await decide(riley, bookingId, asked!.id, 'approve')).toMatchObject({ ok: true, code: 'updated' });
    expect((await refundsOf(bookingId)).sort((a, b) => a - b)).toEqual([15_000, 50_000]);

    // An admin's own request above $500 goes to finance.
    const admins = await paidBooking('admin');
    expect(await refund(riley, admins, 60_000)).toMatchObject({ ok: true, code: 'sent' });
    const [adminAsked] = await pendingOf(admins);
    expect(await decide(riley, admins, adminAsked!.id, 'approve')).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await decide(casey, admins, adminAsked!.id, 'approve')).toMatchObject({ ok: true, code: 'updated' });
    expect(await refundsOf(admins)).toEqual([60_000]);
  });

  it('refuses an approval past what was charged, and acts once on a double approval', async () => {
    const past = await paidBooking('past');
    expect(await refund(riley, past, 60_000)).toMatchObject({ ok: true, code: 'sent' });
    const [asked] = await pendingOf(past);
    // Meanwhile $500 went back: $200 is left, so the $600 request can't be approved.
    expect(await refund(casey, past, 50_000)).toMatchObject({ ok: true, code: 'submitted' });
    expect(await decide(casey, past, asked!.id, 'approve')).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await refundsOf(past)).toEqual([50_000]);

    const twice = await paidBooking('twice');
    expect(await refund(riley, twice, 60_000)).toMatchObject({ ok: true, code: 'sent' });
    const [request] = await pendingOf(twice);
    const results = await Promise.all([decide(casey, twice, request!.id, 'approve'), decide(casey, twice, request!.id, 'approve')]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await refundsOf(twice)).toEqual([60_000]);
  });
});

describe('a case resolution over the resolver’s limit', () => {
  it('becomes a request; approving applies it and resolves the case in the requester’s name', async () => {
    const bookingId = await paidBooking('case_ok');
    const caseId = await requestCase('ok', bookingId);
    const resolution = { resolution: 'goodwill_refund' as const, summary: 'We are refunding $600 for the wobbling desk.', goodwillCents: 60_000 };
    expect(await resolveCaseWithMoney(db, pay, riley, caseId, 1, resolution, now)).toMatchObject({ ok: true, code: 'sent' });
    // Sent twice, asked once.
    expect(await resolveCaseWithMoney(db, pay, riley, caseId, 1, resolution, now)).toMatchObject({ ok: true, code: 'sent' });
    const asked = await pendingOf(bookingId);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ caseId, amountCents: 60_000, reason: 'case_resolution', requestedByUserId: 'usr_riley', resolution: 'goodwill_refund' });
    expect((await db.select({ status: supportCases.status }).from(supportCases).where(eq(supportCases.id, caseId)))[0]?.status).toBe('open');
    expect(await refundsOf(bookingId)).toEqual([]);

    expect(await decide(riley, bookingId, asked[0]!.id, 'approve')).toMatchObject({ ok: false, code: 'not_allowed' });
    // Approved twice at once (a double click, two tabs): it acts once.
    const results = await Promise.all([decide(casey, bookingId, asked[0]!.id, 'approve'), decide(casey, bookingId, asked[0]!.id, 'approve')]);
    expect(results.filter((result) => result.ok)).toEqual([{ ok: true, code: 'updated' }]);
    expect(await refundsOf(bookingId)).toEqual([60_000]);
    const [resolved] = await db.select({ status: supportCases.status, resolution: supportCases.resolution }).from(supportCases).where(eq(supportCases.id, caseId));
    expect(resolved).toEqual({ status: 'resolved', resolution: 'goodwill_refund' });
    const events = await db.select({ kind: supportCaseEvents.kind, authorUserId: supportCaseEvents.authorUserId, body: supportCaseEvents.body }).from(supportCaseEvents).where(eq(supportCaseEvents.caseId, caseId));
    expect(events.filter((event) => event.kind === 'resolution')).toEqual([expect.objectContaining({ authorUserId: 'usr_riley' })]);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'note', authorUserId: 'usr_casey', body: expect.stringContaining('Approved') }));
  });

  it('keeps the case open when declined, and refuses an approval once the money changed', async () => {
    const declinedBooking = await paidBooking('case_no');
    const declinedCase = await requestCase('no', declinedBooking);
    expect(await resolveCaseWithMoney(db, pay, riley, declinedCase, 1, { resolution: 'goodwill_refund', summary: 'We are refunding $600 for the wobbling desk.', goodwillCents: 60_000 }, now)).toMatchObject({ ok: true, code: 'sent' });
    const [request] = await pendingOf(declinedBooking);
    expect(await decide(casey, declinedBooking, request!.id, 'decline')).toMatchObject({ ok: true, code: 'updated' });
    expect((await db.select({ status: supportCases.status }).from(supportCases).where(eq(supportCases.id, declinedCase)))[0]?.status).toBe('open');
    expect(await refundsOf(declinedBooking)).toEqual([]);
    const notes = await db.select({ body: supportCaseEvents.body }).from(supportCaseEvents).where(and(eq(supportCaseEvents.caseId, declinedCase), eq(supportCaseEvents.kind, 'note')));
    expect(notes.map((row) => row.body)).toContainEqual(expect.stringContaining('Approval declined'));

    const changedBooking = await paidBooking('case_changed');
    const changedCase = await requestCase('changed', changedBooking);
    expect(await resolveCaseWithMoney(db, pay, riley, changedCase, 1, { resolution: 'goodwill_refund', summary: 'We are refunding $600 for the wobbling desk.', goodwillCents: 60_000 }, now)).toMatchObject({ ok: true, code: 'sent' });
    const [waiting] = await pendingOf(changedBooking);
    // $500 went back meanwhile: $600 can't come out of the $200 left any more.
    expect(await refund(casey, changedBooking, 50_000)).toMatchObject({ ok: true, code: 'submitted' });
    expect(await decide(casey, changedBooking, waiting!.id, 'approve')).toMatchObject({ ok: false, code: 'version_conflict' });
    expect(await refundsOf(changedBooking)).toEqual([50_000]);
    expect((await pendingOf(changedBooking)).map((row) => row.id)).toEqual([waiting!.id]);
  });
});
