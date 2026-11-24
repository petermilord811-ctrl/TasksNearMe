import type { z } from 'zod';
import { and, asc, desc, eq, gte, inArray, isNotNull, notInArray, or, sql } from 'drizzle-orm';
import { auditRoleOf } from '@/modules/tasks/moderation';
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
  StaffRole,
} from '@/contracts';
import { caseResolutionInputSchema, refundDecisionInputSchema, restrictedAccessInputSchema, staffRefundInputSchema } from '@/contracts';
import type { PaymentProvider } from '@/integrations/payments';
import { staffRoles, users } from '@/modules/accounts/schema';
import { checklistView } from '@/modules/bookings/checklist';
import { bookingCompletions, bookingTerms, bookings } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { recordCompletionMoney } from '@/modules/earnings/service';
import { threads } from '@/modules/messaging/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { canDownloadEvidencePack, LIVE_DISPUTE_STATUSES } from '@/modules/payments/evidence-pack';
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
import { refundRequests, supportCaseEvents, supportCases } from './schema';
import { bookingMoneyFacts, caseRowsFor, conversationView, discretionaryRefundedCents, isBookingParty, personSummaryOf, previewResolution, resolveCase, type StaffActor } from './staff';
import { MONEY_RESOLUTIONS, canApproveRefund, canWorkCases, refundLimitOf, type ResolutionMoney } from './staff-domain';
import { refundAcross, refundableCharges, refundMade } from '@/modules/payments/refund-across';
import { DOUBLE_SUBMIT_MS, serialized, submissionKeys } from '@/modules/payments/double-submit';

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
    actorRole: auditRoleOf(staff.roles),
    action,
    targetType,
    targetId,
    ...(extra.reason ? { reason: extra.reason } : {}),
    metadata: extra.metadata ?? {},
  });
}

/**
 * Refunds part of a booking's money through the provider, idempotent by key; false when it failed. It's spread over the
 * booking's charges that still have money on them (its payment, a paid change), each up to what's left of it (money
 * review #2, lifecycle review #7): a refund larger than the first charge no longer fails at the provider.
 */
