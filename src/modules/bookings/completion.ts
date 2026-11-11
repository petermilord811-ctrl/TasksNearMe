import { and, eq, inArray } from 'drizzle-orm';
import type {
  ActionResult,
  CompletionInput,
  CompletionPageData,
  CompletionRules,
  CompletionUnavailableReason,
  PriceBreakdown,
  ProblemUnavailableReason,
  ReportProblemInput,
  ReportProblemPageData,
} from '@/contracts';
import { createCompletionInputSchema, reportProblemInputSchema, routes } from '@/contracts';
import { MAX_PHOTO_BYTES } from '@/modules/files/uploads';
import { categories, marketPolicies } from '@/modules/markets/schema';
import { finalBreakdown } from '@/modules/payments/fees';
import { supportCases } from '@/modules/support/schema';
import { files, tasks } from '@/modules/tasks/schema';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { autoApproveDue, completionViewOf } from './completion-view';
import { getBookingView, type HubDeps } from './hub';
import { bookingCompletionPhotos, bookingCompletions, bookingExpenses, bookings, bookingTerms } from './schema';

/**
 * Completing the work and reporting a problem (blueprint 02 J6, 03 §4): the helper sends evidence
 * (photos, hours up to the cap, receipts within the allowance, a remote summary); the client approves
 * (booking page) or reports a problem within the window, which opens a support case. Unanswered
 * submissions are approved automatically when the window ends.
 */

const HOUR = 3_600_000;
const SUBMIT_RATE_LIMIT = { limit: 10, windowSeconds: 600 };
const MAX_MEGABYTES = Math.round(MAX_PHOTO_BYTES / (1024 * 1024));
type BookingRow = typeof bookings.$inferSelect;

async function bookingContext(db: Db, bookingId: string) {
  const [row] = await db
    .select({ booking: bookings, terms: bookingTerms, task: tasks, category: categories })
    .from(bookings)
    .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}
type Context = NonNullable<Awaited<ReturnType<typeof bookingContext>>>;

async function policyOf(db: Db, policyVersionId: string) {
  const [row] = await db.select().from(marketPolicies).where(eq(marketPolicies.id, policyVersionId)).limit(1);
  return row ?? null;
}

/** The evidence the category and the terms ask for. */
export function completionRulesFor(ctx: Pick<Context, 'terms' | 'task' | 'category'>): CompletionRules {
  const remote = ctx.task.mode === 'remote';
  const evidence = ctx.category.requiredEvidence;
  return {
    photosMin: remote ? 0 : evidence.photosMin,
    photosMax: 8,
    ...(ctx.terms.pricingType === 'hourly'
      ? { hours: { estimated: ctx.terms.estimatedHours ?? ctx.terms.hoursCap ?? 0, cap: ctx.terms.hoursCap ?? 0 } }
      : {}),
    ...(ctx.terms.expenseAllowanceCents > 0
      ? { expenses: { allowanceCents: ctx.terms.expenseAllowanceCents, description: ctx.task.expenseAllowanceNote ?? '', maxItems: 5 } }
      : {}),
    noteRequired: remote || evidence.remoteNote,
    noteMaxLength: 1000,
    maxPhotoMegabytes: MAX_MEGABYTES,
  };
}

function completionUnavailable(booking: BookingRow, remote: boolean): CompletionUnavailableReason | undefined {
  if (booking.status === 'in_progress') return undefined;
  if (booking.status === 'confirmed') return remote ? undefined : 'not_started';
  if (booking.status === 'completion_submitted') return 'already_submitted';
  return 'closed';
}

/** `/app/bookings/[bookingId]/complete`, for the booking's helper only. */
export async function getCompletionPage(deps: HubDeps, helperId: string, bookingId: string, now: Date): Promise<CompletionPageData | null> {
  const ctx = await bookingContext(deps.db, bookingId);
  if (!ctx || ctx.booking.helperUserId !== helperId) return null;
  const view = await getBookingView(deps, helperId, bookingId, now);
  if (!view) return null;
  const unavailable = completionUnavailable(ctx.booking, ctx.task.mode === 'remote');
  return {
    booking: { id: view.id, task: view.task, poster: view.poster, terms: view.terms, location: view.location },
    rules: completionRulesFor(ctx),
    ...(unavailable ? { unavailable } : {}),
  };
}

