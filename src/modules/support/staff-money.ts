import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type {
  ActionResult,
  AdminBookingPageData,
  BookingStatus,
  CaseResolution,
  CaseResolutionInput,
  EarningsStatus,
  PriceBreakdown,
  RestrictedAccessInput,
  RevealAddressResult,
  RevealConversationResult,
  RefundDecisionInput,
  StaffRefundInput,
} from '@/contracts';
import { caseResolutionInputSchema, refundDecisionInputSchema, restrictedAccessInputSchema, staffRefundInputSchema } from '@/contracts';
import type { PaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { checklistView } from '@/modules/bookings/checklist';
import { bookingCompletions, bookingTerms, bookings } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { recordCompletionMoney } from '@/modules/earnings/service';
import { threads } from '@/modules/messaging/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { payments, refunds } from '@/modules/payments/schema';
import { findTaskWithPublicView } from '@/modules/tasks/queries';
import { taskLocations, tasks } from '@/modules/tasks/schema';
import { readExactAddress } from '@/modules/tasks/locations';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { refundRequests, supportCases } from './schema';
import { bookingMoneyFacts, caseRowsFor, conversationView, personSummaryOf, previewResolution, resolveCase, type StaffActor } from './staff';
import { MONEY_RESOLUTIONS, canApproveRefund, canWorkCases, refundLimitOf, type ResolutionMoney } from './staff-domain';

/**
 * Money for staff (UI-019; blueprint 04 §6, 08 staff limits): the money effects of case resolutions, the
 * refund tool on the staff booking page, and the booking page itself with its restricted data (the exact
 * address and the conversation) behind a reason that goes to the audit log.
 */

const REFUND_RULE = { limit: 20, windowSeconds: 60 * 60 };

async function audit(db: Db, staff: StaffActor, action: string, targetType: string, targetId: string, now: Date, extra: { reason?: string; metadata?: Record<string, unknown> } = {}) {
  await db.insert(auditLog).values({
    id: newId('aud'),
    at: now.toISOString(),
    actorId: staff.id,
    actorRole: staff.roles[0] ?? 'staff',
    action,
    targetType,
    targetId,
    ...(extra.reason ? { reason: extra.reason } : {}),
    metadata: extra.metadata ?? {},
  });
}

/** Refunds part of a booking's charge through the provider (idempotent by key); false when it failed. */
async function refundCharge(
  db: Db,
  payments_: PaymentProvider,
  input: { bookingId: string; amountCents: number; reason: string; idempotencyKey: string; now: Date },
): Promise<boolean> {
  const [existing] = await db.select({ status: refunds.status }).from(refunds).where(eq(refunds.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existing) return existing.status !== 'failed';
  const [charge] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, input.bookingId), eq(payments.purpose, 'booking_funding'), inArray(payments.status, ['succeeded', 'partially_refunded'])))
    .limit(1);
  if (!charge?.providerRef) return false;
  const result = await payments_.refund({ chargeRef: charge.providerRef, amountCents: input.amountCents, idempotencyKey: input.idempotencyKey });
  await db.insert(refunds).values({
    id: newId('ref'),
    paymentId: charge.id,
    bookingId: input.bookingId,
    amountCents: input.amountCents,
    reason: input.reason,
    status: result.status,
    providerRef: result.refundRef,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.now,
  });
  if (result.status !== 'succeeded') return false;
  const succeeded = await db.select({ amountCents: refunds.amountCents }).from(refunds).where(and(eq(refunds.paymentId, charge.id), eq(refunds.status, 'succeeded')));
  const refunded = succeeded.reduce((sum, row) => sum + row.amountCents, 0);
  await db
    .update(payments)
    .set({ status: refunded >= charge.amountCents ? 'refunded' : 'partially_refunded', updatedAt: input.now })
    .where(eq(payments.id, charge.id));
  return true;
}

/**
 * The money effects of a resolution on its booking (idempotent: guarded transitions and refund keys, so a retry
 * after a stale page never pays twice):
 * - release in full: the booking completes as submitted and the helper is paid;
 * - settle: the final numbers move to the settled price, the booking completes, the helper is paid on that
 *   price and the client gets the difference back (a `dispute_settlement` refund);
 * - refund in full: everything left goes back and the booking ends (`refunded_in_dispute`);
 * - goodwill: a refund from platform funds; the helper's earnings stay as they are.
 */
