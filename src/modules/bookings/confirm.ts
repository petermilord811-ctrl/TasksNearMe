import { and, asc, desc, eq, inArray, isNull, lte, ne, notInArray, sql } from 'drizzle-orm';
import { posterIdentityRequirement } from '@/modules/trust/poster-risk';
import type {
  ActionResult,
  BookingConfirmPageData,
  BookingUnavailableReason,
  CardBrand,
  CategorySlug,
  ConfirmBookingInput,
  FailedPaymentAttempt,
  OfferStatus,
  PaymentAttemptResult,
  PaymentPanelData,
  PriceBreakdown,
  SavedPaymentMethod,
} from '@/contracts';
import { confirmBookingInputSchema, routes } from '@/contracts';
import type { ChargeResult, PaymentProvider } from '@/integrations/payments';
import { customerFor, newCardCollection } from '@/modules/payments/cards';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { categories } from '@/modules/markets/schema';
import { expireDueOffers, loadHelperState } from '@/modules/offers/helper';
import { offerPricing } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { cancellationSummary, quoteBreakdown } from '@/modules/payments/fees';
import { paymentCustomers, paymentMethods, payments } from '@/modules/payments/schema';
import { closeTaskInvites } from '@/modules/invites/holds';
import { cancelIntents } from '@/modules/payments/cancel-intents';
import { availableCredit, ensureWelcomeCredit } from '@/modules/credits/service';
import { bankStep, chargeMethodOf } from '@/modules/payments/cards';

export { bankStep, chargeMethodOf, customerFor, newCardCollection } from '@/modules/payments/cards';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { findTaskWithPublicView } from '@/modules/tasks/queries';
import { bookingThreadLink, postEvent } from '@/modules/messaging/service';
import { tasks } from '@/modules/tasks/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import { toMessageSegments } from '@/modules/trust/message-segments';
import { fieldError, validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { isUniqueViolation } from '@/platform/db/errors';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { pausedIn } from '@/modules/markets/outage';
import { bookingTerms, bookings } from './schema';
import { ONE_TIME_CHARGE_PLAN, chargeSchedule, firstChargeAt, paysLater } from './series-domain';

/**
 * Booking an offer (blueprint 02 J4, 03 §4 and §6.1, 04 §4): the confirmation page, paying, the bank
 * step, and the 30-minute `pending_funding` hold. The charge is captured at confirmation; on success
 * the booking is `confirmed`, the offer `accepted`, the other offers declined, and the task `assigned`.
 */

export interface BookingDeps {
  db: Db;
  payments: PaymentProvider;
}

const ACTIVE_OFFER: OfferStatus[] = ['pending', 'stale'];
/** Paying: 10 attempts per 10 minutes per poster. */
const CONFIRM_RATE_LIMIT = { limit: 10, windowSeconds: 600 };

type TaskRow = typeof tasks.$inferSelect;
type OfferRow = typeof offers.$inferSelect;
type BookingRow = typeof bookings.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type BookingConfirmPage = { kind: 'page'; data: BookingConfirmPageData } | { kind: 'booked'; bookingId: string };

// ---- Reads ---------------------------------------------------------------------------------------

async function loadContext(db: Db, posterId: string, taskId: string, offerId: string) {
  const [row] = await db
    .select({ task: tasks, categorySlug: categories.slug, offer: offers })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .innerJoin(offers, eq(offers.taskId, tasks.id))
    .where(and(eq(tasks.id, taskId), eq(tasks.posterUserId, posterId), eq(offers.id, offerId)))
    .limit(1);
  return row && row.task.status !== 'draft' ? { ...row, categorySlug: row.categorySlug as CategorySlug } : null;
}

async function liveBooking(db: Db | Tx, taskId: string): Promise<BookingRow | null> {
  const [row] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.taskId, taskId), ne(bookings.status, 'canceled')))
    .limit(1);
  return row ?? null;
}