async function refundCharge(
  db: Db,
  payments_: PaymentProvider,
  input: { bookingId: string; amountCents: number; reason: string; idempotencyKey: string; now: Date },
): Promise<boolean> {
  // An earlier refund under this key: one charge (before the spread) or several.
  const [existing] = await db.select({ status: refunds.status }).from(refunds).where(eq(refunds.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existing) return existing.status !== 'failed';
  const earlier = await refundMade(db, input.idempotencyKey);
  if (earlier.made) return earlier.ok;
  const result = await refundAcross({ db, payments: payments_ }, input.bookingId, await refundableCharges(db, input.bookingId), input.amountCents, { reason: input.reason, key: input.idempotencyKey }, input.now);
  return result.ok;
}

/**
 * The money effects of a resolution on its booking (idempotent: guarded transitions and refund keys, so a retry
 * after a stale page never pays twice):
 * - release in full: the booking completes as submitted and the helper is paid;
 * - settle: the final numbers move to the settled price, the booking completes, the helper is paid on that
 *   price and the client gets the difference back (a `dispute_settlement` refund);
 * - refund in full: everything left goes back and the booking ends (`refunded_in_dispute`);
 * - goodwill: a refund from platform funds; the helper's earnings stay as they are.
 *
 * Settling and refunding in full claim the booking before any money moves (lifecycle review #13): a client's approval
 * landing at the same moment either wins (and the resolution fails) or finds the booking already ended. Before, both
 * went through: the helper was paid on the agreed price and the client refunded too.
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
        const settled = quoteBreakdown(money.fees, { type: 'fixed', priceCents: input.settlePriceCents ?? base.taskPriceCents }, { waiveHoldFee: money.waiveHoldFee === true });
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
        const claimed = await db.transaction(async (tx) => {
          const rows = await tx
            .update(bookings)
            .set({ status: 'completed', completedVia: 'settlement', completedAt: now, approvalDueAt: null, updatedAt: now })
            .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ['disputed', 'completion_submitted'])))
            .returning({ id: bookings.id });
          if (rows.length === 0) return false;
          await tx.update(bookingCompletions).set({ finalBreakdown }).where(eq(bookingCompletions.bookingId, bookingId));
          return true;
        });
        if (claimed) {
          await recordCompletionMoney(db, bookingId, now, payments_);
          return true;
        }
        const [after] = await db.select({ status: bookings.status, completedVia: bookings.completedVia }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
        if (after?.status !== 'completed' || after.completedVia !== 'settlement') return false;
      } else if (row.booking.status !== 'completed') {
        return true;
      } else if (row.booking.completedVia !== 'settlement') {
        // Approved by the client (or auto-approved) first: that completion stands, and this settlement doesn't apply.
        return false;
      }
      // Settled already (a retry after the money failed, or a stale page): finish the money, never twice.
      await recordCompletionMoney(db, bookingId, now, payments_);
      return true;
    }
    case 'refund_full': {
      const claimed = await db
        .update(bookings)
        .set({ status: 'canceled', cancelReason: 'refunded_in_dispute', canceledBy: 'support', canceledAt: now, updatedAt: now })
        .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ['confirmed', 'in_progress', 'completion_submitted', 'disputed'])))
        .returning({ id: bookings.id });
      if (claimed.length === 0) {
        // Ended this way already (a retry): finish the refund. Ended any other way (approved and paid): nothing moves.
        const [after] = await db.select({ status: bookings.status, cancelReason: bookings.cancelReason }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
        if (after?.status !== 'canceled' || after.cancelReason !== 'refunded_in_dispute') return false;
      }
      // A refund that fails now leaves a failed row and a case in finance's queue (refundAcross).
      return moved.posterRefundCents === 0 || (await refundCharge(db, payments_, { bookingId, amountCents: moved.posterRefundCents, reason: 'dispute_settlement', idempotencyKey: key, now }));
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
  const [row] = await db.select({ bookingId: supportCases.bookingId }).from(supportCases).where(eq(supportCases.id, String(caseId))).limit(1);
  if (!row?.bookingId) return { ok: false, code: 'not_allowed' };
  const bookingId = row.bookingId;
  // One money decision per booking at a time, with the limit read inside (security review): two cases resolved together,
  // or a case beside a staff refund, each saw the other's refund missing from the limit. A staff member who is on the
  // case or its booking never gets here: their case doesn't load (staff.ts loadCase).
  return serialized(db, `staff-refund:${bookingId}`, async (): Promise<ActionResult> => {
    const preview = await previewResolution(db, staff, caseId, parsed.data);
    if (!preview.ok) return preview;
    // Over the resolver's limit: a request a different finance or admin approves, carrying the resolution (blueprint 08).
    if (!preview.preview.withinLimit) return requestResolutionApproval(db, staff, String(caseId), bookingId, parsed.data, preview.preview.posterRefundCents, now);
    const { posterRefundCents, helperReceivesCents, platformKeepsCents } = preview.preview;
    const applied = await applyResolutionMoney(db, payments_, {
      caseId: String(caseId),
      bookingId,
      resolution: parsed.data.resolution,
      moved: { posterRefundCents, helperReceivesCents, platformKeepsCents },
      ...(parsed.data.settlePriceCents !== undefined ? { settlePriceCents: parsed.data.settlePriceCents } : {}),
      now,
    });
    if (!applied) return { ok: false, code: 'unknown' };
    return resolveCase(db, staff, caseId, version, parsed.data, now, { moneyApplied: true });
  });
}

/**
 * A money resolution above the resolver's limit (blueprint 08's dual approval): a refund request for the client's refund,
 * carrying the whole resolution, which a different finance or admin approves on the booking (decideCaseResolution). The
 * case stays open meanwhile, with an internal note. One request per case waits at a time.
 */
async function requestResolutionApproval(db: Db, staff: StaffActor, caseId: string, bookingId: string, input: CaseResolutionInput, amountCents: number, now: Date): Promise<ActionResult> {
  const [waiting] = await db.select({ id: refundRequests.id }).from(refundRequests).where(and(eq(refundRequests.caseId, caseId), eq(refundRequests.status, 'pending'))).limit(1);
  if (waiting) return { ok: true, code: 'sent' };
  const requestId = newId('rrq');
  const resolutionInput = {
    summary: input.summary,
    ...(input.settlePriceCents !== undefined ? { settlePriceCents: input.settlePriceCents } : {}),
    ...(input.goodwillCents !== undefined ? { goodwillCents: input.goodwillCents } : {}),
  };
  await db.transaction(async (tx) => {
    await tx.insert(refundRequests).values({ id: requestId, bookingId, amountCents, reason: 'case_resolution', note: input.summary, requestedByUserId: staff.id, status: 'pending', caseId, resolution: input.resolution, resolutionInput, createdAt: now });
    await tx.insert(supportCaseEvents).values({
      id: newId('cev'),
      caseId,
      kind: 'note',
      authorUserId: staff.id,
      visibility: 'internal',
      body: "Sent for approval: the client's refund is over my limit, so a different finance or admin approves it on the booking.",
      meta: { refundRequestId: requestId },
      createdAt: now,
    });
  });
  await audit(db, staff, 'booking.refund_requested', 'booking', bookingId, now, { metadata: { requestId, caseId, amountCents, reason: 'case_resolution', resolution: input.resolution } });
  return { ok: true, code: 'sent' };
}

/**
 * A case resolution someone asked approval for (requestResolutionApproval), decided by a different finance or admin under
 * the booking's money lock (decideRefundRequest). Approving applies it as asked: its money is worked out again from the
 * booking as it is now and refused as changed when the client's refund isn't what was asked; then the money moves, and
 * the case is resolved in the requester's name with a note of who approved. Declining moves nothing and keeps the case
 * open, with a note.
 */
async function decideCaseResolution(
  db: Db,
  payments_: PaymentProvider,
  staff: StaffActor,
  bookingId: string,
  request: typeof refundRequests.$inferSelect,
  input: z.output<typeof refundDecisionInputSchema>,
  now: Date,
): Promise<ActionResult> {
  const caseId = request.caseId!;
  const [caseRow] = await db.select({ openedByUserId: supportCases.openedByUserId, subjectUserId: supportCases.subjectUserId }).from(supportCases).where(eq(supportCases.id, caseId)).limit(1);
  // Never on a case of their own (security review): one they opened, or one about them.
  if (!caseRow || caseRow.openedByUserId === staff.id || caseRow.subjectUserId === staff.id) return { ok: false, code: 'not_allowed' };
  const note = (body: string) =>
    db.insert(supportCaseEvents).values({ id: newId('cev'), caseId, kind: 'note', authorUserId: staff.id, visibility: 'internal', body, meta: { refundRequestId: request.id }, createdAt: now });
  const decided = (status: 'approved' | 'declined') =>
    db
      .update(refundRequests)
      .set({ status, decidedByUserId: staff.id, decisionNote: input.note, decidedAt: now })
      .where(and(eq(refundRequests.id, request.id), eq(refundRequests.status, 'pending')))
      .returning({ id: refundRequests.id });
  const metadata = { requestId: request.id, caseId, amountCents: request.amountCents, requestedBy: request.requestedByUserId };
  if (input.decision !== 'approve') {
    const [claimed] = await decided('declined');
    if (!claimed) return { ok: false, code: 'not_allowed' };
    await note(`Approval declined: ${input.note} Nothing moved, and the case stays open.`);
    await audit(db, staff, 'booking.refund_declined', 'booking', bookingId, now, { reason: input.note, metadata });
    return { ok: true, code: 'updated' };
  }
  const resolution = { resolution: request.resolution, ...request.resolutionInput } as CaseResolutionInput;
  // The requester resolves it, as they asked, so they must still be able to: their roles now, the case as it is now.
  const roles = (await db.select({ role: staffRoles.role }).from(staffRoles).where(eq(staffRoles.userId, request.requestedByUserId))).map((row) => row.role as StaffRole);
  const requester: StaffActor = { id: request.requestedByUserId, roles };
  // Off staff since, or no longer working cases: nobody resolves it in their name (it can still be declined).
  if (!canWorkCases(roles)) return { ok: false, code: 'not_allowed' };
  const preview = await previewResolution(db, requester, caseId, resolution);
  if (!preview.ok || preview.preview.posterRefundCents !== request.amountCents) return { ok: false, code: 'version_conflict' };
  const { posterRefundCents, helperReceivesCents, platformKeepsCents } = preview.preview;
  // The money first: if it fails, the request stays pending and can be approved again (the refund's key is the case's).
  const applied = await applyResolutionMoney(db, payments_, {
    caseId,
    bookingId,
    resolution: resolution.resolution,
    moved: { posterRefundCents, helperReceivesCents, platformKeepsCents },
    ...(resolution.settlePriceCents !== undefined ? { settlePriceCents: resolution.settlePriceCents } : {}),
    now,
  });
  if (!applied) return { ok: false, code: 'unknown' };
  await decided('approved');
  await note(`Approved: ${input.note}`);
  await audit(db, staff, 'booking.refund_approved', 'booking', bookingId, now, { reason: input.note, metadata: { ...metadata, ok: true } });
  const [fresh] = await db.select({ version: supportCases.version }).from(supportCases).where(eq(supportCases.id, caseId)).limit(1);
  const resolved = await resolveCase(db, requester, caseId, fresh?.version ?? 1, resolution, now, { moneyApplied: true });
  return resolved.ok ? { ok: true, code: 'updated' } : resolved;
}

// ---- The staff booking page ---------------------------------------------------------------------------

/** `/admin/bookings/[bookingId]` for staff. */
export async function getAdminBooking(db: Db, staff: StaffActor, bookingId: string, now: Date): Promise<AdminBookingPageData | null> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, String(bookingId))).limit(1);
  if (!booking) return null;
  const [found, [terms], [completion], people, refundRows, earningRows, caseRows, money, requestRows, [disputed]] = await Promise.all([
    findTaskWithPublicView(db, booking.taskId),
    db.select().from(bookingTerms).where(and(eq(bookingTerms.bookingId, booking.id), eq(bookingTerms.version, booking.termsVersion))).limit(1),
    db.select().from(bookingCompletions).where(eq(bookingCompletions.bookingId, booking.id)).limit(1),
    db.select().from(users).where(inArray(users.id, [booking.posterUserId, booking.helperUserId])),
    db.select().from(refunds).where(eq(refunds.bookingId, booking.id)).orderBy(asc(refunds.createdAt)),
    db.select().from(earnings).where(eq(earnings.bookingId, booking.id)).orderBy(asc(earnings.createdAt)),
    db.select().from(supportCases).where(eq(supportCases.bookingId, booking.id)).orderBy(desc(supportCases.updatedAt)),
    bookingMoneyFacts(db, booking.id),
    db.select().from(refundRequests).where(eq(refundRequests.bookingId, booking.id)).orderBy(desc(refundRequests.createdAt)),
    db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.bookingId, booking.id), isNotNull(payments.disputeId), inArray(payments.disputeStatus, [...LIVE_DISPUTE_STATUSES])))
      .limit(1),
  ]);
  const poster = people.find((user) => user.id === booking.posterUserId);
  const helper = people.find((user) => user.id === booking.helperUserId);
  if (!found || !terms || !poster || !helper) return null;
  const checklist = completion ? checklistView(found.view.categorySlug, completion.checklist) : undefined;
  const limit = refundLimitOf(staff.roles);
  const left = money ? money.chargedCents - money.refundedCents : 0;
  // Never on a booking of their own (security review): no refunds, no approvals.
  const party = booking.posterUserId === staff.id || booking.helperUserId === staff.id;
  // Whoever has a refund limit: support, finance and admins (blueprint 08); trust & safety have none.
  const canRefund = limit > 0 && left > 0 && !party;
  const actions: AdminBookingPageData['actions'] = [];
  if (canRefund) actions.push('refund');
  // Not on a booking of their own: the address is restricted data they'd read about themselves (revealBookingAddress refuses).
  if (canWorkCases(staff.roles) && !party) actions.push('reveal_address');
  // The conversation only while handling a case about this booking (blueprint 08; checked again on reading).
  if (canWorkCases(staff.roles) && caseRows.some((row) => row.status !== 'closed')) actions.push('reveal_conversation');
  // A client's bank disputed a charge on it (T-18): finance downloads the evidence pack for Stripe.
  if (disputed && canDownloadEvidencePack(staff)) actions.push('download_evidence_pack');
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
      paymentMode: booking.paymentMode === 'direct' ? 'direct' : 'held',
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
    refundRequests: await refundRequestRows(db, staff, requestRows, party),
    actions,
  };
}

