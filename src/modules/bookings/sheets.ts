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
import { bookingNoteInputSchema, cancelBookingInputSchema, HELPER_CANCEL_REASONS, LATE_BY_MINUTES, POSTER_CANCEL_REASONS, safetyReportInputSchema, staffCancelInputSchema, type StaffCancelInput, type StaffRole } from '@/contracts';
import { refundLimitOf } from '@/modules/support/staff-domain';
import { createPaymentProvider, type PaymentProvider } from '@/integrations/payments';
import { recordCompensation } from '@/modules/earnings/service';
import { marketPolicies } from '@/modules/markets/schema';
import { openRefundCase } from '@/modules/oncall/reactions';
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
import { reopenAfterHelperCancel } from './after-cancel';
import { CANT_ACCESS_AFTER_ARRIVAL_MS, CANT_ACCESS_ANSWER_MS } from './domain';
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

let defaultProvider: PaymentProvider | null | undefined;
/** The app's payment provider (development stand-in), for work done while reading a booking. */
function appPayments(): PaymentProvider | null {
  if (defaultProvider === undefined) defaultProvider = createPaymentProvider();
  return defaultProvider;
}
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
  // Paid later and not paid yet: free for both, nothing to refund, no strike.
  if (row.booking.status === 'scheduled') return { reason: (by === 'helper' ? 'helper' : 'poster_early') as CancelReason, late: false, refund: 0, compensation: 0, strike: null };
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
    ...(row.booking.status === 'scheduled' ? { nothingCharged: true } : {}),
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

/**
 * Cancels in one transaction (state, strike, events, and a staff cancellation's audit row), then refunds outside
 * it: `refund` replaces the usual partial refund of the booking's charge (a staff cancellation refunds every
 * charge's remainder).
 */
async function cancelWith(
  deps: SheetDeps,
  row: Loaded,
  actorId: string,
  outcome: ReturnType<typeof outcomeOf>,
  details: { by: string; choice?: string; note?: string; expected: string[]; staff?: { role: string; refundCents: number } },
  now: Date,
  refund: () => Promise<void> = () => refundCharge(deps, row.booking, outcome.refund, now),
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
    await tx.insert(auditLog).values({ id: newId('aud'), actorId, actorRole: details.staff?.role ?? 'user', action: 'booking.canceled', targetType: 'booking', targetId: booking.id, reason: outcome.reason });
    // Written with the cancellation, so a refund that fails afterwards never leaves it without a trace.
    if (details.staff) {
      await tx.insert(auditLog).values({ id: newId('aud'), at: now.toISOString(), actorId, actorRole: details.staff.role, action: 'booking.canceled_by_staff', targetType: 'booking', targetId: booking.id, reason: details.note ?? null, metadata: { refundCents: details.staff.refundCents } });
    }
    await postEvent(tx, bookingThreadLink(booking), 'status', { type: 'canceled' }, now);
    return true;
  });
  if (!done) return { ok: false, code: 'not_allowed' };
  await refund();
  if (outcome.compensation > 0) await recordCompensation(deps.db, booking, outcome.compensation, now);
  // The helper canceled: the task opens for offers again on its own when there's time (replacement matching).
  if (outcome.reason === 'helper') await reopenAfterHelperCancel(deps.db, booking, now);
  return { ok: true, code: 'canceled' };
}