/** Bookings still unpaid after their hold are canceled (`funding_failed`); their open payments too. */
export async function expireUnfundedBookings(db: Db, now: Date, scope: { taskId?: string } = {}): Promise<void> {
  const conditions = [eq(bookings.status, 'pending_funding'), lte(bookings.fundingExpiresAt, now)];
  if (scope.taskId) conditions.push(eq(bookings.taskId, scope.taskId));
  const expired = await db
    .update(bookings)
    .set({ status: 'canceled', cancelReason: 'funding_failed', canceledAt: now, fundingExpiresAt: null, updatedAt: now })
    .where(and(...conditions))
    .returning({ id: bookings.id, taskId: bookings.taskId });
  if (expired.length === 0) return;
  const ids = expired.map((row) => row.id);
  await db
    .update(payments)
    .set({ status: 'canceled', updatedAt: now })
    .where(and(inArray(payments.bookingId, ids), inArray(payments.status, ['requires_confirmation', 'processing'])));
  await db.insert(outboxEvents).values(
    expired.map((row) => ({
      id: newId('evt'),
      type: 'booking.funding_expired',
      aggregateType: 'booking',
      aggregateId: row.id,
      payload: { bookingId: row.id, taskId: row.taskId },
    })),
  );
}

function unavailableReason(task: TaskRow, offer: OfferRow, live: BookingRow | null, now: Date): BookingUnavailableReason | undefined {
  if (live && live.status !== 'pending_funding') return 'task_booked';
  if (task.status === 'assigned') return 'task_booked';
  if (task.status !== 'open' || task.windowEnd <= now) return 'task_closed';
  switch (offer.status) {
    case 'withdrawn':
      return 'offer_withdrawn';
    case 'expired':
      return 'offer_expired';
    case 'declined':
      return 'offer_declined';
    case 'stale':
      return 'offer_stale';
    case 'accepted':
      return 'task_booked';
    default:
      return offer.expiresAt <= now ? 'offer_expired' : undefined;
  }
}

/** The client's saved cards and the new-card form (also used to pay change differences). */
export async function paymentPanel(db: Db, userId: string, provider: PaymentProvider): Promise<PaymentPanelData> {
  const rows = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.userId, userId), isNull(paymentMethods.detachedAt), eq(paymentMethods.provider, provider.name)))
    .orderBy(desc(paymentMethods.isDefault), asc(paymentMethods.createdAt));
  const methods: SavedPaymentMethod[] = rows.map((row) => ({
    id: row.id,
    brand: row.brand as CardBrand,
    last4: row.last4,
    expMonth: row.expMonth,
    expYear: row.expYear,
    isDefault: row.isDefault,
  }));
  return { methods, newCard: newCardCollection(provider) };
}

async function lastFailure(db: Db, bookingId: string): Promise<FailedPaymentAttempt | undefined> {
  const [latest] = await db.select().from(payments).where(eq(payments.bookingId, bookingId)).orderBy(desc(payments.createdAt)).limit(1);
  if (!latest || latest.status !== 'failed' || !latest.failureCode) return undefined;
  return {
    code: latest.failureCode as FailedPaymentAttempt['code'],
    method: { brand: (latest.methodBrand ?? 'visa') as CardBrand, ...(latest.methodLast4 ? { last4: latest.methodLast4 } : {}) },
    at: latest.updatedAt.toISOString(),
  };
}

function breakdownFor(fees: Parameters<typeof quoteBreakdown>[0], task: TaskRow, offer: OfferRow): PriceBreakdown {
  return quoteBreakdown(fees, offerPricing(offer), { expenseAllowanceCents: task.expenseAllowanceCents });
}

/**
 * The confirmation page for the poster's own task and one of its offers (null: not theirs, or gone).
 * Once that offer is booked, the page sends the poster to the booking instead.
 */
/** A booking far ahead is paid later: when its card is charged, and the deadline (blueprint 04). */
export function paysLaterOf(start: Date, now: Date): BookingConfirmPageData['paysLater'] {
  if (!paysLater(start, now)) return undefined;
  const { deadline } = chargeSchedule(ONE_TIME_CHARGE_PLAN, start);
  const chargeAt = firstChargeAt(ONE_TIME_CHARGE_PLAN, start, now);
  return chargeAt ? { chargeAt: chargeAt.toISOString(), payBy: deadline.toISOString() } : undefined;
}

