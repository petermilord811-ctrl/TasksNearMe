import { and, eq, inArray, lte, notInArray, sql } from 'drizzle-orm';
import type {
  AcceptChangeInput,
  ActionResult,
  BookingView,
  ChangeActionId,
  ChangeQuoteResult,
  ChangeRequestView,
  ChangeReviewPageData,
  ChangeStatus,
  ChangeTermsView,
  PaymentAttemptResult,
  PriceBreakdown,
  ProposableChangeType,
  ProposeChangeInput,
  ProposeChangePageData,
} from '@/contracts';
import { acceptChangeInputSchema, proposeChangeInputSchema, routes } from '@/contracts';
import type { ChargeResult, PaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { marketPolicies } from '@/modules/markets/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { refundAcross, refundableCharges } from '@/modules/payments/refund-across';
import { payments } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { isUniqueViolation } from '@/platform/db/errors';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { allowedChangeTypes, changeExpiresAt, changeScheduleWindow, OPEN_CHANGE_STATUSES, pricingOf, proposedTerms, type ChangeTerms } from './changes-domain';
import { bankStep, chargeMethodOf, methodForChoice, paymentPanel, type BookingDeps } from './confirm';
import { pausedIn } from '@/modules/markets/outage';
import { bookingChangeRequests, bookingTerms, bookings } from './schema';

/**
 * Change requests on a booking (UI-027; blueprint 03 §5, 04 §5). Either person proposes new terms; the
 * other accepts or declines; the proposer can withdraw. When the client's total goes up, they pay the
 * difference (a `change_funding` payment) before the new terms apply; when it goes down, the difference is
 * refunded. Applying writes a new `booking_terms` version and moves the start if it changed.
 */

type BookingRow = typeof bookings.$inferSelect;
type TermsRow = typeof bookingTerms.$inferSelect;
type ChangeRow = typeof bookingChangeRequests.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const PROPOSE_RULE = { limit: 10, windowSeconds: 60 * 60 };
/** A page opened a while ago offered an earliest time a little before the server's (it moves with the clock). */
const WINDOW_GRACE_MS = 15 * 60_000;

/**
 * The policy the booking was made under (lifecycle review #9): a change is priced with the fees the booking was quoted
 * with, so a scope-only change costs nothing, whatever the market publishes later.
 */
async function bookingPolicy(db: Db, policyVersionId: string) {
  const [row] = await db.select({ fees: marketPolicies.fees, timers: marketPolicies.timers }).from(marketPolicies).where(eq(marketPolicies.id, policyVersionId)).limit(1);
  return row ?? null;
}

type PolicyTimers = { minLeadHours?: number; maxLeadDays?: number } | undefined;

interface Loaded {
  booking: BookingRow;
  terms: TermsRow;
  role: 'poster' | 'helper';
  title: string;
  marketId: string;
}

async function loadBooking(db: Db, userId: string, bookingId: string): Promise<Loaded | null> {
  const [row] = await db
    .select({ booking: bookings, terms: bookingTerms, title: tasks.title, marketId: tasks.marketId })
    .from(bookings)
    .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .where(eq(bookings.id, String(bookingId)))
    .limit(1);
  if (!row) return null;
  const role = row.booking.posterUserId === userId ? 'poster' : row.booking.helperUserId === userId ? 'helper' : null;
  return role ? { ...row, role } : null;
}

const termsOf = (row: TermsRow): ChangeTerms => ({
  pricingType: row.pricingType as 'fixed' | 'hourly',
  priceCents: row.priceCents,
  hourlyRateCents: row.hourlyRateCents,
  estimatedHours: row.estimatedHours,
  hoursCap: row.hoursCap,
  startAt: row.startAt,
  scopeText: row.scopeText,
  expenseAllowanceCents: row.expenseAllowanceCents,
});

const changeTermsOf = (row: ChangeRow): ChangeTerms => ({
  pricingType: row.pricingType as 'fixed' | 'hourly',
  priceCents: row.priceCents,
  hourlyRateCents: row.hourlyRateCents,
  estimatedHours: row.estimatedHours,
  hoursCap: row.hoursCap,
  startAt: row.startAt,
  scopeText: row.scopeText,
  expenseAllowanceCents: row.expenseAllowanceCents,
});

const termsView = (terms: ChangeTerms): ChangeTermsView => ({
  pricing: pricingOf(terms),
  start: terms.startAt.toISOString(),
  scopeText: terms.scopeText,
  expenseAllowanceCents: terms.expenseAllowanceCents,
});

/** Expires open requests past their time (lazily, like the other timers). */
export async function expireDueChanges(db: Db, now: Date, scope: { bookingId?: string } = {}): Promise<void> {
  const conditions = [inArray(bookingChangeRequests.status, [...OPEN_CHANGE_STATUSES]), lte(bookingChangeRequests.expiresAt, now)];
  if (scope.bookingId) conditions.push(eq(bookingChangeRequests.bookingId, scope.bookingId));
  await db.update(bookingChangeRequests).set({ status: 'expired', decidedAt: now, updatedAt: now }).where(and(...conditions));
}

async function openChangeOf(db: Db, bookingId: string): Promise<ChangeRow | undefined> {
  const [row] = await db
    .select()
    .from(bookingChangeRequests)
    .where(and(eq(bookingChangeRequests.bookingId, bookingId), inArray(bookingChangeRequests.status, [...OPEN_CHANGE_STATUSES])))
    .limit(1);
  return row;
}

/** The pointer on the booking page. */
export async function bookingOpenChange(db: Db, bookingId: string, viewerId: string, role: 'poster' | 'helper', now: Date): Promise<BookingView['openChange']> {
  await expireDueChanges(db, now, { bookingId });
  const row = await openChangeOf(db, bookingId);
  if (!row) return undefined;
  return {
    id: row.id,
    status: row.status as 'proposed' | 'accepted_pending_funding',
    fromMe: row.proposedByUserId === viewerId,
    ...(role === 'poster' ? { differenceCents: row.differenceCents } : {}),
  };
}

/** `/app/bookings/[bookingId]/changes/new`. */
export async function getProposeChangePage(db: Db, userId: string, bookingId: string, now: Date): Promise<ProposeChangePageData | null> {
  const loaded = await loadBooking(db, userId, bookingId);
  if (!loaded) return null;
  await expireDueChanges(db, now, { bookingId: loaded.booking.id });
  const [open, policy] = await Promise.all([openChangeOf(db, loaded.booking.id), bookingPolicy(db, loaded.booking.policyVersionId)]);
  const terms = termsOf(loaded.terms);
  const allowedTypes = allowedChangeTypes({ status: loaded.booking.status, pricingType: terms.pricingType, startAt: terms.startAt, now });
  const window = changeScheduleWindow(policy?.timers as PolicyTimers, now);
  return {
    booking: { id: loaded.booking.id, title: loaded.title, viewerRole: loaded.role },
    current: termsView(terms),
    allowedTypes,
    ...(allowedTypes.includes('schedule')
      ? {
          scheduleWindow: { earliest: window.earliest.toISOString(), latest: window.latest.toISOString() },
        }
      : {}),
    ...(open ? { openChangeId: open.id } : {}),
  };
}

type Prepared = { ok: true; loaded: Loaded; terms: ChangeTerms; types: ProposableChangeType[]; before: PriceBreakdown; after: PriceBreakdown; differenceCents: number } | { ok: false; result: ActionResult };

async function prepare(db: Db, userId: string, bookingId: string, input: ProposeChangeInput, now: Date): Promise<Prepared> {
  const parsed = proposeChangeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, result: validationFailed(parsed.error) };
  const loaded = await loadBooking(db, userId, bookingId);
  if (!loaded) return { ok: false, result: { ok: false, code: 'not_allowed' } };
  const current = termsOf(loaded.terms);
  const allowed = allowedChangeTypes({ status: loaded.booking.status, pricingType: current.pricingType, startAt: current.startAt, now });
  if (allowed.length === 0) return { ok: false, result: { ok: false, code: 'not_allowed' } };
  const policy = await bookingPolicy(db, loaded.booking.policyVersionId);
  if (!policy) return { ok: false, result: { ok: false, code: 'unknown' } };
  const window = changeScheduleWindow(policy.timers as PolicyTimers, now);
  const next = proposedTerms(current, parsed.data, allowed, { earliest: new Date(window.earliest.getTime() - WINDOW_GRACE_MS), latest: window.latest });
  if ('fieldErrors' in next) return { ok: false, result: { ok: false, code: 'validation_failed', fieldErrors: next.fieldErrors } };
  const before = loaded.terms.breakdown;
  const after = quoteBreakdown(policy.fees, pricingOf(next.terms), { expenseAllowanceCents: next.terms.expenseAllowanceCents });
  return { ok: true, loaded, terms: next.terms, types: next.types, before, after, differenceCents: after.posterTotalCents - before.posterTotalCents };
}