export async function cancelBookingBy(deps: SheetDeps, userId: string, bookingId: string, input: CancelBookingInput, now: Date): Promise<ActionResult> {
  const limited = await consumeRateLimit(deps.db, `booking-sheet:${userId}`, SHEET_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const row = await load(deps.db, String(bookingId));
  const role = row ? roleOf(row.booking, userId) : null;
  if (!row || !role) return { ok: false, code: 'not_found' };
  // A one-time booking paid later cancels free; a regular visit not paid yet is skipped instead.
  const scheduled = row.booking.status === 'scheduled' && !row.booking.seriesId;
  if (row.booking.status !== 'confirmed' && !scheduled) return { ok: false, code: 'not_allowed' };
  const parsed = cancelBookingInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const choices: readonly string[] = role === 'poster' ? POSTER_CANCEL_REASONS : HELPER_CANCEL_REASONS;
  if (!choices.includes(parsed.data.reason)) return { ok: false, code: 'validation_failed', fieldErrors: { reason: ['invalid'] } };
  return cancelWith(deps, row, userId, outcomeOf(row, role, now), { by: role, choice: parsed.data.reason, note: parsed.data.note, expected: [row.booking.status] }, now);
}

/**
 * Support cancels a booking (completion plan 5.14; blueprint 08: cancellations with policy override): the client
 * gets the whole charge back, the helper no compensation and no strike, and both are told it was support. For a
 * suspended helper's upcoming bookings, or anything our team decides can't go ahead. Leads, trust and safety and
 * admins may; a support agent only when the refund is within their refund limit. Audited with the note.
 */
export async function cancelBookingByStaff(deps: SheetDeps, staff: { id: string; roles: readonly StaffRole[] }, bookingId: string, input: StaffCancelInput, now: Date): Promise<ActionResult> {
  const parsed = staffCancelInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const row = await load(deps.db, String(bookingId));
  if (!row) return { ok: false, code: 'not_found' };
  // Never on a booking of their own: that would be a full refund, no late fee and no strike for themselves.
  if (staff.id === row.booking.posterUserId || staff.id === row.booking.helperUserId) return { ok: false, code: 'not_allowed' };
  const charges = await refundableCharges(deps.db, row.booking.id);
  const refund = charges.reduce((total, charge) => total + charge.remainingCents, 0);
  if (!staffMayCancel(staff.roles, refund)) return { ok: false, code: 'not_allowed' };
  if (!STAFF_CANCELABLE.includes(row.booking.status)) return { ok: false, code: 'not_allowed' };
  const role = staff.roles.find((candidate) => STAFF_CANCEL_LEADS.includes(candidate)) ?? staff.roles[0] ?? 'staff';
  return cancelWith(
    deps,
    row,
    staff.id,
    { reason: 'admin', late: false, refund, compensation: 0, strike: null },
    { by: 'staff', note: parsed.data.note, expected: [row.booking.status], staff: { role, refundCents: refund } },
    now,
    () => refundRemainders(deps, row.booking, charges, now),
  );
}

/** A charge on the booking and how much of it can still be refunded. */
export interface RefundableCharge {
  id: string;
  providerRef: string | null;
  amountCents: number;
  remainingCents: number;
}

/**
 * The booking's charges with money left on them (completion plan 5.18): the booking itself and any paid changes,
 * minus what was refunded already (goodwill, a change that lowered the price) or is being refunded.
 */
export async function refundableCharges(db: Db, bookingId: string): Promise<RefundableCharge[]> {
  const charges = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), inArray(payments.purpose, ['booking_funding', 'change_funding']), inArray(payments.status, ['succeeded', 'partially_refunded'])));
  if (charges.length === 0) return [];
  const taken = await db
    .select({ paymentId: refunds.paymentId, amountCents: refunds.amountCents })
    .from(refunds)
    .where(and(inArray(refunds.paymentId, charges.map((charge) => charge.id)), inArray(refunds.status, ['succeeded', 'pending'])));
  return charges
    .map((charge) => ({
      id: charge.id,
      providerRef: charge.providerRef,
      amountCents: charge.amountCents,
      remainingCents: charge.amountCents - taken.filter((row) => row.paymentId === charge.id).reduce((total, row) => total + row.amountCents, 0),
    }))
    .filter((charge) => charge.remainingCents > 0);
}

/**
 * Refunds what's left of each charge. The refund row is written (pending) before the provider is called, so a
 * call that throws leaves a failed refund and a case in finance's queue (opened once per payment) instead of
 * nothing.
 */
