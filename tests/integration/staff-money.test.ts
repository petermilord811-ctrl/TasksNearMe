import { and, eq } from 'drizzle-orm';
import { ensureThread } from '@/modules/messaging/service';
import { afterAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { reportProblem, submitCompletion } from '@/modules/bookings/completion';
import { getBookingView } from '@/modules/bookings/hub';
import { getNotificationsPage } from '@/modules/notifications/service';
import { confirmBooking } from '@/modules/bookings/confirm';
import { bookings } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { offers } from '@/modules/offers/schema';
import { payments, refunds } from '@/modules/payments/schema';
import { supportCases } from '@/modules/support/schema';
import { getAdminCase, previewResolution, staffReply, type StaffActor } from '@/modules/support/staff';
import { getAdminBooking, resolveCaseWithMoney, revealBookingAddress, revealBookingConversation, staffRefund } from '@/modules/support/staff-money';
import { files, tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const pay = createDevPaymentProvider();
const now = () => new Date();
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const casey: StaffActor = { id: 'usr_casey', roles: ['finance'] };

/** Priya books Jordan for a copy of the desk ($60, charged $66), Jordan sends the work, Priya reports a problem. */
async function disputedDesk(id: string): Promise<{ bookingId: string; caseId: string }> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  await db.insert(tasks).values({ ...desk!, id, slug: `${id}-slug`, posterUserId: 'usr_priya', status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer!, id: `off_${id}`, taskId: id, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
  const booked = await confirmBooking({ db, payments: pay }, 'usr_priya', id, `off_${id}`, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now());
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  const bookingId = booked.redirectTo.split('/').pop()!;
  await db.update(bookings).set({ status: 'in_progress', arrivedAt: now() }).where(eq(bookings.id, bookingId));
  await db.insert(files).values({ id: `fil_${id}`, ownerUserId: 'usr_jordan', kind: 'evidence', storageKey: `test/${id}.webp`, contentType: 'image/webp', width: 800, height: 600, bytes: 100 });
  expect(await submitCompletion(db, 'usr_jordan', bookingId, { photoIds: [`fil_${id}`], note: 'Done.', expenses: [] }, now())).toMatchObject({ ok: true });
  expect(await reportProblem(db, 'usr_priya', bookingId, { reason: 'not_done', description: 'The drawers were left in the box.', photoIds: [] }, now())).toMatchObject({ ok: true });
  const [found] = await db.select({ id: supportCases.id }).from(supportCases).where(and(eq(supportCases.bookingId, bookingId), eq(supportCases.type, 'dispute')));
  return { bookingId, caseId: found!.id };
}

const versionOf = async (caseId: string) => (await getAdminCase(db, alex, caseId, now()))!.version;

describe('money resolutions', () => {
  it('settles at $45: $16.50 back to the client, $40.50 to the helper (blueprint 04 §6)', async () => {
    const { bookingId, caseId } = await disputedDesk('tsk_settle');
    const page = await getAdminCase(db, alex, caseId, now());
    expect(page?.data.resolutions).toEqual(['release_full', 'settle', 'refund_full', 'account_action']);
    expect(page?.data.money).toEqual({ priceCents: 6000, chargedCents: 6600, refundedCents: 0 });
    expect(await previewResolution(db, alex, caseId, { resolution: 'settle', settlePriceCents: 6000, summary: 'Settled at a lower price.' })).toMatchObject({ ok: false, fieldErrors: { settlePriceCents: ['invalid'] } });
    expect(await previewResolution(db, alex, caseId, { resolution: 'settle', settlePriceCents: 4500, summary: 'Settled at a lower price.' })).toEqual({
      ok: true,
      preview: { posterRefundCents: 1650, helperReceivesCents: 4050, platformKeepsCents: 900, withinLimit: true },
    });

    const settle = { resolution: 'settle' as const, settlePriceCents: 4500, summary: 'Settled at $45 for the unfinished drawers.' };
    expect(await resolveCaseWithMoney(db, pay, alex, caseId, await versionOf(caseId), settle, now())).toEqual({ ok: true, code: 'saved' });
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(booking).toMatchObject({ status: 'completed', completedVia: 'settlement' });
    expect((await db.select().from(refunds).where(eq(refunds.bookingId, bookingId))).map((row) => [row.amountCents, row.reason, row.status])).toEqual([[1650, 'dispute_settlement', 'succeeded']]);
    expect((await db.select().from(earnings).where(and(eq(earnings.bookingId, bookingId), eq(earnings.kind, 'earnings'))))[0]?.amountCents).toBe(4050);
    // Resolving again (a stale page) never pays twice.
    expect(await resolveCaseWithMoney(db, pay, alex, caseId, 1, settle, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await db.select().from(refunds).where(eq(refunds.bookingId, bookingId))).toHaveLength(1);
  });

  it('refunds in full and ends the booking; releases in full and pays the helper', async () => {
    const refund = await disputedDesk('tsk_refund');
    expect(await resolveCaseWithMoney(db, pay, alex, refund.caseId, await versionOf(refund.caseId), { resolution: 'refund_full', summary: 'Refunded in full; the work was not done.' }, now())).toEqual({ ok: true, code: 'saved' });
    expect((await db.select().from(bookings).where(eq(bookings.id, refund.bookingId)))[0]).toMatchObject({ status: 'canceled', cancelReason: 'refunded_in_dispute' });
    expect((await db.select().from(payments).where(eq(payments.bookingId, refund.bookingId)))[0]?.status).toBe('refunded');

    const release = await disputedDesk('tsk_release');
    expect(await resolveCaseWithMoney(db, pay, alex, release.caseId, await versionOf(release.caseId), { resolution: 'release_full', summary: 'The work matches the request; paid in full.' }, now())).toEqual({ ok: true, code: 'saved' });
    expect((await db.select().from(bookings).where(eq(bookings.id, release.bookingId)))[0]).toMatchObject({ status: 'completed', completedVia: 'support' });
    expect((await db.select().from(earnings).where(and(eq(earnings.bookingId, release.bookingId), eq(earnings.kind, 'earnings'))))[0]?.amountCents).toBe(5400);
    expect(await db.select().from(refunds).where(eq(refunds.bookingId, release.bookingId))).toHaveLength(0);
  });
});

describe('the staff booking page', () => {
  it('shows the money and cases, refunds within the limit, and opens the address only with a reason', async () => {
    const [settled] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.taskId, 'tsk_settle'));
    const page = await getAdminBooking(db, alex, settled!.id, now());
    expect(page?.money).toMatchObject({ chargedCents: 6600, refundedCents: 1650 });
    expect(page?.money.finalBreakdown?.taskPriceCents).toBe(4500);
    expect(page?.cases[0]).toMatchObject({ type: 'dispute', status: 'resolved' });
    expect(page?.refund).toEqual({ maxCents: 4950, limitCents: 10_000, leftCents: 4950 });
    expect(page?.actions).toEqual(['refund', 'reveal_address', 'reveal_conversation']);
    // Finance reads the page but doesn't work cases here.
    expect(await getAdminBooking(db, casey, settled!.id, now())).toMatchObject({ actions: [] });

    expect(await staffRefund(db, pay, alex, settled!.id, { amountCents: 5000, reason: 'goodwill', note: 'More than is left on this booking.' }, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await staffRefund(db, pay, alex, settled!.id, { amountCents: 500, reason: 'goodwill', note: 'A scratch found after the visit.' }, now())).toEqual({ ok: true, code: 'submitted' });
    expect((await getAdminBooking(db, alex, settled!.id, now()))?.money.refundedCents).toBe(2150);

    expect(await revealBookingAddress(db, fieldCipherFromEnv(), alex, settled!.id, { reason: 'short' }, now())).toMatchObject({ ok: false, code: 'validation_failed' });
    const revealed = await revealBookingAddress(db, fieldCipherFromEnv(), alex, settled!.id, { reason: 'Checking the reported damage location.' }, now());
    expect(revealed.ok && revealed.address.line1).toBeTruthy();
    const [logged] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'booking.view_address'), eq(auditLog.targetId, settled!.id)));
    expect(logged).toMatchObject({ actorId: 'usr_alex', reason: 'Checking the reported damage location.' });

    // The conversation opens only while a case about the booking is being handled (blueprint 08).
    const reason = { reason: 'Checking what was agreed about the drawer.' };
    expect(await revealBookingConversation(db, alex, settled!.id, reason, now())).toMatchObject({ ok: true });
    const [quiet] = await db.select({ id: bookings.id, posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId }).from(bookings).where(eq(bookings.taskId, 'tsk_wardrobe'));
    // A booking with a conversation but no case.
    await ensureThread(db, { kind: 'booking', linkedId: quiet!.id, taskId: 'tsk_wardrobe', participantIds: [quiet!.posterUserId, quiet!.helperUserId] }, now());
    expect((await getAdminBooking(db, alex, quiet!.id, now()))?.actions).not.toContain('reveal_conversation');
    expect(await revealBookingConversation(db, alex, quiet!.id, reason, now())).toEqual({ ok: false, code: 'not_allowed' });
  });
});

