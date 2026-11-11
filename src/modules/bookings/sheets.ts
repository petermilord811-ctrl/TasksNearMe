import { and, eq, inArray, lte } from 'drizzle-orm';
import type {
  ActionResult,
  BookingNoteInput,
  BookingViewerRole,
  CancelBookingInput,
  CancellationPreview,
  CancelReason,
  LateByMinutes,
  SafetyReportInput,
} from '@/contracts';
import { bookingNoteInputSchema, cancelBookingInputSchema, HELPER_CANCEL_REASONS, LATE_BY_MINUTES, POSTER_CANCEL_REASONS, safetyReportInputSchema } from '@/contracts';
import type { PaymentProvider } from '@/integrations/payments';
import { marketPolicies } from '@/modules/markets/schema';
import { bookingThreadLink, postEvent } from '@/modules/messaging/service';
import { cancellationSummary, lateCancellation } from '@/modules/payments/fees';
import { payments, refunds } from '@/modules/payments/schema';
import { supportCases } from '@/modules/support/schema';
import { tasks } from '@/modules/tasks/schema';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { CANT_ACCESS_ANSWER_MS } from './domain';
import { bookings, bookingTerms, helperStrikes } from './schema';

/**
 * The booking sheets (blueprint 03 §4, 04 §6): cancelling with the policy outcome and the money that
 * follows (refund to the client, compensation to the helper, strikes), running late, no-shows, can't
 * access (and its 30-minute answer window), and safety reports for support.
 */

export interface SheetDeps {
  db: Db;
  payments: PaymentProvider;
}

type BookingRow = typeof bookings.$inferSelect;
const SHEET_RATE_LIMIT = { limit: 20, windowSeconds: 600 };

async function load(db: Db, bookingId: string) {
  const [row] = await db
    .select({ booking: bookings, terms: bookingTerms, policy: marketPolicies })
    .from(bookings)
    .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
    .innerJoin(marketPolicies, eq(marketPolicies.id, bookings.policyVersionId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}
type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

function roleOf(booking: BookingRow, userId: string): BookingViewerRole | null {
  return booking.posterUserId === userId ? 'poster' : booking.helperUserId === userId ? 'helper' : null;
}

/** The money and strike outcome of a cancellation by `by` at `now`. */
function outcomeOf(row: Loaded, by: BookingViewerRole | 'no_show' | 'poster_unavailable', now: Date) {
  const charged = row.terms.breakdown.posterChargedCents ?? row.terms.breakdown.posterTotalCents;
  const summary = cancellationSummary(row.policy.cancellation, row.terms.breakdown, row.booking.startAt.toISOString());
  const late = now.getTime() >= Date.parse(summary.freeUntil);
  if (by === 'helper') return { reason: 'helper' as CancelReason, late, refund: charged, compensation: 0, strike: late ? 'late_cancellation' : null };
  if (by === 'no_show') return { reason: 'helper_no_show' as CancelReason, late, refund: charged, compensation: 0, strike: 'no_show' };
  if (by === 'poster_unavailable' || late) {
    const terms = lateCancellation(row.policy.cancellation, row.terms.breakdown);
    return {
      reason: (by === 'poster_unavailable' ? 'poster_no_show' : 'poster_late') as CancelReason,
      late: true,
      refund: terms.posterRefundCents,
      compensation: terms.helperCompensationCents,
      strike: null,
    };
  }
  return { reason: 'poster_early' as CancelReason, late: false, refund: charged, compensation: 0, strike: null };
}

/** What cancelling now means, for the cancel sheet. */
export async function previewCancellation(db: Db, userId: string, bookingId: string, now: Date): Promise<CancellationPreview | null> {
  const row = await load(db, String(bookingId));
  const role = row ? roleOf(row.booking, userId) : null;
  if (!row || !role) return null;
  const outcome = outcomeOf(row, role, now);
  const summary = cancellationSummary(row.policy.cancellation, row.terms.breakdown, row.booking.startAt.toISOString());
  return {
    by: role,
    late: outcome.late,
    freeUntil: summary.freeUntil,
    posterRefundCents: outcome.refund,
    helperCompensationCents: outcome.compensation,
    helperStrike: outcome.strike !== null,
  };
}

/** Refunds the booking's captured charge (in part or in full). */
async function refundCharge(deps: SheetDeps, booking: BookingRow, amountCents: number, now: Date): Promise<void> {
  if (amountCents <= 0) return;
  const [charge] = await deps.db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, booking.id), eq(payments.purpose, 'booking_funding'), eq(payments.status, 'succeeded')))
    .limit(1);
  if (!charge?.providerRef) return;
  const idempotencyKey = `refund:${booking.id}:cancellation`;
  const result = await deps.payments.refund({ chargeRef: charge.providerRef, amountCents, idempotencyKey });
  await deps.db
    .insert(refunds)
    .values({
      id: newId('ref'),
      paymentId: charge.id,
      bookingId: booking.id,
      amountCents,
      reason: 'cancellation',
      status: result.status,
      providerRef: result.refundRef,
      idempotencyKey,
      createdAt: now,
    })
    .onConflictDoNothing({ target: refunds.idempotencyKey });
  if (result.status === 'succeeded') {
    await deps.db
      .update(payments)
      .set({ status: amountCents >= charge.amountCents ? 'refunded' : 'partially_refunded', updatedAt: now })
      .where(eq(payments.id, charge.id));
  }
}