async function refundRemainders(deps: SheetDeps, booking: BookingRow, charges: RefundableCharge[], now: Date): Promise<void> {
  for (const charge of charges) {
    const idempotencyKey = `refund:${booking.id}:staff_cancel:${charge.id}`;
    const [pending] = await deps.db
      .insert(refunds)
      .values({ id: newId('ref'), paymentId: charge.id, bookingId: booking.id, amountCents: charge.remainingCents, reason: 'cancellation', status: 'pending', providerRef: null, idempotencyKey, createdAt: now })
      .onConflictDoNothing({ target: refunds.idempotencyKey })
      .returning({ id: refunds.id });
    if (!pending) continue;
    try {
      if (!charge.providerRef) throw new Error(`payment ${charge.id} has no provider reference`);
      const result = await deps.payments.refund({ chargeRef: charge.providerRef, amountCents: charge.remainingCents, idempotencyKey });
      await deps.db.update(refunds).set({ status: result.status, providerRef: result.refundRef }).where(eq(refunds.id, pending.id));
      if (result.status === 'succeeded') await deps.db.update(payments).set({ status: 'refunded', updatedAt: now }).where(eq(payments.id, charge.id));
      if (result.status === 'failed') await openRefundCase(deps.db, charge.id, 'staff_cancel_refund_failed', now);
    } catch (error) {
      console.error(`[bookings] refunding ${charge.id} after a staff cancellation failed`, error);
      await deps.db.update(refunds).set({ status: 'failed' }).where(eq(refunds.id, pending.id));
      await openRefundCase(deps.db, charge.id, 'staff_cancel_refund_failed', now);
    }
  }
}

const STAFF_CANCELABLE = ['confirmed', 'scheduled', 'in_progress'];
const STAFF_CANCEL_LEADS: readonly StaffRole[] = ['support_lead', 'trust_safety', 'admin'];

/** What a staff cancellation refunds: what's left of every charge on the booking. */
export async function staffCancelRefund(db: Db, bookingId: string): Promise<number> {
  return (await refundableCharges(db, bookingId)).reduce((total, charge) => total + charge.remainingCents, 0);
}

export function staffMayCancel(roles: readonly StaffRole[], refundCents: number): boolean {
  return roles.some((role) => STAFF_CANCEL_LEADS.includes(role)) || (roles.length > 0 && refundCents <= refundLimitOf(roles));
}

/** The staff booking page's cancel control, when the booking can still be canceled (never on their own booking). */
export async function staffCancelView(db: Db, roles: readonly StaffRole[], booking: { id: string; status: string }, staffId?: string): Promise<{ refundCents: number; allowed: boolean } | undefined> {
  if (!STAFF_CANCELABLE.includes(booking.status)) return undefined;
  const refundCents = await staffCancelRefund(db, booking.id);
  let party = false;
  if (staffId) {
    const [people] = await db.select({ poster: bookings.posterUserId, helper: bookings.helperUserId }).from(bookings).where(eq(bookings.id, booking.id)).limit(1);
    party = people?.poster === staffId || people?.helper === staffId;
  }
  return { refundCents, allowed: !party && staffMayCancel(roles, refundCents) };
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
  // Like the booking page (domain.ts sheetActions): a late update moves the no-show time by its minutes.
  const reportableAt = row.booking.startAt.getTime() + (row.policy.timers.noShowMinutes + (row.booking.lateByMinutes ?? 0)) * 60_000;
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
  // The helper waits 20 minutes after arriving first (blueprint 03; the booking page opens the action then).
  if (!booking.arrivedAt || now.getTime() < booking.arrivedAt.getTime() + CANT_ACCESS_AFTER_ARRIVAL_MS) return { ok: false, code: 'not_allowed' };
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
export async function expireCantAccess(db: Db, now: Date, scope: { bookingId?: string } = {}, payments_ = appPayments()): Promise<void> {
  const conditions = [eq(bookings.status, 'in_progress'), lte(bookings.posterResponseDueAt, now)];
  if (scope.bookingId) conditions.push(eq(bookings.id, scope.bookingId));
  const due = await db.select({ id: bookings.id }).from(bookings).where(and(...conditions));
  if (due.length === 0 || !payments_) return;
  const deps: SheetDeps = { db, payments: payments_ };
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