export async function getBookingConfirmPage(
  deps: BookingDeps,
  posterId: string,
  taskId: string,
  offerId: string,
  now: Date,
): Promise<BookingConfirmPage | null> {
  const { db } = deps;
  if (!(await loadContext(db, posterId, taskId, offerId))) return null;
  await expireDueOffers(db, now, { taskId });
  await expireUnfundedBookings(db, now, { taskId });
  const ctx = await loadContext(db, posterId, taskId, offerId);
  if (!ctx) return null;
  const live = await liveBooking(db, taskId);
  if (live && live.status !== 'pending_funding' && live.offerId === offerId) return { kind: 'booked', bookingId: live.id };

  const [policy, found, helpers] = await Promise.all([
    getPublishedPolicy(ctx.task.marketId, db),
    findTaskWithPublicView(db, taskId),
    getHelperSummaries([ctx.offer.helperUserId], db),
  ]);
  const helper = helpers.get(ctx.offer.helperUserId);
  if (!policy || !found || !helper) return null;

  const breakdown = breakdownFor(policy.fees, ctx.task, ctx.offer);
  // A first-time client's welcome credit (when the market offers one), shown with the price.
  await ensureWelcomeCredit(db, posterId, ctx.task.marketId, now);
  const credit = await availableCredit(db, posterId, now);
  const proposedStart = ctx.offer.proposedStart.toISOString();
  const pending =
    live && live.status === 'pending_funding' && live.offerId === offerId && live.fundingExpiresAt
      ? { bookingId: live.id, expiresAt: live.fundingExpiresAt.toISOString(), failure: await lastFailure(db, live.id) }
      : null;
  const unavailable = unavailableReason(ctx.task, ctx.offer, live, now);
  const later = paysLaterOf(ctx.offer.proposedStart, now);
  const { id, title, categorySlug, location, schedule } = found.view;

  return {
    kind: 'page',
    data: {
      task: { id, title, categorySlug, location, schedule },
      offer: {
        id: ctx.offer.id,
        revision: ctx.offer.revision,
        helper,
        pricing: offerPricing(ctx.offer),
        proposedStart,
        message: toMessageSegments(ctx.offer.message, { mask: true }),
        // Masked like the message (sweep MN2b): contact details in a brings line reach no one before booking.
        brings: ctx.offer.brings.map((item) => maskContactDetails(item).text),
      },
      breakdown,
      cancellation: cancellationSummary(policy.cancellation, breakdown, proposedStart),
      payment: await paymentPanel(db, posterId, deps.payments),
      ...(credit ? { credit } : {}),
      ...(later ? { paysLater: later } : {}),
      ...(pending
        ? { pending: { bookingId: pending.bookingId, expiresAt: pending.expiresAt, ...(pending.failure ? { lastFailure: pending.failure } : {}) } }
        : {}),
      ...(unavailable ? { unavailable } : {}),
    },
  };
}

// ---- Paying ---------------------------------------------------------------------------------------

export interface ChosenMethod {
  providerRef: string;
  brand: CardBrand;
  last4: string;
  expMonth: number;
  expYear: number;
  paymentMethodId: string | null;
  save: boolean;
  /** Stripe: the customer the card is attached to. */
  customerRef?: string;
}

async function chosenMethod(deps: BookingDeps, posterId: string, input: ConfirmBookingInput): Promise<ChosenMethod | ActionResult> {
  return methodForChoice(deps, posterId, input.payment);
}

/** The card a client chose (a saved one, or a development test card); also used to pay change differences. */
export async function methodForChoice(deps: BookingDeps, posterId: string, choice: ConfirmBookingInput['payment']): Promise<ChosenMethod | ActionResult> {
  if (choice.kind === 'saved') {
    const [method] = await deps.db
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.id, choice.methodId), eq(paymentMethods.userId, posterId), isNull(paymentMethods.detachedAt)))
      .limit(1);
    if (!method) return fieldError('payment.methodId', 'invalid');
    const customer = method.provider === 'stripe' ? await customerFor(deps.db, posterId, 'stripe') : null;
    return {
      ...(customer?.ref ? { customerRef: customer.ref } : {}),
      providerRef: method.providerRef,
      brand: method.brand as CardBrand,
      last4: method.last4,
      expMonth: method.expMonth,
      expYear: method.expYear,
      paymentMethodId: method.id,
      save: false,
    };
  }
  if (choice.kind === 'stripe_card') {
    // A card from Stripe's form: checked, and attached to the person's customer (made the first time).
    if (!deps.payments.prepareCard) return fieldError('payment', 'invalid');
    const customer = await customerFor(deps.db, posterId, deps.payments.name);
    const prepared = await deps.payments.prepareCard({ paymentMethodRef: choice.paymentMethodId, customer });
    // Kept even when the card is refused: deleting the account deletes the customer at Stripe.
    if (!customer.ref && prepared.customerRef) await deps.db.insert(paymentCustomers).values({ userId: posterId, provider: deps.payments.name, customerRef: prepared.customerRef }).onConflictDoNothing();
    if (!prepared.ok) return prepared.reason === 'declined' ? { ok: false, code: prepared.failureCode } : fieldError('payment', 'invalid');
    return { ...prepared.card, paymentMethodId: null, save: choice.save, customerRef: prepared.customerRef };
  }
  if (!deps.payments.collectDevCard) return fieldError('payment.card', 'not_supported');
  const card = deps.payments.collectDevCard(choice.card);
  return { ...card, paymentMethodId: null, save: choice.save };
}