/** The money before and after (the propose page quotes as the person types). */
export async function quoteChange(db: Db, userId: string, bookingId: string, input: ProposeChangeInput, now: Date): Promise<ChangeQuoteResult> {
  // The message isn't needed for a quote.
  const prepared = await prepare(db, userId, bookingId, { ...input, message: input.message && input.message.trim().length >= 10 ? input.message : 'Quote request.' }, now);
  if (!prepared.ok) return { ok: false, code: prepared.result.ok ? 'unknown' : prepared.result.code === 'validation_failed' || prepared.result.code === 'not_allowed' ? prepared.result.code : 'unknown' };
  return { ok: true, before: prepared.before, after: prepared.after, differenceCents: prepared.loaded.role === 'poster' ? prepared.differenceCents : 0 };
}

export async function proposeChange(db: Db, userId: string, bookingId: string, input: ProposeChangeInput, now: Date): Promise<ActionResult> {
  const prepared = await prepare(db, userId, bookingId, input, now);
  if (!prepared.ok) return prepared.result;
  const { loaded, terms } = prepared;
  await expireDueChanges(db, now, { bookingId: loaded.booking.id });
  if (await openChangeOf(db, loaded.booking.id)) return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimit(db, `changes:${userId}`, PROPOSE_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const id = newId('chg');
  try {
    await db.transaction(async (tx) => {
      await tx.insert(bookingChangeRequests).values({
        id,
        bookingId: loaded.booking.id,
        proposedByUserId: userId,
        status: 'proposed',
        types: prepared.types,
        fromVersion: loaded.booking.termsVersion,
        pricingType: terms.pricingType,
        priceCents: terms.priceCents,
        hourlyRateCents: terms.hourlyRateCents,
        estimatedHours: terms.estimatedHours,
        hoursCap: terms.hoursCap,
        startAt: terms.startAt,
        scopeText: terms.scopeText,
        expenseAllowanceCents: terms.expenseAllowanceCents,
        message: (input.message ?? '').trim(),
        beforeBreakdown: prepared.before,
        afterBreakdown: prepared.after,
        differenceCents: prepared.differenceCents,
        expiresAt: changeExpiresAt('proposed', { status: loaded.booking.status, startAt: loaded.booking.startAt, now }),
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'change.proposed', aggregateType: 'booking', aggregateId: loaded.booking.id, payload: { bookingId: loaded.booking.id, changeId: id, proposedByUserId: userId } });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }
  return { ok: true, code: 'sent', redirectTo: routes.app.bookingChange(loaded.booking.id, id) };
}

function changeView(row: ChangeRow, loaded: Loaded, viewerId: string): ChangeRequestView {
  const fromMe = row.proposedByUserId === viewerId;
  const status = row.status as ChangeStatus;
  const actions: ChangeActionId[] = [];
  if (status === 'proposed' && fromMe) actions.push('withdraw_change');
  if (status === 'proposed' && !fromMe) actions.push('accept_change', 'decline_change');
  if (status === 'accepted_pending_funding' && loaded.role === 'poster') actions.push('pay_change_difference');
  return {
    id: row.id,
    bookingId: row.bookingId,
    status,
    fromMe,
    types: row.types as ProposableChangeType[],
    current: termsView(termsOf(loaded.terms)),
    proposed: termsView(changeTermsOf(row)),
    message: row.message,
    before: row.beforeBreakdown,
    after: row.afterBreakdown,
    ...(loaded.role === 'poster' ? { differenceCents: row.differenceCents } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.expiresAt && (status === 'proposed' || status === 'accepted_pending_funding') ? { expiresAt: row.expiresAt.toISOString() } : {}),
    actions,
  };
}

async function loadChange(db: Db, userId: string, bookingId: string, changeId: string, now: Date): Promise<{ loaded: Loaded; row: ChangeRow } | null> {
  const loaded = await loadBooking(db, userId, bookingId);
  if (!loaded) return null;
  await expireDueChanges(db, now, { bookingId: loaded.booking.id });
  const [row] = await db
    .select()
    .from(bookingChangeRequests)
    .where(and(eq(bookingChangeRequests.id, String(changeId)), eq(bookingChangeRequests.bookingId, loaded.booking.id)))
    .limit(1);
  return row ? { loaded, row } : null;
}

/** `/app/bookings/[bookingId]/changes/[changeId]` for the two people on the booking. */
export async function getChangeReviewPage(db: Db, payments_: PaymentProvider | null, userId: string, bookingId: string, changeId: string, now: Date): Promise<ChangeReviewPageData | null> {
  const found = await loadChange(db, userId, bookingId, changeId, now);
  if (!found) return null;
  const view = changeView(found.row, found.loaded, userId);
  const people = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [found.loaded.booking.posterUserId, found.loaded.booking.helperUserId]));
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? '';
  const paying = found.loaded.role === 'poster' && found.row.differenceCents > 0 && (view.actions.includes('accept_change') || view.actions.includes('pay_change_difference'));
  return {
    booking: {
      id: found.loaded.booking.id,
      title: found.loaded.title,
      viewerRole: found.loaded.role,
      posterDisplayName: nameOf(found.loaded.booking.posterUserId),
      helperDisplayName: nameOf(found.loaded.booking.helperUserId),
    },
    change: view,
    ...(paying && payments_ ? { payment: await paymentPanel(db, userId, payments_) } : {}),
  };
}

/** A booking a change can still apply to: ahead or under way, the work not yet submitted (money review #4). */
const CHANGEABLE = ['confirmed', 'scheduled', 'in_progress'];

/**
 * The new terms version, inside the caller's transaction: false when the terms moved on meanwhile, or the booking
 * is no longer open to a change (canceled, the work submitted, completed: its money is already settled, so a change
 * paid then goes to support to refund instead of re-pricing it).
 */
async function writeChange(tx: Tx, row: ChangeRow, now: Date): Promise<boolean> {
  const [booking] = await tx.select().from(bookings).where(eq(bookings.id, row.bookingId)).limit(1).for('update');
  if (!booking || booking.termsVersion !== row.fromVersion) return false;
  if (!CHANGEABLE.includes(booking.status) || booking.completionSubmittedAt) return false;
  // Still open now: a change withdrawn, declined or expired meanwhile never applies, even if its payment lands later.
  const [current] = await tx.select({ status: bookingChangeRequests.status }).from(bookingChangeRequests).where(eq(bookingChangeRequests.id, row.id)).limit(1).for('update');
  if (!current || !(OPEN_CHANGE_STATUSES as readonly string[]).includes(current.status)) return false;
  const terms = changeTermsOf(row);
  const version = booking.termsVersion + 1;
  await tx.insert(bookingTerms).values({
    id: newId('btm'),
    bookingId: booking.id,
    version,
    pricingType: terms.pricingType,
    priceCents: terms.priceCents,
    hourlyRateCents: terms.hourlyRateCents,
    estimatedHours: terms.estimatedHours,
    hoursCap: terms.hoursCap,
    expenseAllowanceCents: terms.expenseAllowanceCents,
    breakdown: row.afterBreakdown,
    scopeText: terms.scopeText,
    startAt: terms.startAt,
    createdAt: now,
  });
  await tx.update(bookings).set({ termsVersion: version, startAt: terms.startAt, updatedAt: now }).where(eq(bookings.id, booking.id));
  await tx.update(bookingChangeRequests).set({ status: 'applied', decidedAt: now, updatedAt: now }).where(eq(bookingChangeRequests.id, row.id));
  await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'change.applied', aggregateType: 'booking', aggregateId: booking.id, payload: { bookingId: booking.id, changeId: row.id } });
  return true;
}