/** Cancels in one transaction (state, strike, events), then refunds outside it. */
async function cancelWith(
  deps: SheetDeps,
  row: Loaded,
  actorId: string,
  outcome: ReturnType<typeof outcomeOf>,
  details: { by: string; choice?: string; note?: string; expected: string[] },
  now: Date,
): Promise<ActionResult> {
  const { booking } = row;
  const done = await deps.db.transaction(async (tx) => {
    const updated = await tx
      .update(bookings)
      .set({
        status: 'canceled',
        cancelReason: outcome.reason,
        canceledAt: now,
        canceledBy: details.by,
        cancelChoice: details.choice ?? null,
        cancelNote: details.note ?? null,
        posterResponseDueAt: null,
        updatedAt: now,
      })
      .where(and(eq(bookings.id, booking.id), inArray(bookings.status, details.expected)))
      .returning({ id: bookings.id });
    if (updated.length === 0) return false;
    // A client cancellation or no-show leaves the task closed; the client can reopen it (find a replacement).
    await tx.update(tasks).set({ status: 'canceled', updatedAt: now }).where(eq(tasks.id, booking.taskId));
    if (outcome.strike) {
      await tx.insert(helperStrikes).values({ id: newId('stk'), helperUserId: booking.helperUserId, bookingId: booking.id, reason: outcome.strike, createdAt: now });
    }
    await tx.insert(outboxEvents).values({
      id: newId('evt'),
      type: 'booking.canceled',
      aggregateType: 'booking',
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        reason: outcome.reason,
        refundCents: outcome.refund,
        helperCompensationCents: outcome.compensation,
        posterUserId: booking.posterUserId,
        helperUserId: booking.helperUserId,
      },
    });
    await tx.insert(auditLog).values({ id: newId('aud'), actorId, actorRole: 'user', action: 'booking.canceled', targetType: 'booking', targetId: booking.id, reason: outcome.reason });
    await postEvent(tx, bookingThreadLink(booking), 'status', { type: 'canceled' }, now);
    return true;
  });
  if (!done) return { ok: false, code: 'not_allowed' };
  await refundCharge(deps, booking, outcome.refund, now);
  return { ok: true, code: 'canceled' };
}

export async function cancelBookingBy(deps: SheetDeps, userId: string, bookingId: string, input: CancelBookingInput, now: Date): Promise<ActionResult> {
  const limited = await consumeRateLimit(deps.db, `booking-sheet:${userId}`, SHEET_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const row = await load(deps.db, String(bookingId));
  const role = row ? roleOf(row.booking, userId) : null;
  if (!row || !role) return { ok: false, code: 'not_found' };
  if (row.booking.status !== 'confirmed') return { ok: false, code: 'not_allowed' };
  const parsed = cancelBookingInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const choices: readonly string[] = role === 'poster' ? POSTER_CANCEL_REASONS : HELPER_CANCEL_REASONS;
  if (!choices.includes(parsed.data.reason)) return { ok: false, code: 'validation_failed', fieldErrors: { reason: ['invalid'] } };
  return cancelWith(deps, row, userId, outcomeOf(row, role, now), { by: role, choice: parsed.data.reason, note: parsed.data.note, expected: ['confirmed'] }, now);
}

export async function reportRunningLate(db: Db, userId: string, bookingId: string, minutes: LateByMinutes, now: Date): Promise<ActionResult> {
  if (!(LATE_BY_MINUTES as readonly number[]).includes(minutes)) return { ok: false, code: 'validation_failed', fieldErrors: { minutes: ['invalid'] } };
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, String(bookingId))).limit(1);
  if (!booking || booking.helperUserId !== userId) return { ok: false, code: 'not_found' };
  if (!['confirmed', 'in_progress'].includes(booking.status) || booking.arrivedAt) return { ok: false, code: 'not_allowed' };
  await db.transaction(async (tx) => {
    await tx.update(bookings).set({ lateByMinutes: minutes, updatedAt: now }).where(eq(bookings.id, booking.id));
    await postEvent(tx, bookingThreadLink(booking), 'status', { type: 'running_late', params: { minutes } }, now);
  });
  return { ok: true, code: 'updated' };
}