async function refundRequestRows(db: Db, staff: StaffActor, rows: (typeof refundRequests.$inferSelect)[], party: boolean): Promise<AdminBookingPageData['refundRequests']> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.flatMap((row) => [row.requestedByUserId, ...(row.decidedByUserId ? [row.decidedByUserId] : [])]))];
  const names = new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))).map((row) => [row.id, row.name]));
  // A case resolution's approver must not be on its case (security review): who opened it, or whom it's about.
  const caseIds = [...new Set(rows.flatMap((row) => (row.caseId ? [row.caseId] : [])))];
  const cases = caseIds.length === 0 ? [] : await db.select({ id: supportCases.id, openedByUserId: supportCases.openedByUserId, subjectUserId: supportCases.subjectUserId }).from(supportCases).where(inArray(supportCases.id, caseIds));
  const involved = new Set(cases.filter((row) => row.openedByUserId === staff.id || row.subjectUserId === staff.id).map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    amountCents: row.amountCents,
    reason: row.reason as AdminBookingPageData['refundRequests'][number]['reason'],
    ...(row.caseId ? { caseId: row.caseId } : {}),
    note: row.note,
    requestedBy: names.get(row.requestedByUserId) ?? 'Staff',
    requestedAt: row.createdAt.toISOString(),
    status: row.status as 'pending' | 'approved' | 'declined',
    ...(row.decidedByUserId ? { decidedBy: names.get(row.decidedByUserId) ?? 'Staff' } : {}),
    ...(row.decidedAt ? { decidedAt: row.decidedAt.toISOString() } : {}),
    canDecide: !party && row.status === 'pending' && row.requestedByUserId !== staff.id && canApproveRefund(staff.roles, row.amountCents) && !(row.caseId && involved.has(row.caseId)),
  }));
}