describe('the dispute on the booking page (UI-026)', () => {
  it('shows each person the case, support’s replies as notifications, and their own money once settled', async () => {
    const { bookingId, caseId } = await disputedDesk('tsk_dispute_view');
    const hub = { db, cipher: fieldCipherFromEnv() };
    expect((await getBookingView(hub, 'usr_priya', bookingId, now()))?.dispute).toMatchObject({ caseId, status: 'open', reason: 'not_done', canOpenCase: true });
    expect((await getBookingView(hub, 'usr_jordan', bookingId, now()))?.dispute).toMatchObject({ caseId, canOpenCase: false });

    expect(await staffReply(db, alex, caseId, { partyId: 'usr_jordan', body: 'Jordan, what happened with the drawers?' }, now())).toEqual({ ok: true, code: 'sent' });
    expect((await getBookingView(hub, 'usr_jordan', bookingId, now()))?.dispute?.canOpenCase).toBe(true);
    const jordanNotes = await getNotificationsPage(db, 'usr_jordan', now());
    expect(jordanNotes.notifications.find((note) => note.type === 'support_replied')).toMatchObject({ target: { kind: 'support_case', caseId } });

    const settle = { resolution: 'settle' as const, settlePriceCents: 4500, summary: 'Settled at $45 for the unfinished drawers.' };
    expect(await resolveCaseWithMoney(db, pay, alex, caseId, await versionOf(caseId), settle, now())).toEqual({ ok: true, code: 'saved' });
    expect((await getBookingView(hub, 'usr_priya', bookingId, now()))?.dispute?.resolution).toMatchObject({ type: 'settle', refundCents: 1650 });
    expect((await getBookingView(hub, 'usr_jordan', bookingId, now()))?.dispute?.resolution).toMatchObject({ type: 'settle', receivesCents: 4050 });
    const priyaNotes = await getNotificationsPage(db, 'usr_priya', now());
    expect(priyaNotes.notifications.find((note) => note.type === 'case_resolved')).toMatchObject({ target: { kind: 'support_case', caseId } });
  });
});