export async function applyResolutionMoney(
  db: Db,
  payments_: PaymentProvider,
  input: { caseId: string; bookingId: string; resolution: CaseResolution; moved: ResolutionMoney; settlePriceCents?: number; now: Date },
): Promise<boolean> {
  const { bookingId, resolution, moved, now } = input;
  const key = `refund:${bookingId}:case:${input.caseId}`;
  switch (resolution) {
    case 'release_full': {
      const done = await db
        .update(bookings)
        .set({ status: 'completed', completedVia: 'support', completedAt: now, approvalDueAt: null, updatedAt: now })
        .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ['disputed', 'completion_submitted'])))
        .returning({ id: bookings.id });
      if (done.length > 0) await recordCompletionMoney(db, bookingId, now, payments_);
      return true;
    }
    case 'settle': {
      const [row] = await db
        .select({ booking: bookings, terms: bookingTerms, completion: bookingCompletions, marketId: tasks.marketId })
        .from(bookings)
        .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
        .innerJoin(tasks, eq(tasks.id, bookings.taskId))
        .leftJoin(bookingCompletions, eq(bookingCompletions.bookingId, bookings.id))
        .where(eq(bookings.id, bookingId))
        .limit(1);
      if (!row?.completion) return row?.booking.status === 'completed';
      if (row.booking.status === 'disputed' || row.booking.status === 'completion_submitted') {
        const money = await bookingMoneyFacts(db, bookingId);
        if (!money) return false;
        const base: PriceBreakdown = row.completion.finalBreakdown;
        const settled = quoteBreakdown(money.fees, { type: 'fixed', priceCents: input.settlePriceCents ?? base.taskPriceCents });
        const finalBreakdown: PriceBreakdown = {
          ...base,
          taskPriceCents: settled.taskPriceCents,
          posterFeeCents: settled.posterFeeCents,
          helperFeeCents: settled.helperFeeCents,
          helperEarningsCents: settled.helperEarningsCents,
          platformRevenueCents: settled.platformRevenueCents,
          posterTotalCents: base.posterTotalCents - moved.posterRefundCents,
          posterRefundCents: (base.posterRefundCents ?? 0) + moved.posterRefundCents,
        };
        await db.update(bookingCompletions).set({ finalBreakdown }).where(eq(bookingCompletions.bookingId, bookingId));
        await db
          .update(bookings)
          .set({ status: 'completed', completedVia: 'settlement', completedAt: now, approvalDueAt: null, updatedAt: now })
          .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ['disputed', 'completion_submitted'])));
        await recordCompletionMoney(db, bookingId, now, payments_);
      }
      return true;
    }
    case 'refund_full': {
      const ok = moved.posterRefundCents === 0 || (await refundCharge(db, payments_, { bookingId, amountCents: moved.posterRefundCents, reason: 'dispute_settlement', idempotencyKey: key, now }));
      if (!ok) return false;
      await db
        .update(bookings)
        .set({ status: 'canceled', cancelReason: 'refunded_in_dispute', canceledBy: 'support', canceledAt: now, updatedAt: now })
        .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ['confirmed', 'in_progress', 'completion_submitted', 'disputed'])));
      return true;
    }
    case 'goodwill_refund':
      return refundCharge(db, payments_, { bookingId, amountCents: moved.posterRefundCents, reason: 'goodwill', idempotencyKey: key, now });
    default:
      return true;
  }
}

/**
 * Resolves a case; money resolutions move the money first (within the viewer's refund limit), then the case
 * resolves. A stale page gets `version_conflict` after the money moved: resolving again doesn't pay twice.
 */