/** A staff refund from the booking page: goodwill (platform funds) or fraud, within the viewer's limit. */
export async function staffRefund(db: Db, payments_: PaymentProvider | null, staff: StaffActor, bookingId: string, input: StaffRefundInput, now: Date): Promise<ActionResult> {
  const parsed = staffRefundInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  // Support, finance and admins refund (each up to their limit, then a request); trust & safety don't (blueprint 08).
  if (!payments_ || refundLimitOf(staff.roles) <= 0) return { ok: false, code: 'not_allowed' };
  const id = String(bookingId);
  // Never on a booking of their own (security review).
  if (await isBookingParty(db, staff.id, id)) return { ok: false, code: 'not_allowed' };
  const { amountCents, reason, note } = parsed.data;
  // The same form sent twice moves the money once (money review #10): its key comes from what was asked, and one request
  // per booking runs at a time, so the second finds the first one's refund (or request) and answers the same.
  const keys = submissionKeys(`refund:${id}:staff`, [staff.id, amountCents, reason, note], now);
  return serialized(db, `staff-refund:${id}`, async (): Promise<ActionResult> => {
    for (const key of [keys.previous, keys.current]) {
      const earlier = await refundMade(db, key);
      if (earlier.made) return earlier.ok ? { ok: true, code: 'submitted' } : { ok: false, code: 'unknown' };
    }
    const [asked] = await db
      .select({ id: refundRequests.id })
      .from(refundRequests)
      .where(and(eq(refundRequests.bookingId, id), eq(refundRequests.requestedByUserId, staff.id), eq(refundRequests.amountCents, amountCents), eq(refundRequests.reason, reason), eq(refundRequests.note, note), eq(refundRequests.status, 'pending'), gte(refundRequests.createdAt, new Date(now.getTime() - DOUBLE_SUBMIT_MS))))
      .limit(1);
    if (asked) return { ok: true, code: 'sent' };
    const money = await bookingMoneyFacts(db, id);
    if (!money) return { ok: false, code: 'not_allowed' };
    const left = money.chargedCents - money.refundedCents;
    if (amountCents > left) return { ok: false, code: 'not_allowed' };
    const limited = await consumeRateLimit(db, `staff-refund:${staff.id}`, REFUND_RULE, now);
    if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
    // Above the viewer's own limit for this booking (earlier refunds count): someone allowed approves it (blueprint 08).
    const prior = await discretionaryRefundedCents(db, id);
    if (prior + amountCents > refundLimitOf(staff.roles)) {
      const requestId = newId('rrq');
      await db.insert(refundRequests).values({ id: requestId, bookingId: id, amountCents, reason, note, requestedByUserId: staff.id, status: 'pending', createdAt: now });
      await audit(db, staff, 'booking.refund_requested', 'booking', id, now, { metadata: { requestId, amountCents, reason, note } });
      return { ok: true, code: 'sent' };
    }
    const ok = await refundCharge(db, payments_, { bookingId: id, amountCents, reason, idempotencyKey: keys.current, now });
    await audit(db, staff, 'booking.refund', 'booking', id, now, { metadata: { amountCents, reason, note, ok } });
    return ok ? { ok: true, code: 'submitted' } : { ok: false, code: 'unknown' };
  });
}