/** Books and pays: creates (or reuses) the 30-minute hold, then charges the chosen card. */
export async function confirmBooking(
  deps: BookingDeps,
  posterId: string,
  taskId: string,
  offerId: string,
  input: ConfirmBookingInput,
  now: Date,
): Promise<PaymentAttemptResult> {
  const { db } = deps;
  const parsed = confirmBookingInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const limited = await consumeRateLimit(db, `booking-confirm:${posterId}`, CONFIRM_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };

  if (!(await loadContext(db, posterId, String(taskId), String(offerId)))) return { ok: false, code: 'not_found' };
  await expireDueOffers(db, now, { taskId });
  await expireUnfundedBookings(db, now, { taskId });
  const ctx = await loadContext(db, posterId, String(taskId), String(offerId));
  if (!ctx) return { ok: false, code: 'not_found' };

  const existing = await liveBooking(db, ctx.task.id);
  // A second click after success: the booking is already there.
  if (existing && existing.status !== 'pending_funding' && existing.offerId === ctx.offer.id) {
    return { ok: true, code: 'booked', redirectTo: routes.app.booking(existing.id) };
  }
  if (unavailableReason(ctx.task, ctx.offer, existing, now)) return { ok: false, code: 'not_allowed' };
  if (await isBlockedBetween(db, posterId, ctx.offer.helperUserId)) return { ok: false, code: 'not_allowed' };
  if (ctx.offer.revision !== parsed.data.offerRevision) return { ok: false, code: 'version_conflict' };

  // The helper must still be bookable for this category (ID, payouts, background check where needed).
  const helper = await loadHelperState(db, ctx.offer.helperUserId, now);
  if (!helper.facts.bookableCategories.includes(ctx.categorySlug)) return { ok: false, code: 'not_allowed' };
  // The outage switch: no new booking (or a new try at paying for a held one) until it's off.
  const paused = await pausedIn(db, ctx.task.marketId);
  if (paused) return paused;

  const policy = await getPublishedPolicy(ctx.task.marketId, db);
  if (!policy) return { ok: false, code: 'unknown' };
  const breakdown = breakdownFor(policy.fees, ctx.task, ctx.offer);
  const amountCents = breakdown.posterChargedCents ?? breakdown.posterTotalCents;
  // Risk asked this client to verify their ID first; the amount counts for new accounts.
  if (await posterIdentityRequirement(db, posterId, now, amountCents)) return { ok: false, code: 'identity_required' };
  const method = await chosenMethod(deps, posterId, parsed.data);
  if ('ok' in method) return method;

  const pricing = offerPricing(ctx.offer);
  // More than 14 days ahead: booked now, paid later (the card is kept and charged 72 h before).
  if (paysLater(ctx.offer.proposedStart, now)) return scheduleBooking(deps, posterId, ctx, method, pricing, breakdown, policy.id, now);

  let hold: { bookingId: string; paymentId: string; idempotencyKey: string; replaced: (string | null)[] };
  try {
    hold = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from tasks where id = ${ctx.task.id} for update`);
      // Still open under the lock (security review): a cancel or another booking that landed after the page was read.
      const [fresh] = await tx.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, ctx.task.id)).limit(1);
      if (fresh?.status !== 'open') throw new HoldConflict();
      let booking = await liveBooking(tx, ctx.task.id);
      if (booking && booking.status !== 'pending_funding') throw new HoldConflict();
      // The poster switched to another offer while a hold was open: release it.
      if (booking && booking.offerId !== ctx.offer.id) {
        await tx
          .update(bookings)
          .set({ status: 'canceled', cancelReason: 'funding_failed', canceledAt: now, fundingExpiresAt: null, updatedAt: now })
          .where(eq(bookings.id, booking.id));
        booking = null;
      }
      // Another attempt on this hold is being charged (a double tap, a second tab): never charge twice.
      // The task lock above orders the attempts; the second one sees the first's payment in flight.
      if (booking) {
        const [inFlight] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(and(eq(payments.bookingId, booking.id), eq(payments.status, 'processing')))
          .limit(1);
        if (inFlight) throw new HoldConflict();
      }
      const bookingId = booking?.id ?? newId('bkg');
      if (!booking) {
        await tx.insert(bookings).values({
          id: bookingId,
          taskId: ctx.task.id,
          offerId: ctx.offer.id,
          posterUserId: posterId,
          helperUserId: ctx.offer.helperUserId,
          marketId: ctx.task.marketId,
          policyVersionId: policy.id,
          status: 'pending_funding',
          startAt: ctx.offer.proposedStart,
          fundingExpiresAt: new Date(now.getTime() + policy.timers.pendingFundingMinutes * 60_000),
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(bookingTerms).values({
          id: newId('btm'),
          bookingId,
          version: 1,
          pricingType: pricing.type,
          priceCents: pricing.type === 'fixed' ? pricing.priceCents : null,
          hourlyRateCents: pricing.type === 'hourly' ? pricing.rateCents : null,
          estimatedHours: pricing.type === 'hourly' ? pricing.estimatedHours : null,
          hoursCap: pricing.type === 'hourly' ? pricing.hoursCap : null,
          expenseAllowanceCents: ctx.task.expenseAllowanceCents,
          breakdown,
          scopeText: ctx.task.description,
          startAt: ctx.offer.proposedStart,
          createdAt: now,
        });
      }
      // A new attempt replaces one still waiting for the bank (its intent is canceled at the provider below).
      const replaced = await tx
        .update(payments)
        .set({ status: 'canceled', updatedAt: now })
        .where(and(eq(payments.bookingId, bookingId), eq(payments.status, 'requires_confirmation')))
        .returning({ providerRef: payments.providerRef });
      const paymentId = newId('pay');
      const idempotencyKey = `${bookingId}:${paymentId}`;
      await tx.insert(payments).values({
        id: paymentId,
        bookingId,
        purpose: 'booking_funding',
        payerUserId: posterId,
        amountCents,
        status: 'processing',
        provider: deps.payments.name,
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
      return { bookingId, paymentId, idempotencyKey, replaced: replaced.map((row) => row.providerRef) };
    });
  } catch (error) {
    if (error instanceof HoldConflict || isUniqueViolation(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }

  // Left live, a bank step finished later would charge the client a second time (repeats review #5).
  await cancelIntents(deps.payments, hold.replaced, `booking ${hold.bookingId}`);
  const result = await deps.payments.charge({
    amountCents,
    method: chargeMethodOf(method),
    idempotencyKey: hold.idempotencyKey,
    description: `TasksNearMe booking ${hold.bookingId}`,
    paymentId: hold.paymentId,
  });
  return settle(deps, posterId, hold.paymentId, result, now);
}

class HoldConflict extends Error {}

/** The client's saved card for this method: the one they picked, or the new one, kept now (a booking paid later needs it). */
async function keptCard(tx: Tx, posterId: string, provider: string, method: ChosenMethod, now: Date): Promise<string> {
  if (method.paymentMethodId) return method.paymentMethodId;
  const [same] = await tx
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.userId, posterId), eq(paymentMethods.providerRef, method.providerRef), isNull(paymentMethods.detachedAt)))
    .limit(1);
  if (same) return same.id;
  const [anyMethod] = await tx.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.userId, posterId), isNull(paymentMethods.detachedAt))).limit(1);
  const id = newId('pm');
  await tx.insert(paymentMethods).values({ id, userId: posterId, provider, providerRef: method.providerRef, brand: method.brand, last4: method.last4, expMonth: method.expMonth, expYear: method.expYear, isDefault: !anyMethod, createdAt: now });
  return id;
}

/**
 * A booking made more than 14 days ahead (blueprint 04, "Phase 2: save the card at booking, charge 72 h before"):
 * booked like a paid offer (the offer accepted, the others declined, the task assigned, the helper told) but
 * `scheduled`, with the card kept and charged by the job 72 h before (`scheduled.ts`).
 */
async function scheduleBooking(
  deps: BookingDeps,
  posterId: string,
  ctx: NonNullable<Awaited<ReturnType<typeof loadContext>>>,
  method: ChosenMethod,
  pricing: ReturnType<typeof offerPricing>,
  breakdown: PriceBreakdown,
  policyId: string,
  now: Date,
): Promise<PaymentAttemptResult> {
  const start = ctx.offer.proposedStart;
  const chargeAt = firstChargeAt(ONE_TIME_CHARGE_PLAN, start, now);
  if (!chargeAt) return { ok: false, code: 'not_allowed' };
  let bookingId: string;
  try {
    bookingId = await deps.db.transaction(async (tx) => {
      await tx.execute(sql`select id from tasks where id = ${ctx.task.id} for update`);
      const live = await liveBooking(tx, ctx.task.id);
      if (live && live.status !== 'pending_funding') throw new HoldConflict();
      // A hold opened earlier for this task (the poster paid now, then changed their mind): released.
      if (live) await tx.update(bookings).set({ status: 'canceled', cancelReason: 'funding_failed', canceledAt: now, fundingExpiresAt: null, updatedAt: now }).where(eq(bookings.id, live.id));
      const cardId = await keptCard(tx, posterId, deps.payments.name, method, now);
      const id = newId('bkg');
      await tx.insert(bookings).values({
        id,
        taskId: ctx.task.id,
        offerId: ctx.offer.id,
        posterUserId: posterId,
        helperUserId: ctx.offer.helperUserId,
        marketId: ctx.task.marketId,
        policyVersionId: policyId,
        status: 'scheduled',
        startAt: start,
        fundingDueAt: chargeAt,
        fundingExpiresAt: chargeSchedule(ONE_TIME_CHARGE_PLAN, start).deadline,
        fundingMethodId: cardId,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(bookingTerms).values({
        id: newId('btm'),
        bookingId: id,
        version: 1,
        pricingType: pricing.type,
        priceCents: pricing.type === 'fixed' ? pricing.priceCents : null,
        hourlyRateCents: pricing.type === 'hourly' ? pricing.rateCents : null,
        estimatedHours: pricing.type === 'hourly' ? pricing.estimatedHours : null,
        hoursCap: pricing.type === 'hourly' ? pricing.hoursCap : null,
        expenseAllowanceCents: ctx.task.expenseAllowanceCents,
        breakdown,
        scopeText: ctx.task.description,
        startAt: start,
        createdAt: now,
      });
      await tx.update(offers).set({ status: 'accepted', closedAt: now, updatedAt: now }).where(eq(offers.id, ctx.offer.id));
      const others = await tx
        .update(offers)
        .set({ status: 'declined', closedAt: now, updatedAt: now })
        .where(and(eq(offers.taskId, ctx.task.id), inArray(offers.status, ACTIVE_OFFER)))
        .returning({ id: offers.id, helperUserId: offers.helperUserId });
      await tx.update(tasks).set({ status: 'assigned', offerCount: 0, updatedAt: now, version: sql`${tasks.version} + 1` }).where(eq(tasks.id, ctx.task.id));
      await tx.insert(outboxEvents).values([
        { id: newId('evt'), type: 'booking.confirmed', aggregateType: 'booking', aggregateId: id, payload: { bookingId: id, taskId: ctx.task.id, posterUserId: posterId, helperUserId: ctx.offer.helperUserId } },
        ...others.map((offer) => ({ id: newId('evt'), type: 'offer.declined', aggregateType: 'offer', aggregateId: offer.id, payload: { offerId: offer.id, taskId: ctx.task.id, helperUserId: offer.helperUserId, reason: 'task_booked' } })),
      ]);
      await tx.insert(auditLog).values({ id: newId('aud'), actorId: posterId, actorRole: 'user', action: 'booking.scheduled', targetType: 'booking', targetId: id });
      await postEvent(tx, bookingThreadLink({ id, taskId: ctx.task.id, posterUserId: posterId, helperUserId: ctx.offer.helperUserId }), 'system', { type: 'booked' }, now, posterId);
      return id;
    });
  } catch (error) {
    if (error instanceof HoldConflict || isUniqueViolation(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }
  return { ok: true, code: 'booked', redirectTo: routes.app.booking(bookingId) };
}

/** After the bank step (3-D Secure). */
export async function finishBankVerification(
  deps: BookingDeps,
  posterId: string,
  paymentId: string,
  outcome: 'approved' | 'failed',
  now: Date,
): Promise<PaymentAttemptResult> {
  const { db } = deps;
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, String(paymentId)), eq(payments.payerUserId, posterId)))
    .limit(1);
  if (!payment || !payment.bookingId || !payment.providerRef) return { ok: false, code: 'not_found' };
  // Stripe's webhook (or another tab) finished it first: the answer this call would have given (T-06).
  if (SETTLED.includes(payment.status)) return settledResult(db, payment.bookingId);
  if (payment.status === 'failed') return { ok: false, code: payment.failureCode === 'insufficient_funds' ? 'insufficient_funds' : 'payment_declined' };
  if (payment.status !== 'requires_confirmation') return { ok: false, code: 'not_allowed' };
  await expireUnfundedBookings(db, now);
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, payment.bookingId)).limit(1);
  if (!booking || !AWAITING_MONEY.includes(booking.status)) return { ok: false, code: 'expired' };

  const completed = await deps.payments.completeAction({ providerRef: payment.providerRef, outcome: outcome === 'approved' ? 'approved' : 'failed' });
  const result: ChargeResult =
    completed.status === 'succeeded'
      ? { status: 'succeeded', providerRef: payment.providerRef }
      : { status: 'failed', providerRef: payment.providerRef, failureCode: completed.failureCode };
  return settle(deps, posterId, payment.id, result, now);
}

/**
 * A held booking whose money is in (a captured invite authorization): confirms it exactly as a paid offer
 * does (the task is assigned, other offers are declined, the thread opens).
 */
export async function confirmFundedBooking(deps: BookingDeps, posterId: string, paymentId: string, providerRef: string, now: Date): Promise<PaymentAttemptResult> {
  return settle(deps, posterId, paymentId, { status: 'succeeded', providerRef }, now);
}

/** Bookings a successful payment confirms: a hold being paid, or a booking paid later (`scheduled`). */
const AWAITING_MONEY = ['pending_funding', 'scheduled'];
/** A payment whose money came in (refunds happen later): nothing about it can be settled again. */
const SETTLED = ['succeeded', 'partially_refunded', 'refunded'];

/**
 * The answer for a payment the other path already settled (the browser's return from the bank and Stripe's
 * webhook both finish a payment, in either order or at once): booked, or what became of the booking since.
 */
async function settledResult(db: Db, bookingId: string): Promise<PaymentAttemptResult> {
  const [booking] = await db.select({ id: bookings.id, status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return { ok: false, code: 'not_found' };
  // Paid after the hold ran out (support refunds it).
  if (booking.status === 'canceled') return { ok: false, code: 'expired' };
  if (AWAITING_MONEY.includes(booking.status)) return { ok: false, code: 'not_allowed' };
  return { ok: true, code: 'booked', redirectTo: routes.app.booking(booking.id) };
}

/**
 * Records the provider's answer. Success confirms the booking in one transaction. A `scheduled` booking (a
 * regular visit, a one-time booking far ahead) was already booked: it's `booking.funded`, quietly, not a new
 * booking for the helper to hear about. A payment already settled stays as it is, whatever arrives later: a
 * second success changes nothing, and a late failure is ignored (T-06).
 */
export async function settle(deps: BookingDeps, posterId: string, paymentId: string, result: ChargeResult, now: Date): Promise<PaymentAttemptResult> {
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
    if (!updated) {
      const [settled] = await db.select({ bookingId: payments.bookingId }).from(payments).where(eq(payments.id, paymentId)).limit(1);
      return settled?.bookingId ? settledResult(db, settled.bookingId) : { ok: false, code: 'not_found' };
    }
    if (result.status === 'failed') return { ok: false, code: result.failureCode };
    return { ok: false, code: 'requires_bank_verification', verification: await bankStep(deps.payments, paymentId, result.providerRef) };
  }

  const outcome = await db.transaction(async (tx) => {
    // Locked: the browser and the webhook can settle the same payment at the same moment; the second waits here
    // and finds it settled (without the lock both confirmed the booking, or the second asked for a refund).
    await tx.execute(sql`select id from payments where id = ${paymentId} for update`);
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment?.bookingId) return { kind: 'missing' as const };
    if (SETTLED.includes(payment.status)) return { kind: 'settled' as const, bookingId: payment.bookingId };
    // The booking too (lifecycle review #10): a cancel or the hold's expiry landing between this read and the update
    // below was overwritten to `confirmed`. Now it either lands first (and this sees it) or waits for this.
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, payment.bookingId)).limit(1).for('update');
    await tx.update(payments).set({ status: 'succeeded', providerRef: result.providerRef, failureCode: null, updatedAt: now }).where(eq(payments.id, paymentId));
    if (!booking || !AWAITING_MONEY.includes(booking.status)) {
      // Paid after the hold ran out: support refunds it.
      await tx.insert(outboxEvents).values({
        id: newId('evt'),
        type: 'payment.refund_needed',
        aggregateType: 'payment',
        aggregateId: paymentId,
        payload: { paymentId, bookingId: payment.bookingId, reason: 'hold_expired' },
      });
      return { kind: 'expired' as const };
    }
    await tx.execute(sql`select id from tasks where id = ${booking.taskId} for update`);
    // The task can still take the booking (sweep PT7): a client who canceled the task while the bank's step was open gets
    // no booking, and no charge, back. Under the task's lock, so a cancel lands wholly before or after this. Open (offers,
    // invites), a draft (a rebooking's, until paid) or assigned (a visit paid later) can; canceled, expired or done can't.
    // The money that came in goes back on its own (payment.refund_needed).
    const [task] = await tx.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, booking.taskId)).limit(1);
    if (!task || !['open', 'draft', 'assigned'].includes(task.status)) {
      await tx
        .update(bookings)
        .set({ status: 'canceled', cancelReason: 'poster_early', canceledBy: 'poster', canceledAt: now, fundingExpiresAt: null, fundingDueAt: null, updatedAt: now })
        .where(eq(bookings.id, booking.id));
      await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'payment.refund_needed', aggregateType: 'payment', aggregateId: paymentId, payload: { paymentId, bookingId: booking.id, reason: 'task_closed' } });
      return { kind: 'expired' as const };
    }
    await tx
      .update(bookings)
      .set({ status: 'confirmed', confirmedAt: now, fundingExpiresAt: null, fundingDueAt: null, fundingFailure: null, updatedAt: now })
      .where(eq(bookings.id, booking.id));
    if (booking.offerId) {
      await tx.update(offers).set({ status: 'accepted', closedAt: now, updatedAt: now }).where(eq(offers.id, booking.offerId));
    }
    const others = await tx
      .update(offers)
      .set({ status: 'declined', closedAt: now, updatedAt: now })
      .where(and(eq(offers.taskId, booking.taskId), inArray(offers.status, ACTIVE_OFFER)))
      .returning({ id: offers.id, helperUserId: offers.helperUserId });
    await tx
      .update(tasks)
      .set({ status: 'assigned', offerCount: 0, updatedAt: now, version: sql`${tasks.version} + 1` })
      .where(eq(tasks.id, booking.taskId));
    if (payment.saveMethod && payment.methodRef && payment.methodBrand && payment.methodLast4) {
      const [anyMethod] = await tx
        .select({ id: paymentMethods.id })
        .from(paymentMethods)
        .where(and(eq(paymentMethods.userId, posterId), isNull(paymentMethods.detachedAt)))
        .limit(1);
      await tx.insert(paymentMethods).values({
        id: newId('pm'),
        userId: posterId,
        provider: payment.provider,
        providerRef: payment.methodRef,
        brand: payment.methodBrand,
        last4: payment.methodLast4,
        expMonth: payment.methodExpMonth ?? 12,
        expYear: payment.methodExpYear ?? 2030,
        isDefault: !anyMethod,
        createdAt: now,
      });
    }
    await tx.insert(outboxEvents).values([
      {
        id: newId('evt'),
        type: booking.status === 'scheduled' ? 'booking.funded' : 'booking.confirmed',
        aggregateType: 'booking',
        aggregateId: booking.id,
        payload: { bookingId: booking.id, taskId: booking.taskId, posterUserId: booking.posterUserId, helperUserId: booking.helperUserId },
      },
      ...others.map((offer) => ({
        id: newId('evt'),
        type: 'offer.declined',
        aggregateType: 'offer',
        aggregateId: offer.id,
        payload: { offerId: offer.id, taskId: booking.taskId, helperUserId: offer.helperUserId, reason: 'task_booked' },
      })),
    ]);
    await tx.insert(auditLog).values({
      id: newId('aud'),
      actorId: posterId,
      actorRole: 'user',
      action: 'booking.confirmed',
      targetType: 'booking',
      targetId: booking.id,
    });
    if (booking.status !== 'scheduled') await postEvent(tx, bookingThreadLink(booking), 'system', { type: 'booked' }, now, posterId);
    return { kind: 'booked' as const, bookingId: booking.id, taskId: booking.taskId };
  });

  if (outcome.kind === 'booked') {
    // Booked: the task's other invites end and let go of the client's card now, not in 48–72 hours (repeats review #11).
    await closeTaskInvites(db, outcome.taskId, now, deps.payments);
    return { ok: true, code: 'booked', redirectTo: routes.app.booking(outcome.bookingId) };
  }
  if (outcome.kind === 'settled') return settledResult(db, outcome.bookingId);
  return { ok: false, code: outcome.kind === 'expired' ? 'expired' : 'not_found' };
}