/** The final numbers for hours and expenses entered (helper variant on screen). */
export async function quoteFinal(db: Db, helperId: string, bookingId: string, input: { hoursWorked?: number; expensesCents: number }): Promise<PriceBreakdown | null> {
  const ctx = await bookingContext(db, bookingId);
  if (!ctx || ctx.booking.helperUserId !== helperId) return null;
  const policy = await policyOf(db, ctx.booking.policyVersionId);
  if (!policy) return null;
  const hours = ctx.terms.pricingType === 'hourly' && input.hoursWorked !== undefined ? Math.max(0, input.hoursWorked) : undefined;
  return finalBreakdown(policy.fees, ctx.terms.breakdown, {
    ...(hours !== undefined ? { approvedHours: hours } : {}),
    approvedExpensesCents: Math.max(0, Math.round(input.expensesCents)),
  });
}

/** Only the uploader's own evidence photos (work photos and receipts share one upload) may be attached. */
async function ownFiles(db: Db, userId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .where(and(inArray(files.id, ids), eq(files.ownerUserId, userId), inArray(files.kind, ['evidence', 'receipt'])));
  return rows.length === new Set(ids).size;
}

export async function submitCompletion(db: Db, helperId: string, bookingId: string, input: CompletionInput, now: Date): Promise<ActionResult> {
  const limited = await consumeRateLimit(db, `completion:${helperId}`, SUBMIT_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const ctx = await bookingContext(db, String(bookingId));
  if (!ctx || ctx.booking.helperUserId !== helperId) return { ok: false, code: 'not_found' };
  if (completionUnavailable(ctx.booking, ctx.task.mode === 'remote')) return { ok: false, code: 'not_allowed' };

  const parsed = createCompletionInputSchema(completionRulesFor(ctx)).safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const completion = parsed.data;
  if (!(await ownFiles(db, helperId, completion.photoIds))) return { ok: false, code: 'validation_failed', fieldErrors: { photoIds: ['invalid'] } };
  if (!(await ownFiles(db, helperId, completion.expenses.map((item) => item.receiptPhotoId)))) {
    return { ok: false, code: 'validation_failed', fieldErrors: { expenses: ['invalid'] } };
  }
  const policy = await policyOf(db, ctx.booking.policyVersionId);
  if (!policy) return { ok: false, code: 'unknown' };
  const expensesCents = completion.expenses.reduce((sum, item) => sum + item.amountCents, 0);
  const final = finalBreakdown(policy.fees, ctx.terms.breakdown, {
    ...(completion.hoursWorked !== undefined ? { approvedHours: completion.hoursWorked } : {}),
    approvedExpensesCents: expensesCents,
  });

  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(bookings)
      .set({
        status: 'completion_submitted',
        completionSubmittedAt: now,
        approvalDueAt: new Date(now.getTime() + policy.timers.autoApproveHours * HOUR),
        updatedAt: now,
      })
      .where(and(eq(bookings.id, ctx.booking.id), eq(bookings.status, ctx.booking.status)))
      .returning({ id: bookings.id });
    if (rows.length === 0) return false;
    await tx.insert(bookingCompletions).values({
      bookingId: ctx.booking.id,
      submittedAt: now,
      note: completion.note,
      hoursWorked: completion.hoursWorked ?? null,
      finalBreakdown: final,
    });
    if (completion.photoIds.length > 0) {
      await tx.insert(bookingCompletionPhotos).values(completion.photoIds.map((fileId, position) => ({ bookingId: ctx.booking.id, fileId, position })));
    }
    if (completion.expenses.length > 0) {
      await tx.insert(bookingExpenses).values(
        completion.expenses.map((item, position) => ({
          id: newId('exp'),
          bookingId: ctx.booking.id,
          description: item.description,
          amountCents: item.amountCents,
          receiptFileId: item.receiptPhotoId,
          position,
          createdAt: now,
        })),
      );
    }
    await tx.insert(outboxEvents).values({
      id: newId('evt'),
      type: 'booking.completion_submitted',
      aggregateType: 'booking',
      aggregateId: ctx.booking.id,
      payload: { bookingId: ctx.booking.id, posterUserId: ctx.booking.posterUserId, helperUserId: helperId },
    });
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: helperId, actorRole: 'user', action: 'booking.completion_submitted', targetType: 'booking', targetId: ctx.booking.id });
    return true;
  });
  return updated ? { ok: true, code: 'submitted', redirectTo: routes.app.booking(ctx.booking.id) } : { ok: false, code: 'not_allowed' };
}