/** The exact address, after a reason that goes to the audit log. */
export async function revealBookingAddress(db: Db, cipher: FieldCipher, staff: StaffActor, bookingId: string, input: RestrictedAccessInput, now: Date): Promise<RevealAddressResult> {
  const parsed = restrictedAccessInputSchema.safeParse(input);
  // validationFailed always returns the failure shape.
  if (!parsed.success) return validationFailed(parsed.error) as Extract<ActionResult, { ok: false }>;
  if (!canWorkCases(staff.roles)) return { ok: false, code: 'not_allowed' };
  // Never on a booking of their own (security review): the address is restricted data they'd read about themselves.
  if (await isBookingParty(db, staff.id, String(bookingId))) return { ok: false, code: 'not_allowed' };
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

/**
 * The booking's conversation as written, after a reason that goes to the audit log, and only while a case is open
 * about the booking or a report about its thread (blueprint 08: "read only when handling a case or report on
 * that thread").
 */
export async function revealBookingConversation(db: Db, staff: StaffActor, bookingId: string, input: RestrictedAccessInput, now: Date): Promise<RevealConversationResult> {
  const parsed = restrictedAccessInputSchema.safeParse(input);
  // validationFailed always returns the failure shape.
  if (!parsed.success) return validationFailed(parsed.error) as Extract<ActionResult, { ok: false }>;
  if (!canWorkCases(staff.roles)) return { ok: false, code: 'not_allowed' };
  const [thread] = await db.select().from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, String(bookingId)))).limit(1);
  if (!thread) return { ok: false, code: 'not_allowed' };
  const [handling] = await db
    .select({ id: supportCases.id })
    .from(supportCases)
    .where(
      and(
        or(eq(supportCases.bookingId, String(bookingId)), sql`${supportCases.context}->>'threadId' = ${thread.id}`),
        notInArray(supportCases.status, ['closed']),
      ),
    )
    .limit(1);
  if (!handling) return { ok: false, code: 'not_allowed' };
  await audit(db, staff, 'booking.view_conversation', 'thread', thread.id, now, { reason: parsed.data.reason, metadata: { bookingId } });
  return { ok: true, conversation: await conversationView(db, thread, { staff, context: `reveal:booking:${bookingId}`, now }) };
}