/** The client reports that the helper didn't come: full refund, a strike. */
export async function reportNoShow(deps: SheetDeps, userId: string, bookingId: string, input: BookingNoteInput, now: Date): Promise<ActionResult> {
  const row = await load(deps.db, String(bookingId));
  if (!row || row.booking.posterUserId !== userId) return { ok: false, code: 'not_found' };
  const parsed = bookingNoteInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const reportableAt = row.booking.startAt.getTime() + row.policy.timers.noShowMinutes * 60_000;
  if (row.booking.status !== 'confirmed' || row.booking.arrivedAt || now.getTime() < reportableAt) return { ok: false, code: 'not_allowed' };
  return cancelWith(deps, row, userId, outcomeOf(row, 'no_show', now), { by: 'poster', note: parsed.data.note, expected: ['confirmed'] }, now);
}

/** The helper can't get in: the client has 30 minutes to answer with "I'm here". */
export async function reportCantAccess(db: Db, userId: string, bookingId: string, input: BookingNoteInput, now: Date): Promise<ActionResult> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, String(bookingId))).limit(1);
  if (!booking || booking.helperUserId !== userId) return { ok: false, code: 'not_found' };
  const parsed = bookingNoteInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (booking.status !== 'in_progress' || booking.cantAccessAt) return { ok: false, code: 'not_allowed' };
  await db.transaction(async (tx) => {
    await tx
      .update(bookings)
      .set({ cantAccessAt: now, posterResponseDueAt: new Date(now.getTime() + CANT_ACCESS_ANSWER_MS), updatedAt: now })
      .where(eq(bookings.id, booking.id));
    await postEvent(tx, bookingThreadLink(booking), 'status', { type: 'cant_access' }, now);
  });
  return { ok: true, code: 'updated' };
}

/** Can't-access reports the client didn't answer: canceled as a client no-show (late terms). */
export async function expireCantAccess(deps: SheetDeps, now: Date, scope: { bookingId?: string } = {}): Promise<void> {
  const conditions = [eq(bookings.status, 'in_progress'), lte(bookings.posterResponseDueAt, now)];
  if (scope.bookingId) conditions.push(eq(bookings.id, scope.bookingId));
  const due = await deps.db.select({ id: bookings.id }).from(bookings).where(and(...conditions));
  for (const { id } of due) {
    const row = await load(deps.db, id);
    if (row) await cancelWith(deps, row, 'system', outcomeOf(row, 'poster_unavailable', now), { by: 'system', expected: ['in_progress'] }, now);
  }
}

/** A safety report: an urgent support case; the sheet always shows 911 first. */
export async function submitSafetyReport(db: Db, userId: string, bookingId: string, input: SafetyReportInput, now: Date): Promise<ActionResult> {
  const limited = await consumeRateLimit(db, `safety:${userId}`, SHEET_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, String(bookingId))).limit(1);
  if (!booking || !roleOf(booking, userId)) return { ok: false, code: 'not_found' };
  const parsed = safetyReportInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const caseId = newId('case');
  await db.insert(supportCases).values({
    id: caseId,
    type: 'safety',
    status: 'open',
    priority: 'urgent',
    bookingId: booking.id,
    openedByUserId: userId,
    reason: parsed.data.kind,
    description: parsed.data.description,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(outboxEvents).values({
    id: newId('evt'),
    type: 'support.safety_report',
    aggregateType: 'support_case',
    aggregateId: caseId,
    payload: { caseId, bookingId: booking.id, reportedBy: userId, kind: parsed.data.kind },
  });
  return { ok: true, code: 'submitted' };
}
