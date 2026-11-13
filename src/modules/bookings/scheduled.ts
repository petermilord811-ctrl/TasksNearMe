import { and, desc, eq, gt, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { BookingViewerRole, CardBrand, PaymentAttemptResult, PayScheduledInput, ScheduledPaymentView, SeriesChargeFailure } from '@/contracts';
import { payScheduledInputSchema } from '@/contracts';
import type { PaymentProvider } from '@/integrations/payments';
import { paymentMethods, payments } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { chargeMethodOf, finishBankVerification, methodForChoice, paymentPanel, settle, type BookingDeps } from './confirm';
import { bookingTerms, bookings } from './schema';
import { ONE_TIME_CHARGE_PLAN, VISIT_CHARGE_PLAN, retryChargeAt, type ChargePlan } from './series-domain';

/**
 * Scheduled payments (blueprint 03 §7, 04): bookings made now and paid later stay `scheduled` until their saved
 * card is charged off-session at `funding_due_at`: a regular visit 48 h before (retries at 36 h and 24 h), a
 * one-time booking made more than 14 days ahead 72 h before (a retry at 48 h). A failed charge tells the client
 * once, and they can pay on the booking page until `funding_expires_at`; after that a visit is skipped and a
 * one-time booking canceled (its task open for offers again), with no fees. Success goes through `settle`, like
 * every booking payment, so the bank step and Stripe's webhook work as at checkout.
 */

type BookingRow = typeof bookings.$inferSelect;

/** Paying now: 10 attempts per 10 minutes per client (as at checkout). */
const PAY_RATE_LIMIT = { limit: 10, windowSeconds: 600 };

export const planOf = (booking: Pick<BookingRow, 'seriesId'>): ChargePlan => (booking.seriesId ? VISIT_CHARGE_PLAN : ONE_TIME_CHARGE_PLAN);

/** What the client pays for the booking now: the latest terms' total. */
async function amountOf(db: Db, bookingId: string): Promise<number | null> {
  const [terms] = await db.select({ breakdown: bookingTerms.breakdown }).from(bookingTerms).where(eq(bookingTerms.bookingId, bookingId)).orderBy(desc(bookingTerms.version)).limit(1);
  if (!terms) return null;
  return terms.breakdown.posterChargedCents ?? terms.breakdown.posterTotalCents;
}

/**
 * Opens a payment attempt on a scheduled booking, unless one is already on its way (the job and the client
 * never both charge it): the booking row is locked, and an earlier attempt waiting for the bank is replaced.
 */
async function openAttempt(db: Db, booking: BookingRow, amountCents: number, method: { paymentMethodId: string | null; providerRef: string; brand: string; last4: string; expMonth: number; expYear: number; save: boolean }, provider: string, now: Date): Promise<{ paymentId: string; idempotencyKey: string } | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from bookings where id = ${booking.id} for update`);
    const [current] = await tx.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, booking.id)).limit(1);
    if (current?.status !== 'scheduled') return null;
    const [inFlight] = await tx.select({ id: payments.id }).from(payments).where(and(eq(payments.bookingId, booking.id), eq(payments.status, 'processing'))).limit(1);
    if (inFlight) return null;
    await tx.update(payments).set({ status: 'canceled', updatedAt: now }).where(and(eq(payments.bookingId, booking.id), eq(payments.status, 'requires_confirmation')));
    const paymentId = newId('pay');
    const idempotencyKey = `${booking.id}:${paymentId}`;
    await tx.insert(payments).values({
      id: paymentId,
      bookingId: booking.id,
      purpose: 'booking_funding',
      payerUserId: booking.posterUserId,
      amountCents,
      status: 'processing',
      provider,
      paymentMethodId: method.paymentMethodId,
      methodRef: method.providerRef,
      methodBrand: method.brand,
      methodLast4: method.last4,
      methodExpMonth: method.expMonth,
      methodExpYear: method.expYear,
      saveMethod: method.save,
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
    return { paymentId, idempotencyKey };
  });
}

/** A charge that didn't go through: the next try (if any is left), and the client hears about the first one. */
async function chargeFailed(db: Db, booking: BookingRow, failure: SeriesChargeFailure, attempts: number, now: Date): Promise<void> {
  const retryAt = retryChargeAt(planOf(booking), booking.startAt, now);
  await db
    .update(bookings)
    .set({ fundingAttempts: attempts, fundingFailure: failure, fundingDueAt: retryAt ?? null, updatedAt: now })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, 'scheduled')));
  if (booking.fundingFailure) return;
  await db.insert(outboxEvents).values({
    id: newId('evt'),
    type: 'booking.funding_failed',
    aggregateType: 'booking',
    aggregateId: booking.id,
    payload: { bookingId: booking.id, posterUserId: booking.posterUserId, failure, payBy: booking.fundingExpiresAt?.toISOString() ?? null },
  });
}

/** Charges one due booking off-session with its saved card. */
async function chargeOne(deps: BookingDeps, booking: BookingRow, now: Date): Promise<void> {
  const { db } = deps;
  // Claim it: another runner (or a double tick) finds nothing due.
  const [claimed] = await db
    .update(bookings)
    .set({ fundingDueAt: null, updatedAt: now })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, 'scheduled'), lte(bookings.fundingDueAt, now)))
    .returning();
  if (!claimed) return;
  const attempts = claimed.fundingAttempts + 1;
  const amountCents = await amountOf(db, claimed.id);
  const method = claimed.fundingMethodId ? await methodForChoice(deps, claimed.posterUserId, { kind: 'saved', methodId: claimed.fundingMethodId }) : null;
  if (!amountCents || !method || !('providerRef' in method)) return chargeFailed(db, claimed, 'no_card', attempts, now);
  const attempt = await openAttempt(db, claimed, amountCents, { ...method, save: false }, deps.payments.name, now);
  // The client is paying right now: their payment decides.
  if (!attempt) return;
  const result = await deps.payments.charge({ amountCents, method: chargeMethodOf(method), idempotencyKey: attempt.idempotencyKey, description: `TasksNearMe booking ${claimed.id}`, offSession: true });
  const settled = await settle(deps, claimed.posterUserId, attempt.paymentId, result, now);
  if (settled.ok) return;
  await chargeFailed(db, claimed, result.status === 'requires_action' ? 'requires_bank_verification' : result.status === 'failed' ? result.failureCode : 'payment_declined', attempts, now);
}

/** The job: charges every scheduled booking that's due (before its deadline). */
export async function chargeDueScheduled(deps: BookingDeps, now: Date): Promise<number> {
  const due = await deps.db
    .select()
    .from(bookings)
    .where(and(eq(bookings.status, 'scheduled'), isNotNull(bookings.fundingDueAt), lte(bookings.fundingDueAt, now), gt(bookings.fundingExpiresAt, now)))
    .orderBy(bookings.fundingDueAt)
    .limit(50);
  for (const booking of due) {
    try {
      await chargeOne(deps, booking, now);
    } catch (error) {
      console.error(`[scheduled] charging ${booking.id} failed`, error);
    }
  }
  return due.length;
}

/**
 * The job: scheduled bookings still unpaid at their deadline. A regular visit is skipped (the series goes on); a
 * one-time booking is canceled and its task opens for offers again. No fees either way: nothing was charged.
 */
export async function expireUnpaidScheduled(db: Db, now: Date): Promise<number> {
  const expired = await db
    .update(bookings)
    .set({ status: 'canceled', cancelReason: 'funding_failed', canceledBy: 'system', canceledAt: now, fundingDueAt: null, updatedAt: now })
    .where(and(eq(bookings.status, 'scheduled'), lte(bookings.fundingExpiresAt, now)))
    .returning();
  if (expired.length === 0) return 0;
  const ids = expired.map((row) => row.id);
  await db.update(payments).set({ status: 'canceled', updatedAt: now }).where(and(inArray(payments.bookingId, ids), inArray(payments.status, ['requires_confirmation', 'processing'])));
  for (const booking of expired) {
    if (booking.seriesId) {
      await db.update(tasks).set({ status: 'canceled', updatedAt: now }).where(eq(tasks.id, booking.taskId));
      await db.insert(outboxEvents).values({ id: newId('evt'), type: 'series.visit_skipped', aggregateType: 'booking', aggregateId: booking.id, payload: { bookingId: booking.id, seriesId: booking.seriesId, by: 'payment', start: booking.startAt.toISOString() } });
    } else {
      // The task is open for offers again (its window is still ahead: the deadline is 24 h before the start).
      await db.update(tasks).set({ status: 'open', reopenedAt: now, offerCount: 0, updatedAt: now, version: sql`${tasks.version} + 1` }).where(eq(tasks.id, booking.taskId));
      await db.insert(outboxEvents).values({ id: newId('evt'), type: 'booking.canceled', aggregateType: 'booking', aggregateId: booking.id, payload: { bookingId: booking.id, reason: 'funding_failed', refundCents: 0, helperCompensationCents: 0, posterUserId: booking.posterUserId, helperUserId: booking.helperUserId } });
    }
    await db.insert(auditLog).values({ id: newId('aud'), actorId: 'system', actorRole: 'system', action: 'booking.canceled', targetType: 'booking', targetId: booking.id, reason: 'funding_failed' });
  }
  return expired.length;
}

/** The client pays a scheduled booking now (after a failed charge, or before it's due): on-session, so the bank step works. */
export async function payScheduledNow(deps: BookingDeps, posterId: string, bookingId: string, input: PayScheduledInput, now: Date): Promise<PaymentAttemptResult> {
  const parsed = payScheduledInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const limited = await consumeRateLimit(deps.db, `booking-confirm:${posterId}`, PAY_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const [booking] = await deps.db.select().from(bookings).where(and(eq(bookings.id, String(bookingId)), eq(bookings.posterUserId, posterId))).limit(1);
  if (!booking || booking.status !== 'scheduled' || !booking.fundingExpiresAt || booking.fundingExpiresAt <= now) return { ok: false, code: 'not_allowed' };
  const amountCents = await amountOf(deps.db, booking.id);
  if (!amountCents) return { ok: false, code: 'unknown' };
  const method = await methodForChoice(deps, posterId, parsed.data.payment);
  if (!('providerRef' in method)) return method;
  const attempt = await openAttempt(deps.db, booking, amountCents, method, deps.payments.name, now);
  if (!attempt) return { ok: false, code: 'not_allowed' };
  const result = await deps.payments.charge({ amountCents, method: chargeMethodOf(method), idempotencyKey: attempt.idempotencyKey, description: `TasksNearMe booking ${booking.id}` });
  return settle(deps, posterId, attempt.paymentId, result, now);
}

/** After the bank step on paying now. */
export async function finishScheduledVerification(deps: BookingDeps, posterId: string, bookingId: string, paymentId: string, outcome: 'approved' | 'failed', now: Date): Promise<PaymentAttemptResult> {
  const [payment] = await deps.db.select({ bookingId: payments.bookingId }).from(payments).where(and(eq(payments.id, String(paymentId)), eq(payments.payerUserId, posterId))).limit(1);
  if (!payment || payment.bookingId !== String(bookingId)) return { ok: false, code: 'not_found' };
  return finishBankVerification(deps, posterId, String(paymentId), outcome, now);
}

/** The booking page's scheduled payment: when it's charged, or why it wasn't, and the client's cards to pay now. */
export async function scheduledPaymentViewOf(deps: { db: Db; payments?: PaymentProvider | null }, booking: BookingRow, role: BookingViewerRole): Promise<ScheduledPaymentView | undefined> {
  if (booking.status !== 'scheduled' || !booking.fundingExpiresAt) return undefined;
  const amountCents = (await amountOf(deps.db, booking.id)) ?? 0;
  const [card] = booking.fundingMethodId
    ? await deps.db.select({ brand: paymentMethods.brand, last4: paymentMethods.last4, detachedAt: paymentMethods.detachedAt }).from(paymentMethods).where(eq(paymentMethods.id, booking.fundingMethodId)).limit(1)
    : [];
  const client = role === 'poster';
  return {
    ...(booking.fundingDueAt ? { chargeAt: booking.fundingDueAt.toISOString() } : {}),
    payBy: booking.fundingExpiresAt.toISOString(),
    ...(booking.fundingFailure ? { failure: booking.fundingFailure as SeriesChargeFailure } : {}),
    amountCents,
    ...(client && card && !card.detachedAt ? { card: { brand: card.brand as CardBrand, last4: card.last4 } } : {}),
    ...(client && deps.payments ? { payment: await paymentPanel(deps.db, booking.posterUserId, deps.payments) } : {}),
  };
}