// ---- Reporting a problem ----------------------------------------------------------------------------

function problemUnavailable(booking: BookingRow, now: Date): ProblemUnavailableReason | undefined {
  if (booking.status === 'completion_submitted') return booking.approvalDueAt && booking.approvalDueAt <= now ? 'window_passed' : undefined;
  if (['pending_funding', 'confirmed', 'in_progress'].includes(booking.status)) return 'not_submitted';
  if (booking.status === 'completed' && booking.completedVia === 'auto') return 'window_passed';
  return 'closed';
}

/** `/app/bookings/[bookingId]/problem`, for the booking's client only. */
export async function getReportProblemPage(deps: HubDeps, posterId: string, bookingId: string, now: Date): Promise<ReportProblemPageData | null> {
  const ctx = await bookingContext(deps.db, bookingId);
  if (!ctx || ctx.booking.posterUserId !== posterId) return null;
  await autoApproveDue(deps.db, now, { bookingId });
  const view = await getBookingView(deps, posterId, bookingId, now);
  if (!view) return null;
  const [current] = await deps.db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  const unavailable = current ? problemUnavailable(current, now) : 'closed';
  const completion = await completionViewOf(deps.db, bookingId);
  return {
    booking: { id: view.id, task: view.task, helper: view.helper, terms: view.terms },
    ...(completion ? { completion } : {}),
    ...(current?.approvalDueAt && current.status === 'completion_submitted' ? { approvalDueAt: current.approvalDueAt.toISOString() } : {}),
    maxPhotoMegabytes: MAX_MEGABYTES,
    ...(unavailable ? { unavailable } : {}),
  };
}

/** The client reports a problem: the booking becomes `disputed`, the earnings stay on hold, support gets a case. */
export async function reportProblem(db: Db, posterId: string, bookingId: string, input: ReportProblemInput, now: Date): Promise<ActionResult> {
  const limited = await consumeRateLimit(db, `problem:${posterId}`, SUBMIT_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, String(bookingId))).limit(1);
  if (!booking || booking.posterUserId !== posterId) return { ok: false, code: 'not_found' };
  const unavailable = problemUnavailable(booking, now);
  if (unavailable === 'window_passed') return { ok: false, code: 'expired' };
  if (unavailable) return { ok: false, code: 'not_allowed' };
  const parsed = reportProblemInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (!(await ownFiles(db, posterId, parsed.data.photoIds))) return { ok: false, code: 'validation_failed', fieldErrors: { photoIds: ['invalid'] } };

  const caseId = newId('case');
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(bookings)
      .set({ status: 'disputed', updatedAt: now })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, 'completion_submitted')))
      .returning({ id: bookings.id });
    if (rows.length === 0) return false;
    await tx.insert(supportCases).values({
      id: caseId,
      type: 'dispute',
      status: 'open',
      priority: 'high',
      bookingId: booking.id,
      openedByUserId: posterId,
      reason: parsed.data.reason,
      description: parsed.data.description,
      fileIds: parsed.data.photoIds,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(outboxEvents).values({
      id: newId('evt'),
      type: 'booking.disputed',
      aggregateType: 'booking',
      aggregateId: booking.id,
      payload: { bookingId: booking.id, caseId, posterUserId: posterId, helperUserId: booking.helperUserId, reason: parsed.data.reason },
    });
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: posterId, actorRole: 'user', action: 'booking.disputed', targetType: 'booking', targetId: booking.id, reason: parsed.data.reason });
    return true;
  });
  return updated ? { ok: true, code: 'submitted', redirectTo: routes.app.booking(booking.id) } : { ok: false, code: 'not_allowed' };
}