export async function resolveCaseWithMoney(
  db: Db,
  payments_: PaymentProvider | null,
  staff: StaffActor,
  caseId: string,
  version: number,
  input: CaseResolutionInput,
  now: Date,
): Promise<ActionResult> {
  const parsed = caseResolutionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (!MONEY_RESOLUTIONS.includes(parsed.data.resolution)) return resolveCase(db, staff, caseId, version, parsed.data, now);
  if (!payments_) return { ok: false, code: 'not_allowed' };
  const preview = await previewResolution(db, staff, caseId, parsed.data);
  if (!preview.ok) return preview;
  if (!preview.preview.withinLimit) return { ok: false, code: 'not_allowed' };
  const [row] = await db.select({ bookingId: supportCases.bookingId }).from(supportCases).where(eq(supportCases.id, String(caseId))).limit(1);
  if (!row?.bookingId) return { ok: false, code: 'not_allowed' };
  const { posterRefundCents, helperReceivesCents, platformKeepsCents } = preview.preview;
  const applied = await applyResolutionMoney(db, payments_, {
    caseId: String(caseId),
    bookingId: row.bookingId,
    resolution: parsed.data.resolution,
    moved: { posterRefundCents, helperReceivesCents, platformKeepsCents },
    ...(parsed.data.settlePriceCents !== undefined ? { settlePriceCents: parsed.data.settlePriceCents } : {}),
    now,
  });
  if (!applied) return { ok: false, code: 'unknown' };
  return resolveCase(db, staff, caseId, version, parsed.data, now, { moneyApplied: true });
}

// ---- The staff booking page ---------------------------------------------------------------------------

/** `/admin/bookings/[bookingId]` for staff. */
export async function getAdminBooking(db: Db, staff: StaffActor, bookingId: string, now: Date): Promise<AdminBookingPageData | null> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, String(bookingId))).limit(1);
  if (!booking) return null;
  const [found, [terms], [completion], people, refundRows, earningRows, caseRows, money, requestRows] = await Promise.all([
    findTaskWithPublicView(db, booking.taskId),
    db.select().from(bookingTerms).where(and(eq(bookingTerms.bookingId, booking.id), eq(bookingTerms.version, booking.termsVersion))).limit(1),
    db.select().from(bookingCompletions).where(eq(bookingCompletions.bookingId, booking.id)).limit(1),
    db.select().from(users).where(inArray(users.id, [booking.posterUserId, booking.helperUserId])),
    db.select().from(refunds).where(eq(refunds.bookingId, booking.id)).orderBy(asc(refunds.createdAt)),
    db.select().from(earnings).where(eq(earnings.bookingId, booking.id)).orderBy(asc(earnings.createdAt)),
    db.select().from(supportCases).where(eq(supportCases.bookingId, booking.id)).orderBy(desc(supportCases.updatedAt)),
    bookingMoneyFacts(db, booking.id),
    db.select().from(refundRequests).where(eq(refundRequests.bookingId, booking.id)).orderBy(desc(refundRequests.createdAt)),
  ]);
  const poster = people.find((user) => user.id === booking.posterUserId);
  const helper = people.find((user) => user.id === booking.helperUserId);
  if (!found || !terms || !poster || !helper) return null;
  const checklist = completion ? checklistView(found.view.categorySlug, completion.checklist) : undefined;
  const limit = refundLimitOf(staff.roles);
  const left = money ? money.chargedCents - money.refundedCents : 0;
  const canRefund = canWorkCases(staff.roles) && limit > 0 && left > 0;
  const actions: AdminBookingPageData['actions'] = [];
  if (canRefund) actions.push('refund');
  if (canWorkCases(staff.roles)) actions.push('reveal_address', 'reveal_conversation');
  return {
    booking: {
      id: booking.id,
      title: found.view.title,
      status: booking.status as BookingStatus,
      start: booking.startAt.toISOString(),
      areaName: found.view.location.kind === 'local' ? found.view.location.areaName : 'Remote',
      pricingType: terms.pricingType as 'fixed' | 'hourly',
      taskId: booking.taskId,
    },
    poster: personSummaryOf(poster),
    helper: personSummaryOf(helper),
    money: {
      breakdown: terms.breakdown,
      ...(completion && booking.status === 'completed' ? { finalBreakdown: completion.finalBreakdown } : {}),
      chargedCents: money?.chargedCents ?? 0,
      refundedCents: money?.refundedCents ?? 0,
      refunds: refundRows.map((row) => ({ id: row.id, amountCents: row.amountCents, reason: row.reason, status: row.status as 'pending' | 'succeeded' | 'failed', createdAt: row.createdAt.toISOString() })),
      earnings: earningRows.map((row) => ({
        kind: row.kind as AdminBookingPageData['money']['earnings'][number]['kind'],
        amountCents: row.amountCents,
        status: row.status as EarningsStatus,
        ...(row.transferredAt ? { transferredAt: row.transferredAt.toISOString() } : {}),
      })),
    },
    ...(checklist ? { checklist } : {}),
    cases: await caseRowsFor(db, caseRows, now),
    ...(canRefund ? { refund: { maxCents: Math.min(left, limit), limitCents: limit, leftCents: left } } : {}),
    refundRequests: await refundRequestRows(db, staff, requestRows),
    actions,
  };
}