/**
 * Approve or decline a refund asked for above someone's limit. Approving refunds the charge (what's left
 * then), as the approver; both decisions go to the audit log with the note.
 */
export async function decideRefundRequest(db: Db, payments_: PaymentProvider | null, staff: StaffActor, bookingId: string, input: RefundDecisionInput, now: Date): Promise<ActionResult> {
  const parsed = refundDecisionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (!payments_) return { ok: false, code: 'not_allowed' };
  // Never on a booking of their own; one money decision per booking at a time, the limit read inside (security review).
  if (await isBookingParty(db, staff.id, String(bookingId))) return { ok: false, code: 'not_allowed' };
  return serialized(db, `staff-refund:${bookingId}`, () => decideRefundRequestNow(db, payments_, staff, String(bookingId), parsed.data, now));
}

async function decideRefundRequestNow(db: Db, payments_: PaymentProvider, staff: StaffActor, bookingId: string, input: z.output<typeof refundDecisionInputSchema>, now: Date): Promise<ActionResult> {
  const [request] = await db.select().from(refundRequests).where(and(eq(refundRequests.id, input.requestId), eq(refundRequests.bookingId, String(bookingId)))).limit(1);
  if (!request || request.status !== 'pending' || request.requestedByUserId === staff.id) return { ok: false, code: 'not_allowed' };
  // An approver's limit is per booking too: what was already refunded counts.
  if (!canApproveRefund(staff.roles, (await discretionaryRefundedCents(db, String(bookingId))) + request.amountCents)) return { ok: false, code: 'not_allowed' };
  // A case resolution over someone's limit: applied as asked, or declined.
  if (request.caseId) return decideCaseResolution(db, payments_, staff, bookingId, request, input, now);
  const approve = input.decision === 'approve';
  if (approve) {
    const money = await bookingMoneyFacts(db, String(bookingId));
    if (!money || request.amountCents > money.chargedCents - money.refundedCents) return { ok: false, code: 'not_allowed' };
  }
  const [claimed] = await db
    .update(refundRequests)
    .set({ status: approve ? 'approved' : 'declined', decidedByUserId: staff.id, decisionNote: input.note, decidedAt: now })
    .where(and(eq(refundRequests.id, request.id), eq(refundRequests.status, 'pending')))
    .returning({ id: refundRequests.id });
  if (!claimed) return { ok: false, code: 'not_allowed' };
  let ok = true;
  if (approve) {
    ok = await refundCharge(db, payments_, { bookingId: String(bookingId), amountCents: request.amountCents, reason: request.reason, idempotencyKey: `refund:${bookingId}:approved:${request.id}`, now });
  }
  await audit(db, staff, approve ? 'booking.refund_approved' : 'booking.refund_declined', 'booking', String(bookingId), now, {
    reason: input.note,
    metadata: { requestId: request.id, amountCents: request.amountCents, requestedBy: request.requestedByUserId, ok },
  });
  return ok ? { ok: true, code: 'updated' } : { ok: false, code: 'unknown' };
}

