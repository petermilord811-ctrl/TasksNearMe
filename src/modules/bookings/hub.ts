import { and, asc, desc, eq, gt, inArray, isNull, ne, or } from 'drizzle-orm';
import type {
  ActionResult,
  BookingActionId,
  BookingListRow,
  BookingPaymentLine,
  BookingsPageData,
  BookingStatus,
  BookingView,
  BookingViewerRole,
  CancelReason,
  CardBrand,
  CompletedVia,
  ExactAddress,
  PricingInput,
  TimelineEvent,
} from '@/contracts';
import { routes } from '@/contracts';
import { marketPolicies } from '@/modules/markets/schema';
import { offers } from '@/modules/offers/schema';
import { earnings } from '@/modules/earnings/schema';
import { payments, refunds } from '@/modules/payments/schema';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { findTaskWithPublicView } from '@/modules/tasks/queries';
import { taskLocations, tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { recordCompletionMoney } from '@/modules/earnings/service';
import { isHelperSaved, myReviewOf, setHelperSaved } from '@/modules/reviews/service';
import { getBookingDispute } from '@/modules/support/service';
import { bookingOpenChange } from './changes';
import { bookingThreadLink, ensureThread, postEvent } from '@/modules/messaging/service';
import { canceledFacts, contestNoShow, reopenForReplacement, type ReopenedTask } from './after-cancel';
import { autoApproveDue, completionViewOf } from './completion-view';
import { addressVisibility, allBookingActions, bookingDeadlines, bookingNextStep, type BookingFacts, type BookingPolicy } from './domain';
import { expireCantAccess } from './sheets';
import { readExactAddress } from '@/modules/tasks/locations';
import type { PaymentProvider } from '@/integrations/payments';
import { clientSummary } from './people';
import { tipViewOf } from './tips';
import { scheduledPaymentViewOf } from './scheduled';
import { seriesOfBooking, seriesSummaries, skipVisit } from './series';
import { bookingTerms, bookings } from './schema';
import { shownPaymentStatus } from '@/modules/payments/shown-status';

/**
 * The booking page and the bookings list (blueprint 03 §4; ui-contract §5–6), projected for the
 * booking's client or helper. Anyone else gets nothing (404). Also the single-tap actions.
 */

export interface HubDeps {
  db: Db;
  cipher: FieldCipher;
  /** For the client's tip card (UI-057): its cards come from the provider. Without it, no tip card is offered. */
  payments?: PaymentProvider | null;
}

type BookingRow = typeof bookings.$inferSelect;
type TermsRow = typeof bookingTerms.$inferSelect;
const DEFAULT_POLICY: BookingPolicy = { noShowMinutes: 30, addressHideAfterHours: 48 };

function roleOf(booking: BookingRow, userId: string): BookingViewerRole | null {
  if (booking.posterUserId === userId) return 'poster';
  if (booking.helperUserId === userId) return 'helper';
  return null;
}

const REVIEW_WINDOW_MS = 14 * 86_400_000;

/** Facts for completed bookings: reviews and saved helpers. */
async function reviewFacts(db: Db, booking: BookingRow, role: BookingViewerRole, now: Date) {
  if (booking.status !== 'completed') return {};
  const [mine, saved] = await Promise.all([
    myReviewOf(db, role === 'poster' ? booking.posterUserId : booking.helperUserId, booking.id),
    role === 'poster' ? isHelperSaved(db, booking.posterUserId, booking.helperUserId) : Promise.resolve(false),
  ]);
  return {
    mine,
    facts: {
      reviewed: Boolean(mine),
      reviewWindowOpen: booking.completedAt !== null && now.getTime() < booking.completedAt.getTime() + REVIEW_WINDOW_MS,
      helperSaved: saved,
    },
  };
}

function factsOf(booking: BookingRow, remote: boolean): BookingFacts {
  return {
    status: booking.status,
    startAt: booking.startAt,
    remote,
    onMyWayAt: booking.onMyWayAt,
    arrivedAt: booking.arrivedAt,
    fundingExpiresAt: booking.fundingExpiresAt,
    approvalDueAt: booking.approvalDueAt,
    completedAt: booking.completedAt,
    lateByMinutes: booking.lateByMinutes,
    cantAccessAt: booking.cantAccessAt,
    posterResponseDueAt: booking.posterResponseDueAt,
    seriesId: booking.seriesId,
    fundingFailure: booking.fundingFailure,
  };
}

function pricingOf(terms: TermsRow): PricingInput {
  return terms.pricingType === 'hourly'
    ? { type: 'hourly', rateCents: terms.hourlyRateCents ?? 0, estimatedHours: terms.estimatedHours ?? 0, hoursCap: terms.hoursCap ?? 0 }
    : { type: 'fixed', priceCents: terms.priceCents ?? 0 };
}

async function policyOf(db: Db, policyVersionId: string): Promise<BookingPolicy> {
  const [row] = await db.select({ timers: marketPolicies.timers }).from(marketPolicies).where(eq(marketPolicies.id, policyVersionId)).limit(1);
  return row ? { noShowMinutes: row.timers.noShowMinutes, addressHideAfterHours: row.timers.addressHideAfterHours } : DEFAULT_POLICY;
}

export { clientSummary } from './people';

/** Charges that went through (a refund later doesn't undo that they did). */
const RECEIVED = ['succeeded', 'partially_refunded', 'refunded'];
/** What the client pays for the booking itself: its payment, a change's, or an invite's captured hold (tips aside). */
const BOOKING_CHARGES = ['booking_funding', 'change_funding', 'invite_authorization'] as const;

function timelineOf(
  booking: BookingRow,
  task: { publishedAt: Date | null; createdAt: Date },
  offer: { createdAt: Date } | null,
  paymentRows: (typeof payments.$inferSelect)[],
  priceCents: number,
  names: { poster: string; helper: string },
  viewer: { role: 'poster' | 'helper'; helperEarningsCents: number },
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const add = (at: Date | null, actor: TimelineEvent['actor'], type: TimelineEvent['type'], params?: TimelineEvent['params']) => {
    if (!at) return;
    const actorName = actor === 'poster' ? names.poster : actor === 'helper' ? names.helper : undefined;
    events.push({ id: `evt_${type}_${events.length + 1}`, at: at.toISOString(), actor, ...(actorName ? { actorName } : {}), type, ...(params ? { params } : {}) });
  };
  add(task.publishedAt ?? task.createdAt, 'poster', 'task_posted');
  if (offer) add(offer.createdAt, 'helper', 'offer_received', { amountCents: priceCents });
  // A tip is its own event after approval (a declined tip stays in the client's payments, not the timeline).
  const bookingMoney = paymentRows.filter((payment) => payment.purpose !== 'tip');
  // Money per role (audit M26): the client's own payments with their amounts; the helper sees that the client paid,
  // with the helper's own earnings for the booking's payment, never the client's total.
  for (const payment of bookingMoney) {
    if (payment.status === 'failed') add(payment.updatedAt, 'system', 'payment_failed', viewer.role === 'poster' ? { amountCents: payment.amountCents } : undefined);
  }
  add(booking.confirmedAt, 'poster', 'booked');
  // A charge refunded later was still received (aa's sweep D4), and it happened when it was made: a refund rewrites
  // the row's updatedAt, never its createdAt.
  for (const payment of bookingMoney) {
    if (!RECEIVED.includes(payment.status)) continue;
    if (viewer.role === 'poster') add(payment.createdAt, 'system', 'payment_succeeded', { amountCents: payment.amountCents });
    else add(payment.createdAt, 'system', 'payment_held', payment.purpose === 'booking_funding' ? { amountCents: viewer.helperEarningsCents } : undefined);
  }
  add(booking.onMyWayAt, 'helper', 'on_my_way');
  add(booking.arrivedAt, 'helper', 'arrived');
  add(booking.completionSubmittedAt, 'helper', 'completion_submitted');
  if (booking.status === 'completed') add(booking.completedAt, booking.completedVia === 'auto' ? 'system' : 'poster', booking.completedVia === 'auto' ? 'auto_approved' : 'approved');
  for (const payment of paymentRows) {
    if (payment.purpose === 'tip' && RECEIVED.includes(payment.status)) add(payment.createdAt, 'poster', 'tip_added', { amountCents: payment.amountCents });
  }
  if (booking.status === 'canceled' && booking.cancelReason !== 'funding_failed') {
    const reason = booking.cancelReason ?? '';
    add(booking.canceledAt, reason.startsWith('poster') ? 'poster' : reason.startsWith('helper') ? 'helper' : 'support', 'canceled');
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

/** One booking for its client or its helper; null for anyone else (and for unpaid holds that ran out). */
export async function getBookingView(deps: HubDeps, userId: string, bookingId: string, now: Date): Promise<BookingView | null> {
  const { db } = deps;
  await autoApproveDue(db, now, { bookingId });
  await expireCantAccess(db, now, { bookingId });
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return null;
  const role = roleOf(booking, userId);
  if (!role || (booking.status === 'canceled' && booking.cancelReason === 'funding_failed')) return null;

  const [[terms], [task], found, helpers, client, policy, paymentRows, offerRows] = await Promise.all([
    db.select().from(bookingTerms).where(and(eq(bookingTerms.bookingId, booking.id), eq(bookingTerms.version, booking.termsVersion))).limit(1),
    db.select().from(tasks).where(eq(tasks.id, booking.taskId)).limit(1),
    findTaskWithPublicView(db, booking.taskId),
    getHelperSummaries([booking.helperUserId], db),
    clientSummary(db, booking.posterUserId),
    policyOf(db, booking.policyVersionId),
    db.select().from(payments).where(eq(payments.bookingId, booking.id)).orderBy(asc(payments.createdAt)),
    booking.offerId ? db.select({ createdAt: offers.createdAt }).from(offers).where(eq(offers.id, booking.offerId)).limit(1) : Promise.resolve([]),
  ]);
  const helper = helpers.get(booking.helperUserId);
  if (!terms || !task || !found || !helper || !client) return null;
  const completion = ['completion_submitted', 'disputed', 'completed'].includes(booking.status) ? await completionViewOf(db, booking.id) : null;

  const remote = found.view.location.kind === 'remote';
  const [review, afterCancel] = await Promise.all([reviewFacts(db, booking, role, now), canceledFacts(db, booking, userId)]);
  const facts = { ...factsOf(booking, remote), ...review.facts, ...afterCancel };
  const visibility = addressVisibility(facts, role, policy, now);
  let exactAddress: ExactAddress | undefined;
  if (visibility === 'visible' && task.locationId) {
    const [location] = await db.select().from(taskLocations).where(eq(taskLocations.id, task.locationId)).limit(1);
    if (location) exactAddress = readExactAddress(deps.cipher, location.addressEnc);
  }

  const paymentLines: BookingPaymentLine[] = paymentRows
    .filter((row) => ['succeeded', 'failed', 'refunded', 'partially_refunded'].includes(row.status))
    .map((row) => ({
      id: row.id,
      kind: row.purpose === 'tip' ? ('tip' as const) : ('charge' as const),
      amountCents: row.amountCents,
      status: shownPaymentStatus(row),
      ...(row.methodBrand ? { method: { brand: row.methodBrand as CardBrand, ...(row.methodLast4 ? { last4: row.methodLast4 } : {}) } } : {}),
      // When it was charged (a refund rewrites updatedAt, D4); a failure when it failed.
      at: (row.status === 'failed' ? row.updatedAt : row.createdAt).toISOString(),
    }));
  // Refunds (cancellations, unused amounts, settlements, goodwill) follow the charges in the client's history.
  if (role === 'poster') {
    const refundRows = await db.select().from(refunds).where(eq(refunds.bookingId, booking.id));
    for (const row of refundRows) {
      paymentLines.push({
        id: row.id,
        kind: 'refund',
        amountCents: row.amountCents,
        status: row.status === 'succeeded' ? 'succeeded' : row.status === 'failed' ? 'failed' : 'processing',
        at: row.createdAt.toISOString(),
      });
    }
    paymentLines.sort((a, b) => a.at.localeCompare(b.at));
  }

  const [dispute, openChange, tip, series, scheduledPayment] = await Promise.all([
    getBookingDispute(db, booking.id, userId, role),
    bookingOpenChange(db, booking.id, userId, role, now),
    tipViewOf(deps, booking, role, completion?.finalBreakdown.taskPriceCents ?? terms.breakdown.taskPriceCents, now),
    seriesOfBooking(db, booking),
    scheduledPaymentViewOf(deps, booking, role),
  ]);

  return {
    id: booking.id,
    task: { id: task.id, title: found.view.title, categorySlug: found.view.categorySlug, schedule: found.view.schedule },
    ...(dispute ? { dispute } : {}),
    ...(openChange ? { openChange } : {}),
    status: booking.status as BookingStatus,
    ...(booking.cancelReason ? { cancelReason: booking.cancelReason as CancelReason } : {}),
    ...(booking.completedVia ? { completedVia: booking.completedVia as CompletedVia } : {}),
    viewerRole: role,
    poster: client,
    helper,
    location: found.view.location,
    ...(exactAddress ? { exactAddress } : {}),
    addressVisibility: exactAddress || visibility !== 'visible' ? visibility : 'after_confirmation',
    terms: {
      version: terms.version,
      pricing: pricingOf(terms),
      breakdown: terms.breakdown,
      scopeText: terms.scopeText,
      start: terms.startAt.toISOString(),
      ...(terms.expenseAllowanceCents > 0
        ? { expenseAllowance: { amountCents: terms.expenseAllowanceCents, description: task.expenseAllowanceNote ?? '' } }
        : {}),
    },
    ...(booking.onMyWayAt || booking.arrivedAt || booking.lateByMinutes || booking.cantAccessAt
      ? {
          checkIn: {
            ...(booking.onMyWayAt ? { onMyWayAt: booking.onMyWayAt.toISOString() } : {}),
            ...(booking.lateByMinutes === 10 || booking.lateByMinutes === 20 || booking.lateByMinutes === 30 ? { lateByMinutes: booking.lateByMinutes } : {}),
            ...(booking.arrivedAt ? { arrivedAt: booking.arrivedAt.toISOString() } : {}),
            ...(booking.cantAccessAt ? { cantAccessAt: booking.cantAccessAt.toISOString() } : {}),
          },
        }
      : {}),
    deadlines: bookingDeadlines(facts, role, policy, now),
    timeline: timelineOf(
      booking,
      task,
      offerRows[0] ?? null,
      paymentRows,
      terms.breakdown.taskPriceCents,
      { poster: client.displayName, helper: helper.displayName },
      { role, helperEarningsCents: terms.breakdown.helperEarningsCents },
    ),
    ...(role === 'poster' ? { payments: paymentLines } : {}),
    ...(completion ? { completion } : {}),
    ...(role === 'poster' && review.facts?.helperSaved ? { helperSaved: true } : {}),
    ...(review.mine ? { myReview: review.mine } : {}),
    ...(tip ? { tip } : {}),
    ...(series ? { series } : {}),
    // The helper canceled and the task is open for offers again: the client's page links to it.
    ...(role === 'poster' && booking.status === 'canceled' && facts.task?.reopened && facts.task.status === 'open' ? { taskReopened: true } : {}),
    ...(scheduledPayment ? { scheduledPayment } : {}),
    actions: allBookingActions(facts, role, policy, now),
  };
}

const FINAL: string[] = ['completed', 'canceled'];

/** `/app/bookings`: the viewer's bookings as client and helper. Holds that ran out are left out. */
export async function getBookingsPage(db: Db, userId: string, now: Date): Promise<BookingsPageData> {
  await autoApproveDue(db, now);
  const regular = await seriesSummaries(db, userId, now);
  const withRegular = (page: BookingsPageData): BookingsPageData => (regular.length > 0 ? { ...page, regular } : page);
  const rows = await db
    .select({ booking: bookings, terms: bookingTerms })
    .from(bookings)
    .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
    .where(
      and(
        or(eq(bookings.posterUserId, userId), eq(bookings.helperUserId, userId)),
        or(ne(bookings.status, 'canceled'), isNull(bookings.cancelReason), ne(bookings.cancelReason, 'funding_failed')),
      ),
    )
    .orderBy(desc(bookings.startAt));
  if (rows.length === 0) return withRegular({ needsAction: [], upcoming: [], past: [] });

  // What actually moved on a finished booking (aa's sweep D6): the client's charges less the refunds, the helper's
  // earnings rows (a tip aside). The agreed terms only while it's ahead.
  const finished = rows.filter((row) => FINAL.includes(row.booking.status)).map((row) => row.booking.id);
  const [chargeRows, refundRows, earningRows] = finished.length
    ? await Promise.all([
        db.select({ bookingId: payments.bookingId, amountCents: payments.amountCents }).from(payments).where(and(inArray(payments.bookingId, finished), inArray(payments.purpose, [...BOOKING_CHARGES]), inArray(payments.status, RECEIVED))),
        db.select({ bookingId: refunds.bookingId, amountCents: refunds.amountCents }).from(refunds).where(and(inArray(refunds.bookingId, finished), eq(refunds.status, 'succeeded'))),
        db.select({ bookingId: earnings.bookingId, amountCents: earnings.amountCents }).from(earnings).where(and(inArray(earnings.bookingId, finished), ne(earnings.kind, 'tip'))),
      ])
    : [[], [], []];
  const sumFor = (list: { bookingId: string | null; amountCents: number }[], id: string) => list.filter((row) => row.bookingId === id).reduce((sum, row) => sum + row.amountCents, 0);

  const taskIds = [...new Set(rows.map((row) => row.booking.taskId))];
  const views = new Map((await Promise.all(taskIds.map((id) => findTaskWithPublicView(db, id)))).flatMap((f) => (f ? [[f.view.id, f.view] as const] : [])));
  const helpers = await getHelperSummaries(rows.map((row) => row.booking.helperUserId), db);
  const clientIds = [...new Set(rows.map((row) => row.booking.posterUserId))];
  const clients = new Map((await Promise.all(clientIds.map((id) => clientSummary(db, id)))).flatMap((c) => (c ? [[c.id, c] as const] : [])));

  const list = rows.flatMap(({ booking, terms }): BookingListRow[] => {
    const role = roleOf(booking, userId);
    const view = views.get(booking.taskId);
    const other = role === 'poster' ? helpers.get(booking.helperUserId) : clients.get(booking.posterUserId);
    if (!role || !view || !other) return [];
    const remote = view.location.kind === 'remote';
    const nextStep = bookingNextStep(factsOf(booking, remote), role, now);
    return [
      {
        id: booking.id,
        title: view.title,
        categorySlug: view.categorySlug,
        status: booking.status as BookingStatus,
        ...(booking.cancelReason ? { cancelReason: booking.cancelReason as CancelReason } : {}),
        viewerRole: role,
        otherParty: { id: other.id, displayName: other.displayName, initials: other.initials, ...(other.photo ? { photo: other.photo } : {}), memberSince: other.memberSince, phoneVerified: other.phoneVerified },
        start: terms.startAt.toISOString(),
        location: view.location,
        amountCents: FINAL.includes(booking.status)
          ? role === 'poster'
            ? sumFor(chargeRows, booking.id) - sumFor(refundRows, booking.id)
            : sumFor(earningRows, booking.id)
          : role === 'poster'
            ? (terms.breakdown.posterChargedCents ?? terms.breakdown.posterTotalCents)
            : terms.breakdown.helperEarningsCents,
        needsAction: nextStep !== undefined,
        ...(nextStep ? { nextStep } : {}),
      },
    ];
  });
  const byStart = (a: BookingListRow, b: BookingListRow) => a.start.localeCompare(b.start);
  const upcoming = list.filter((row) => !FINAL.includes(row.status)).sort(byStart);
  return withRegular({
    needsAction: upcoming.filter((row) => row.needsAction).sort((a, b) => (a.nextStep?.dueAt ?? a.start).localeCompare(b.nextStep?.dueAt ?? b.start)),
    upcoming,
    past: list.filter((row) => FINAL.includes(row.status)).sort((a, b) => b.start.localeCompare(a.start)),
  });
}

// ---- Single-tap actions ---------------------------------------------------------------------------

async function recordEvent(db: Pick<Db, 'insert'>, type: string, actorId: string, booking: BookingRow) {
  await db.insert(outboxEvents).values({
    id: newId('evt'),
    type,
    aggregateType: 'booking',
    aggregateId: booking.id,
    payload: { bookingId: booking.id, taskId: booking.taskId, posterUserId: booking.posterUserId, helperUserId: booking.helperUserId },
  });
  await db.insert(auditLog).values({ id: newId('aud'), actorId, actorRole: 'user', action: type, targetType: 'booking', targetId: booking.id });
}

export interface BookingActionOptions {
  /** The contester's first message on a no-show case (server copy). */
  contestOpening?: string;
  /** Called when Find a replacement reopened the task, to refresh the pages that list it. */
  onTaskReopened?: (task: ReopenedTask) => void;
}

/** The booking page's actions: only those the domain offers right now. */
export async function runBookingAction(
  db: Db,
  userId: string,
  bookingId: string,
  action: BookingActionId,
  now: Date,
  options: BookingActionOptions = {},
): Promise<ActionResult> {
  await autoApproveDue(db, now, { bookingId: String(bookingId) });
  await expireCantAccess(db, now, { bookingId: String(bookingId) });
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, String(bookingId))).limit(1);
  const role = booking ? roleOf(booking, userId) : null;
  if (!booking || !role) return { ok: false, code: 'not_found' };
  const found = await findTaskWithPublicView(db, booking.taskId);
  const [review, afterCancel] = await Promise.all([reviewFacts(db, booking, role, now), canceledFacts(db, booking, userId)]);
  const facts = { ...factsOf(booking, found?.view.location.kind === 'remote'), ...review.facts, ...afterCancel };
  const allowed = allBookingActions(facts, role, await policyOf(db, booking.policyVersionId), now).find((item) => item.id === action);
  if (!allowed?.enabled) return { ok: false, code: 'not_allowed' };

  const threadEvent: Partial<Record<BookingActionId, TimelineEvent['type']>> = { on_my_way: 'on_my_way', arrived: 'arrived', approve: 'approved' };
  const transition = async (expected: string, set: Partial<BookingRow>, event: string): Promise<ActionResult> => {
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(bookings)
        .set({ ...set, updatedAt: now })
        .where(and(eq(bookings.id, booking.id), eq(bookings.status, expected)))
        .returning({ id: bookings.id });
      if (rows.length === 0) return false;
      if (set.status === 'completed') await tx.update(tasks).set({ status: 'completed', updatedAt: now }).where(eq(tasks.id, booking.taskId));
      await recordEvent(tx, event, userId, booking);
      const type = threadEvent[action];
      if (type) await postEvent(tx, bookingThreadLink(booking), 'status', { type }, now, userId);
      return true;
    });
    return updated ? { ok: true, code: 'updated' } : { ok: false, code: 'version_conflict' };
  };

  switch (action) {
    case 'pay':
      return booking.offerId
        ? { ok: true, code: 'updated', redirectTo: routes.app.confirmOffer(booking.taskId, booking.offerId) }
        : { ok: false, code: 'not_allowed' };
    case 'add_to_calendar':
      return { ok: true, code: 'updated', redirectTo: routes.app.bookingCalendar(booking.id) };
    case 'im_here': {
      // Only while the 30 minutes run, so the expiry and the answer can't both land (lifecycle review #12). The report
      // stays on the record (the check-in list shows it), and the helper can't send another one.
      const answered = await db
        .update(bookings)
        .set({ posterResponseDueAt: null, updatedAt: now })
        .where(and(eq(bookings.id, booking.id), eq(bookings.status, 'in_progress'), gt(bookings.posterResponseDueAt, now)))
        .returning({ id: bookings.id });
      if (answered.length === 0) return { ok: false, code: 'version_conflict' };
      await recordEvent(db, 'booking.client_present', userId, booking);
      return { ok: true, code: 'updated' };
    }
    case 'message': {
      const threadId = await ensureThread(db, bookingThreadLink(booking), now);
      return { ok: true, code: 'updated', redirectTo: routes.app.thread(threadId) };
    }
    case 'submit_completion':
      return { ok: true, code: 'updated', redirectTo: routes.app.bookingComplete(booking.id) };
    case 'review':
      return { ok: true, code: 'updated', redirectTo: routes.app.bookingReview(booking.id) };
    case 'save_helper':
      return setHelperSaved(db, booking.posterUserId, booking.helperUserId, true, now);
    case 'report_problem':
      return { ok: true, code: 'updated', redirectTo: routes.app.bookingProblem(booking.id) };
    case 'on_my_way':
      return transition('confirmed', { onMyWayAt: now }, 'booking.on_my_way');
    case 'arrived':
      return transition('confirmed', { status: 'in_progress', arrivedAt: now }, 'booking.arrived');
    case 'approve': {
      const result = await transition('completion_submitted', { status: 'completed', completedVia: 'poster', completedAt: now, approvalDueAt: null }, 'booking.completed');
      if (result.ok) await recordCompletionMoney(db, booking.id, now);
      return result;
    }
    case 'skip_visit':
      return skipVisit(db, userId, booking.id, now);
    case 'find_replacement': {
      const reopened = await reopenForReplacement(db, userId, booking, now);
      if (reopened.task) options.onTaskReopened?.(reopened.task);
      return reopened.result;
    }
    case 'contest_no_show':
      return contestNoShow(db, userId, booking, options.contestOpening ?? '', now);
    default:
      return { ok: false, code: 'not_allowed' };
  }
}