async function refundRequestRows(db: Db, staff: StaffActor, rows: (typeof refundRequests.$inferSelect)[]): Promise<AdminBookingPageData['refundRequests']> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.flatMap((row) => [row.requestedByUserId, ...(row.decidedByUserId ? [row.decidedByUserId] : [])]))];
  const names = new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))).map((row) => [row.id, row.name]));
  return rows.map((row) => ({
    id: row.id,
    amountCents: row.amountCents,
    reason: row.reason as AdminBookingPageData['refundRequests'][number]['reason'],
    note: row.note,
    requestedBy: names.get(row.requestedByUserId) ?? 'Staff',
    requestedAt: row.createdAt.toISOString(),
    status: row.status as 'pending' | 'approved' | 'declined',
    ...(row.decidedByUserId ? { decidedBy: names.get(row.decidedByUserId) ?? 'Staff' } : {}),
    ...(row.decidedAt ? { decidedAt: row.decidedAt.toISOString() } : {}),
    canDecide: row.status === 'pending' && row.requestedByUserId !== staff.id && canApproveRefund(staff.roles, row.amountCents),
  }));
}

/** A staff refund from the booking page: goodwill (platform funds) or fraud, within the viewer's limit. */
export async function staffRefund(db: Db, payments_: PaymentProvider | null, staff: StaffActor, bookingId: string, input: StaffRefundInput, now: Date): Promise<ActionResult> {
  const parsed = staffRefundInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (!payments_ || !canWorkCases(staff.roles)) return { ok: false, code: 'not_allowed' };
  const money = await bookingMoneyFacts(db, String(bookingId));
  if (!money) return { ok: false, code: 'not_allowed' };
  const left = money.chargedCents - money.refundedCents;
  if (parsed.data.amountCents > left) return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimit(db, `staff-refund:${staff.id}`, REFUND_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  // Above the viewer's own limit: someone allowed approves it (blueprint 08).
  if (parsed.data.amountCents > refundLimitOf(staff.roles)) {
    const id = newId('rrq');
    await db.insert(refundRequests).values({ id, bookingId: String(bookingId), amountCents: parsed.data.amountCents, reason: parsed.data.reason, note: parsed.data.note, requestedByUserId: staff.id, status: 'pending', createdAt: now });
    await audit(db, staff, 'booking.refund_requested', 'booking', String(bookingId), now, { metadata: { requestId: id, amountCents: parsed.data.amountCents, reason: parsed.data.reason, note: parsed.data.note } });
    return { ok: true, code: 'sent' };
  }
  const ok = await refundCharge(db, payments_, {
    bookingId: String(bookingId),
    amountCents: parsed.data.amountCents,
    reason: parsed.data.reason,
    idempotencyKey: `refund:${bookingId}:staff:${newId('req')}`,
    now,
  });
  await audit(db, staff, 'booking.refund', 'booking', String(bookingId), now, { metadata: { amountCents: parsed.data.amountCents, reason: parsed.data.reason, note: parsed.data.note, ok } });
  return ok ? { ok: true, code: 'submitted' } : { ok: false, code: 'unknown' };
}

/** The exact address, after a reason that goes to the audit log. */
export async function revealBookingAddress(db: Db, cipher: FieldCipher, staff: StaffActor, bookingId: string, input: RestrictedAccessInput, now: Date): Promise<RevealAddressResult> {
  const parsed = restrictedAccessInputSchema.safeParse(input);
  // validationFailed always returns the failure shape.
  if (!parsed.success) return validationFailed(parsed.error) as Extract<ActionResult, { ok: false }>;
  if (!canWorkCases(staff.roles)) return { ok: false, code: 'not_allowed' };
  const [row] = await db
    .select({ addressEnc: taskLocations.addressEnc })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(taskLocations, eq(taskLocations.id, tasks.locationId))
    .where(eq(bookings.id, String(bookingId)))
    .limit(1);
  if (!row) return { ok: false, code: 'not_allowed' };
  const address = readExactAddress(cipher, row.addressEnc);
  // Deleted by the retention timer: there's nothing left to show.
  if (!address) return { ok: false, code: 'not_found' };
  await audit(db, staff, 'booking.view_address', 'booking', String(bookingId), now, { reason: parsed.data.reason });
  return { ok: true, address };
}

/** The booking's conversation as written, after a reason that goes to the audit log. */
export async function revealBookingConversation(db: Db, staff: StaffActor, bookingId: string, input: RestrictedAccessInput, now: Date): Promise<RevealConversationResult> {
  const parsed = restrictedAccessInputSchema.safeParse(input);
  // validationFailed always returns the failure shape.
  if (!parsed.success) return validationFailed(parsed.error) as Extract<ActionResult, { ok: false }>;
  if (!canWorkCases(staff.roles)) return { ok: false, code: 'not_allowed' };
  const [thread] = await db.select().from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, String(bookingId)))).limit(1);
  if (!thread) return { ok: false, code: 'not_allowed' };
  await audit(db, staff, 'booking.view_conversation', 'thread', thread.id, now, { reason: parsed.data.reason, metadata: { bookingId } });
  return { ok: true, conversation: await conversationView(db, thread) };
}