/** Applies accepted terms: a new terms version (the start moves if it changed); a lower total is refunded. */
async function applyChange(db: Db, payments_: PaymentProvider | null, row: ChangeRow, now: Date): Promise<boolean> {
  const applied = await db.transaction((tx) => writeChange(tx, row, now));
  // The lower total comes back across the booking's charges, each up to what's left of it (money review #2).
  if (applied && row.differenceCents < 0 && payments_) {
    await refundAcross({ db, payments: payments_ }, row.bookingId, await refundableCharges(db, row.bookingId), -row.differenceCents, { reason: 'change_decrease', key: `refund:${row.bookingId}:change:${row.id}` }, now);
  }
  return applied;
}

/** Charges the difference with the chosen card; success applies the change. */
async function chargeDifference(deps: BookingDeps, posterId: string, row: ChangeRow, marketId: string, input: AcceptChangeInput, now: Date): Promise<PaymentAttemptResult> {
  const parsed = acceptChangeInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  // The outage switch: the change waits (still proposed, or accepted and waiting for the money) until it's off.
  const paused = await pausedIn(deps.db, marketId);
  if (paused) return paused;
  if (!parsed.data.payment) return { ok: false, code: 'validation_failed', fieldErrors: { payment: ['required'] } };
  const method = await methodForChoice(deps, posterId, parsed.data.payment);
  if (!('providerRef' in method)) return method;
  const paymentId = newId('pay');
  const idempotencyKey = `change:${row.id}:${paymentId}`;
  // One charge at a time per change (a double tap, a second tab): the change row is locked, and an attempt
  // still being charged, or a change that moved on, refuses this one.
  const started = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select id from booking_change_requests where id = ${row.id} for update`);
    const [current] = await tx.select().from(bookingChangeRequests).where(eq(bookingChangeRequests.id, row.id)).limit(1);
    if (!current || !['proposed', 'accepted_pending_funding'].includes(current.status)) return false;
    if (current.paymentId) {
      const [previous] = await tx.select({ status: payments.status }).from(payments).where(eq(payments.id, current.paymentId)).limit(1);
      if (previous?.status === 'processing' || previous?.status === 'succeeded') return false;
    }
    await tx.insert(payments).values({
      id: paymentId,
      bookingId: row.bookingId,
      purpose: 'change_funding',
      payerUserId: posterId,
      amountCents: row.differenceCents,
      status: 'processing',
      provider: deps.payments.name,
      paymentMethodId: method.paymentMethodId,
      methodRef: method.providerRef,
      methodBrand: method.brand,
      methodLast4: method.last4,
      methodExpMonth: method.expMonth,
      methodExpYear: method.expYear,
      saveMethod: false,
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
    await tx.update(bookingChangeRequests).set({ paymentId, updatedAt: now }).where(eq(bookingChangeRequests.id, row.id));
    return true;
  });
  if (!started) return { ok: false, code: 'not_allowed' };
  const result = await deps.payments.charge({ amountCents: row.differenceCents, method: chargeMethodOf(method), idempotencyKey, description: `TasksNearMe change ${row.id}`, paymentId });
  return settleDifference(deps, row.id, paymentId, result, now);
}

/** A change payment whose charge call never answered, finished from Stripe's event (money review #9). */
export async function finishChangeCharge(deps: BookingDeps, paymentId: string, result: ChargeResult, now: Date): Promise<PaymentAttemptResult> {
  const [change] = await deps.db.select({ id: bookingChangeRequests.id }).from(bookingChangeRequests).where(eq(bookingChangeRequests.paymentId, paymentId)).limit(1);
  if (!change) return { ok: false, code: 'not_found' };
  return settleDifference(deps, change.id, paymentId, result, now);
}

/** A change payment whose money came in (refunds come later): it can't be settled again. */
const SETTLED = ['succeeded', 'partially_refunded', 'refunded'];

/** The answer for a change payment the other path already settled (the browser and Stripe's webhook both finish it). */
async function settledDifference(db: Db, changeId: string): Promise<PaymentAttemptResult> {
  const [row] = await db.select({ status: bookingChangeRequests.status, bookingId: bookingChangeRequests.bookingId }).from(bookingChangeRequests).where(eq(bookingChangeRequests.id, changeId)).limit(1);
  if (!row) return { ok: false, code: 'not_found' };
  return row.status === 'applied' ? { ok: true, code: 'paid', redirectTo: routes.app.booking(row.bookingId) } : { ok: false, code: 'version_conflict' };
}

/**
 * Records the provider's answer on a change payment, once (5.17, T-06's rule): the payment row is locked and
 * the change applied in the same transaction, so when the browser and the webhook finish it at the same moment the
 * second finds it settled and gets the same answer. A failure or a bank step never overwrites a settled payment.
 */
async function settleDifference(deps: BookingDeps, changeId: string, paymentId: string, result: ChargeResult, now: Date): Promise<PaymentAttemptResult> {
  const { db } = deps;
  if (result.status === 'failed' || result.status === 'requires_action') {
    const [updated] = await db
      .update(payments)
      .set(
        result.status === 'failed'
          ? { status: 'failed', failureCode: result.failureCode, providerRef: result.providerRef, updatedAt: now }
          : { status: 'requires_confirmation', providerRef: result.providerRef, updatedAt: now },
      )
      .where(and(eq(payments.id, paymentId), notInArray(payments.status, SETTLED)))
      .returning({ id: payments.id });
    if (!updated) return settledDifference(db, changeId);
    if (result.status === 'failed') return { ok: false, code: result.failureCode };
    return { ok: false, code: 'requires_bank_verification', verification: await bankStep(deps.payments, paymentId, result.providerRef) };
  }
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from payments where id = ${paymentId} for update`);
    const [payment] = await tx.select({ status: payments.status }).from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment) return { kind: 'missing' as const };
    if (SETTLED.includes(payment.status)) return { kind: 'settled' as const };
    await tx.update(payments).set({ status: 'succeeded', providerRef: result.providerRef, failureCode: null, updatedAt: now }).where(eq(payments.id, paymentId));
    const [row] = await tx.select().from(bookingChangeRequests).where(eq(bookingChangeRequests.id, changeId)).limit(1);
    if (!row || !(await writeChange(tx, row, now))) {
      // Paid but the terms moved on: support refunds it.
      await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'payment.refund_needed', aggregateType: 'payment', aggregateId: paymentId, payload: { paymentId, changeId } });
      return { kind: 'conflict' as const };
    }
    return { kind: 'applied' as const, bookingId: row.bookingId };
  });
  if (outcome.kind === 'applied') return { ok: true, code: 'paid', redirectTo: routes.app.booking(outcome.bookingId) };
  if (outcome.kind === 'settled') return settledDifference(db, changeId);
  return { ok: false, code: outcome.kind === 'conflict' ? 'version_conflict' : 'not_found' };
}

