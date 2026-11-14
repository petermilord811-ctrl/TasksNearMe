import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookings } from '@/modules/bookings/schema';
import { notifications } from '@/modules/notifications/schema';
import { dispatchNotifications, getNotificationsPage } from '@/modules/notifications/service';
import { payments } from '@/modules/payments/schema';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Outbox claims (completion plan 5.18, migration 0054): dispatchers run at once (the job runner, every signed-in
 * page, the notifications page), and each event is handled by one of them. A refund that needs a person opens one
 * case, not one per dispatcher, and a claim left by a dispatcher that stopped is taken again after 5 minutes.
 * The notifications page still shows what another dispatcher is holding (5.19).
 */

const url = process.env.TEST_DATABASE_URL ?? '';
const first = createDb(url, { max: 3 });
const second = createDb(url, { max: 3 });
const db = first.db;
const now = new Date();
const PAYMENTS = ['pay_claim_1', 'pay_claim_2', 'pay_claim_3', 'pay_claim_4', 'pay_claim_5'];

beforeAll(async () => {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  await db.insert(payments).values(PAYMENTS.map((id, index) => ({ id, bookingId: 'bkg_tv', purpose: 'tip', payerUserId: booking!.posterUserId, amountCents: 100 + index, status: 'succeeded', provider: 'dev', providerRef: `devpi_${id}`, idempotencyKey: `pay:claim:${id}` })));
});

afterAll(async () => {
  const opened = await db.select({ caseId: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.action, 'payment.refund_case_opened'), inArray(auditLog.targetId, PAYMENTS)));
  const cases = opened.map((row) => (row.caseId as { caseId: string }).caseId);
  if (cases.length) {
    await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, cases));
    await db.delete(supportCases).where(inArray(supportCases.id, cases));
  }
  await db.delete(auditLog).where(and(eq(auditLog.action, 'payment.refund_case_opened'), inArray(auditLog.targetId, PAYMENTS)));
  await db.delete(notifications).where(like(notifications.sourceEventId, 'evt\\_claim\\_%'));
  await db.delete(outboxEvents).where(like(outboxEvents.id, 'evt\\_claim\\_%'));
  await db.delete(payments).where(inArray(payments.id, PAYMENTS));
  await first.pool.end();
  await second.pool.end();
});

const refundNeeded = (id: string, paymentId: string, extra: Partial<typeof outboxEvents.$inferInsert> = {}) => ({ id, type: 'payment.refund_needed', aggregateType: 'payment', aggregateId: paymentId, payload: { paymentId, reason: 'second_tip' }, ...extra });

describe('outbox claims', () => {
  it('two dispatchers at once handle each event once', async () => {
    await db.insert(outboxEvents).values(PAYMENTS.map((paymentId, index) => refundNeeded(`evt_claim_${index}`, paymentId)));
    await Promise.all([dispatchNotifications(first.db, now), dispatchNotifications(second.db, now), dispatchNotifications(first.db, now)]);
    const opened = await db.select({ paymentId: auditLog.targetId }).from(auditLog).where(and(eq(auditLog.action, 'payment.refund_case_opened'), inArray(auditLog.targetId, PAYMENTS)));
    expect(opened.map((row) => row.paymentId).sort()).toEqual(PAYMENTS);
    const events = await db.select().from(outboxEvents).where(like(outboxEvents.id, 'evt\\_claim\\_%'));
    expect(events.every((event) => event.dispatchedAt !== null)).toBe(true);
  });

  it('takes again a claim older than 5 minutes, and leaves one another dispatcher holds', async () => {
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000).toISOString();
    const aMinuteAgo = new Date(now.getTime() - 60_000).toISOString();
    await db.insert(outboxEvents).values([
      { id: 'evt_claim_stale', type: 'claim.test', aggregateType: 'test', aggregateId: 'x', payload: {}, claimedAt: tenMinutesAgo },
      { id: 'evt_claim_live', type: 'claim.test', aggregateType: 'test', aggregateId: 'y', payload: {}, claimedAt: aMinuteAgo },
    ]);
    await dispatchNotifications(db, now);
    const [stale] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, 'evt_claim_stale'));
    const [live] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, 'evt_claim_live'));
    expect(stale!.dispatchedAt).not.toBeNull();
    expect(live!.dispatchedAt).toBeNull();
  });

  it('a request on the test clock, days ahead, leaves a claim another dispatcher holds (5.19)', async () => {
    await db.insert(outboxEvents).values({ id: 'evt_claim_ahead', type: 'claim.test', aggregateType: 'test', aggregateId: 'z', payload: {}, claimedAt: new Date(Date.now() - 60_000).toISOString() });
    await dispatchNotifications(db, new Date(Date.now() + 48 * 3_600_000));
    const [held] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, 'evt_claim_ahead'));
    expect(held!.dispatchedAt).toBeNull();
  });

  it('the notifications page shows a notification whose event another dispatcher is still handling (5.19)', async () => {
    // The signed-in layout renders beside the page and dispatches too: here it has claimed the reminder and not finished.
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
    await db.insert(outboxEvents).values({
      id: 'evt_claim_held',
      type: 'booking.approval_reminder',
      aggregateType: 'booking',
      aggregateId: 'bkg_tv',
      payload: { bookingId: 'bkg_tv', taskId: booking!.taskId, posterUserId: booking!.posterUserId, hours: 24, approvalDueAt: new Date(Date.now() + 24 * 3_600_000).toISOString() },
      claimedAt: new Date().toISOString(),
    });
    const page = await getNotificationsPage(db, booking!.posterUserId, new Date());
    const [made] = await db.select().from(notifications).where(eq(notifications.sourceEventId, 'evt_claim_held'));
    expect(made?.userId).toBe(booking!.posterUserId);
    expect(page.notifications.map((item) => item.id)).toContain(made!.id);
    // The claimer still finishes it: the page made the notification but didn't dispatch the event.
    const [event] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, 'evt_claim_held'));
    expect(event!.dispatchedAt).toBeNull();
  });

  it('the notifications page also shows one whose claim is still being written, which its own claim skipped as locked (5.19)', async () => {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
    await db.insert(outboxEvents).values({
      id: 'evt_claim_locked',
      type: 'booking.approval_reminder',
      aggregateType: 'booking',
      aggregateId: 'bkg_tv',
      payload: { bookingId: 'bkg_tv', taskId: booking!.taskId, posterUserId: booking!.posterUserId, hours: 4, approvalDueAt: new Date(Date.now() + 4 * 3_600_000).toISOString() },
    });
    // Another dispatcher's claim statement has the row locked and hasn't committed: the row still reads as unclaimed.
    const other = await second.pool.connect();
    try {
      await other.query('begin');
      await other.query("select id from outbox_events where id = 'evt_claim_locked' for no key update");
      const page = await getNotificationsPage(db, booking!.posterUserId, new Date());
      const [made] = await db.select().from(notifications).where(eq(notifications.sourceEventId, 'evt_claim_locked'));
      expect(made?.userId).toBe(booking!.posterUserId);
      expect(page.notifications.map((item) => item.id)).toContain(made!.id);
    } finally {
      await other.query('rollback');
      other.release();
    }
  });
});