/**
 * Approve or decline a refund asked for above someone's limit. Approving refunds the charge (what's left
 * then), as the approver; both decisions go to the audit log with the note.
 */
export async function decideRefundRequest(db: Db, payments_: PaymentProvider | null, staff: StaffActor, bookingId: string, input: RefundDecisionInput, now: Date): Promise<ActionResult> {
  const parsed = refundDecisionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (!payments_) return { ok: false, code: 'not_allowed' };
  const [request] = await db.select().from(refundRequests).where(and(eq(refundRequests.id, parsed.data.requestId), eq(refundRequests.bookingId, String(bookingId)))).limit(1);
  if (!request || request.status !== 'pending' || request.requestedByUserId === staff.id || !canApproveRefund(staff.roles, request.amountCents)) return { ok: false, code: 'not_allowed' };
  const approve = parsed.data.decision === 'approve';
  if (approve) {
    const money = await bookingMoneyFacts(db, String(bookingId));
    if (!money || request.amountCents > money.chargedCents - money.refundedCents) return { ok: false, code: 'not_allowed' };
  }
  const [claimed] = await db
    .update(refundRequests)
    .set({ status: approve ? 'approved' : 'declined', decidedByUserId: staff.id, decisionNote: parsed.data.note, decidedAt: now })
    .where(and(eq(refundRequests.id, request.id), eq(refundRequests.status, 'pending')))
    .returning({ id: refundRequests.id });
  if (!claimed) return { ok: false, code: 'not_allowed' };
  let ok = true;
  if (approve) {
    ok = await refundCharge(db, payments_, { bookingId: String(bookingId), amountCents: request.amountCents, reason: request.reason, idempotencyKey: `refund:${bookingId}:approved:${request.id}`, now });
  }
  await audit(db, staff, approve ? 'booking.refund_approved' : 'booking.refund_declined', 'booking', String(bookingId), now, {
    reason: parsed.data.note,
    metadata: { requestId: request.id, amountCents: request.amountCents, requestedBy: request.requestedByUserId, ok },
  });
  return ok ? { ok: true, code: 'updated' } : { ok: false, code: 'unknown' };
}