/**
 * The other person accepts. No difference, or a lower total: the change applies (a decrease is refunded).
 * A higher total: the client pays now (when they're the one accepting), or the change waits for their
 * payment for 24 h (when the helper accepts).
 */
export async function acceptChange(deps: BookingDeps, userId: string, bookingId: string, changeId: string, input: AcceptChangeInput, now: Date): Promise<PaymentAttemptResult> {
  const found = await loadChange(deps.db, userId, bookingId, changeId, now);
  if (!found) return { ok: false, code: 'not_found' };
  const { loaded, row } = found;
  if (row.status !== 'proposed') return { ok: false, code: row.status === 'expired' ? 'expired' : 'not_allowed' };
  if (row.proposedByUserId === userId) return { ok: false, code: 'not_allowed' };
  if (row.fromVersion !== loaded.booking.termsVersion) return { ok: false, code: 'version_conflict' };
  if (row.differenceCents <= 0) {
    return (await applyChange(deps.db, deps.payments, row, now)) ? { ok: true, code: 'updated', redirectTo: routes.app.booking(loaded.booking.id) } : { ok: false, code: 'version_conflict' };
  }
  if (loaded.role === 'poster') return chargeDifference(deps, userId, row, loaded.booking.marketId, input, now);
  await deps.db
    .update(bookingChangeRequests)
    .set({ status: 'accepted_pending_funding', expiresAt: changeExpiresAt('pending_funding', { status: loaded.booking.status, startAt: loaded.booking.startAt, now }), updatedAt: now })
    .where(and(eq(bookingChangeRequests.id, row.id), eq(bookingChangeRequests.status, 'proposed')));
  return { ok: true, code: 'updated', redirectTo: routes.app.booking(loaded.booking.id) };
}

/** The client pays the difference on a change the helper accepted. */
export async function payChangeDifference(deps: BookingDeps, userId: string, bookingId: string, changeId: string, input: AcceptChangeInput, now: Date): Promise<PaymentAttemptResult> {
  const found = await loadChange(deps.db, userId, bookingId, changeId, now);
  if (!found) return { ok: false, code: 'not_found' };
  if (found.loaded.role !== 'poster') return { ok: false, code: 'not_allowed' };
  if (found.row.status !== 'accepted_pending_funding') return { ok: false, code: found.row.status === 'expired' ? 'expired' : 'not_allowed' };
  return chargeDifference(deps, userId, found.row, found.loaded.booking.marketId, input, now);
}

/** After the dev bank dialog on a change payment. */
export async function finishChangeVerification(deps: BookingDeps, userId: string, bookingId: string, changeId: string, paymentId: string, outcome: 'approved' | 'failed', now: Date): Promise<PaymentAttemptResult> {
  const found = await loadChange(deps.db, userId, bookingId, changeId, now);
  if (!found || found.loaded.role !== 'poster') return { ok: false, code: 'not_found' };
  const [payment] = await deps.db
    .select()
    .from(payments)
    .where(and(eq(payments.id, String(paymentId)), eq(payments.payerUserId, userId), eq(payments.purpose, 'change_funding')))
    .limit(1);
  if (!payment?.providerRef || found.row.paymentId !== payment.id) return { ok: false, code: 'not_allowed' };
  // Stripe's webhook (or another tab) finished it first: the answer this call would have given.
  if (SETTLED.includes(payment.status)) return settledDifference(deps.db, found.row.id);
  if (payment.status === 'failed') return { ok: false, code: payment.failureCode === 'insufficient_funds' ? 'insufficient_funds' : 'payment_declined' };
  if (payment.status !== 'requires_confirmation') return { ok: false, code: 'not_allowed' };
  const completed = await deps.payments.completeAction({ providerRef: payment.providerRef, outcome });
  const result: ChargeResult =
    completed.status === 'succeeded' ? { status: 'succeeded', providerRef: payment.providerRef } : { status: 'failed', providerRef: payment.providerRef, failureCode: completed.failureCode };
  return settleDifference(deps, found.row.id, payment.id, result, now);
}

async function close(db: Db, userId: string, bookingId: string, changeId: string, status: 'declined' | 'withdrawn', now: Date): Promise<ActionResult> {
  const found = await loadChange(db, userId, bookingId, changeId, now);
  if (!found) return { ok: false, code: 'not_allowed' };
  const mine = found.row.proposedByUserId === userId;
  const allowed = status === 'withdrawn' ? mine && found.row.status === 'proposed' : !mine && found.row.status === 'proposed';
  if (!allowed) return { ok: false, code: 'not_allowed' };
  await db
    .update(bookingChangeRequests)
    .set({ status, decidedAt: now, updatedAt: now })
    .where(and(eq(bookingChangeRequests.id, found.row.id), eq(bookingChangeRequests.status, 'proposed')));
  return { ok: true, code: 'updated', redirectTo: routes.app.booking(found.loaded.booking.id) };
}

export const declineChange = (db: Db, userId: string, bookingId: string, changeId: string, now: Date) => close(db, userId, bookingId, changeId, 'declined', now);
export const withdrawChange = (db: Db, userId: string, bookingId: string, changeId: string, now: Date) => close(db, userId, bookingId, changeId, 'withdrawn', now);
