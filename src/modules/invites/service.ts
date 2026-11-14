import { and, desc, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { posterIdentityRequirement } from '@/modules/trust/poster-risk';
import type {
  ActionResult,
  AvailabilitySlotView,
  CategorySlug,
  CounterInviteInput,
  InvitableTask,
  InviteActionId,
  InviteStatus,
  InviteView,
  PaymentAttemptResult,
  PriceBreakdown,
  PricingInput,
  RequestHelperInput,
  RequestHelperPageData,
} from '@/contracts';
import { counterInviteInputSchema, requestHelperInputSchema, routes } from '@/contracts';
import type { PaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { availabilityPosts } from '@/modules/availability/schema';
import { bookSlot, holdSlot, openSlotOf, releaseSlot, slotViewOf } from '@/modules/availability/slots';
import { bankStep, chargeMethodOf, confirmFundedBooking, customerFor, methodForChoice, paymentPanel, type BookingDeps } from '@/modules/bookings/confirm';
import { clientSummary } from '@/modules/bookings/hub';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { categories } from '@/modules/markets/schema';
import { loadHelperState } from '@/modules/offers/helper';
import { quoteBreakdown } from '@/modules/payments/fees';
import { payments } from '@/modules/payments/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { tasks } from '@/modules/tasks/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { isUniqueViolation } from '@/platform/db/errors';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { pausedIn } from '@/modules/markets/outage';
import { invites } from './schema';

/**
 * Direct invites (UI-025; blueprint 02 J3, 03 §3). The card is authorized for the total when the client
 * sends the invite and captured when the helper accepts; declining, cancelling and expiry release it. A
 * counter that raises the total is authorized again on the same card. Accepting creates the booking through
 * the confirmation's success path, so it's confirmed exactly like a paid offer.
 */

type InviteRow = typeof invites.$inferSelect;
const OPEN: InviteStatus[] = ['authorizing', 'sent', 'countered'];
const HOUR = 3_600_000;
const REQUEST_RULE = { limit: 10, windowSeconds: 60 * 60 };
/** An invite still waiting for its first authorization (a bank check left open) expires after 30 min. */
const AUTHORIZING_MS = 30 * 60_000;

/** Someone else requested the slot between the page and the request. */
class SlotTaken extends Error {}

/** A task fits a slot when it's in the slot's category and its window overlaps the slot. */
const fitsSlot = (task: Pick<InvitableTask, 'categorySlug' | 'windowStart' | 'windowEnd'>, slot: AvailabilitySlotView) =>
  task.categorySlug === slot.categorySlug && new Date(task.windowStart) < new Date(slot.end) && new Date(task.windowEnd) > new Date(slot.start);

/** 48 h after it's sent, or 2 h before the start, whichever is sooner; a counter waits 24 h. */
export function inviteExpiresAt(kind: 'sent' | 'countered', start: Date, now: Date): Date {
  const wait = now.getTime() + (kind === 'sent' ? 48 : 24) * HOUR;
  return new Date(Math.min(wait, start.getTime() - 2 * HOUR));
}

const pricingFrom = (type: string | null, price: number | null, rate: number | null, estimated: number | null, cap: number | null): PricingInput =>
  type === 'hourly' ? { type: 'hourly', rateCents: rate ?? 0, estimatedHours: estimated ?? cap ?? 1, hoursCap: cap ?? 1 } : { type: 'fixed', priceCents: price ?? 0 };

const pricingColumns = (pricing: PricingInput) => ({
  pricingType: pricing.type,
  priceCents: pricing.type === 'fixed' ? pricing.priceCents : null,
  hourlyRateCents: pricing.type === 'hourly' ? pricing.rateCents : null,
  estimatedHours: pricing.type === 'hourly' ? pricing.estimatedHours : null,
  hoursCap: pricing.type === 'hourly' ? pricing.hoursCap : null,
});

/** Only helpers whose public profile is live can be requested (not paused, suspended, or closed accounts). */
async function helperIdOf(db: Db, handle: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: helperProfiles.userId })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .where(and(eq(helperProfiles.handle, String(handle)), eq(helperProfiles.status, 'active'), eq(users.status, 'active')))
    .limit(1);
  return row?.userId ?? null;
}

async function feesOf(db: Db, marketId: string) {
  return (await getPublishedPolicy(marketId, db))?.fees ?? null;
}

/** Releases an invite's authorization (declined, cancelled, expired, replaced). */
async function release(db: Db, payments_: PaymentProvider | null, paymentId: string | null, now: Date): Promise<void> {
  if (!paymentId) return;
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment || payment.status !== 'authorized') return;
  if (payment.providerRef && payments_) await payments_.cancelAuthorization({ authorizationRef: payment.providerRef });
  await db.update(payments).set({ status: 'canceled', updatedAt: now }).where(eq(payments.id, payment.id));
}

/** Expires open invites past their time and releases their holds (lazily and from the job runner). */
export async function expireDueInvites(db: Db, payments_: PaymentProvider | null, now: Date): Promise<void> {
  const due = await db
    .update(invites)
    .set({ status: 'expired', decidedAt: now, updatedAt: now })
    .where(and(inArray(invites.status, OPEN), lte(invites.expiresAt, now)))
    .returning({ paymentId: invites.paymentId, slotId: invites.slotId });
  for (const row of due) {
    await release(db, payments_, row.paymentId, now);
    await releaseSlot(db, row.slotId, now);
  }
}

// ---- Requesting ---------------------------------------------------------------------------------------

/** The client's open tasks in the helper's bookable categories. */
async function invitableTasks(db: Db, posterId: string, helperId: string, now: Date): Promise<(InvitableTask & { marketId: string })[]> {
  const state = await loadHelperState(db, helperId, now);
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, slug: categories.slug, windowStart: tasks.windowStart, windowEnd: tasks.windowEnd, marketId: tasks.marketId })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    // Hidden tasks can't be shown to a helper through an invite either.
    .where(and(eq(tasks.posterUserId, posterId), eq(tasks.status, 'open'), isNull(tasks.hiddenAt)))
    .orderBy(desc(tasks.createdAt));
  return rows
    .filter((row) => state.facts.bookableCategories.includes(row.slug as CategorySlug))
    .map((row) => ({ id: row.id, title: row.title, categorySlug: row.slug as CategorySlug, windowStart: row.windowStart.toISOString(), windowEnd: row.windowEnd.toISOString(), marketId: row.marketId }));
}

/** The helper's listed price per category: the fixed price, or the hourly rate with their minimum hours. */
export async function listedPricingOf(db: Db, helperId: string): Promise<Partial<Record<CategorySlug, PricingInput>>> {
  const services = await db
    .select({ slug: categories.slug, pricingType: helperServices.pricingType, fromPriceCents: helperServices.fromPriceCents, hourlyRateCents: helperServices.hourlyRateCents, minHours: helperServices.minHours })
    .from(helperServices)
    .innerJoin(categories, eq(categories.id, helperServices.categoryId))
    .where(eq(helperServices.userId, helperId));
  const listed: Partial<Record<CategorySlug, PricingInput>> = {};
  for (const service of services) {
    listed[service.slug as CategorySlug] =
      service.pricingType === 'hourly'
        ? { type: 'hourly', rateCents: service.hourlyRateCents ?? 0, estimatedHours: service.minHours ?? 2, hoursCap: Math.max(service.minHours ?? 2, 2) }
        : { type: 'fixed', priceCents: service.fromPriceCents ?? 0 };
  }
  return listed;
}

/** `routes.app.requestHelper(handle, { fromBookingId })` (null: no such helper, or the client blocked/was blocked). */
export async function getRequestHelperPage(
  db: Db,
  payments_: PaymentProvider,
  posterId: string,
  handle: string,
  options: { fromBookingId?: string; slotId?: string },
  now: Date,
): Promise<RequestHelperPageData | null> {
  const helperId = await helperIdOf(db, handle);
  if (!helperId || helperId === posterId || (await isBlockedBetween(db, posterId, helperId))) return null;
  const [summaries, tasksFound, listedPricing, panel] = await Promise.all([
    getHelperSummaries([helperId], db),
    invitableTasks(db, posterId, helperId, now),
    listedPricingOf(db, helperId),
    paymentPanel(db, posterId, payments_),
  ]);
  const helper = summaries.get(helperId);
  if (!helper) return null;
  let suggestion: RequestHelperPageData['suggestion'];
  if (options.fromBookingId) {
    const [past] = await db
      .select({ terms: bookingTerms, slug: categories.slug })
      .from(bookings)
      .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
      .innerJoin(tasks, eq(tasks.id, bookings.taskId))
      .innerJoin(categories, eq(categories.id, tasks.categoryId))
      .where(and(eq(bookings.id, String(options.fromBookingId)), eq(bookings.posterUserId, posterId), eq(bookings.helperUserId, helperId)))
      .limit(1);
    if (past) {
      const sameCategory = tasksFound.find((task) => task.categorySlug === past.slug);
      suggestion = {
        ...(sameCategory ? { taskId: sameCategory.id } : {}),
        pricing: pricingFrom(past.terms.pricingType, past.terms.priceCents, past.terms.hourlyRateCents, past.terms.estimatedHours, past.terms.hoursCap),
      };
    }
  }
  // A slot (UI-029): only the tasks that fit it, with the slot's price.
  let slot: AvailabilitySlotView | undefined;
  if (options.slotId) {
    const open = await openSlotOf(db, options.slotId, helperId, now);
    if (open) slot = slotViewOf(open.row, open.categorySlug);
  }
  const offered = slot ? tasksFound.filter((task) => fitsSlot(task, slot)) : tasksFound;
  if (slot) suggestion = { ...(offered[0] ? { taskId: offered[0].id } : {}), pricing: slot.pricing };
  return {
    helper,
    tasks: offered.map(({ marketId: _market, ...task }) => task),
    listedPricing,
    ...(suggestion ? { suggestion } : {}),
    ...(slot ? { slot } : {}),
    ...(options.slotId && !slot ? { slotUnavailable: true } : {}),
    payment: panel,
  };
}

/** The client's breakdown for a price (in the task's market; the default market without a task). */
export async function quoteInvite(db: Db, posterId: string, pricing: PricingInput, marketId?: string): Promise<PriceBreakdown | null> {
  const market = marketId ?? (await db.select({ marketId: tasks.marketId }).from(tasks).where(eq(tasks.posterUserId, posterId)).limit(1))[0]?.marketId;
  const fees = market ? await feesOf(db, market) : null;
  return fees ? quoteBreakdown(fees, pricing) : null;
}

/** Sends an invite: the card is authorized for the total (or a bank step comes first). */
export async function requestHelper(deps: BookingDeps, posterId: string, handle: string, input: RequestHelperInput, now: Date): Promise<PaymentAttemptResult> {
  const { db } = deps;
  const parsed = requestHelperInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const helperId = await helperIdOf(db, handle);
  if (!helperId || helperId === posterId || (await isBlockedBetween(db, posterId, helperId))) return { ok: false, code: 'not_allowed' };
  const task = (await invitableTasks(db, posterId, helperId, now)).find((item) => item.id === parsed.data.taskId);
  if (!task) return { ok: false, code: 'validation_failed', fieldErrors: { taskId: ['invalid'] } };
  const start = new Date(parsed.data.start);
  if (start < new Date(task.windowStart) || start > new Date(task.windowEnd) || start.getTime() - now.getTime() < 2 * HOUR) {
    return { ok: false, code: 'validation_failed', fieldErrors: { start: ['invalid'] } };
  }
  // A slot request: the slot must still be open, in the task's category, and the start inside it.
  let slotId: string | null = null;
  if (parsed.data.slotId) {
    const open = await openSlotOf(db, parsed.data.slotId, helperId, now);
    if (!open) return { ok: false, code: 'not_allowed' };
    if (!fitsSlot(task, slotViewOf(open.row, open.categorySlug))) return { ok: false, code: 'validation_failed', fieldErrors: { taskId: ['invalid'] } };
    if (start < open.row.startAt || start >= open.row.endAt) return { ok: false, code: 'validation_failed', fieldErrors: { start: ['out_of_range'] } };
    slotId = open.row.id;
  }
  // The outage switch: no new request (and no hold on the card) until it's off.
  const paused = await pausedIn(db, task.marketId);
  if (paused) return paused;
  const fees = await feesOf(db, task.marketId);
  if (!fees) return { ok: false, code: 'unknown' };
  // Risk asked this client to verify their ID first; the amount counts for new accounts.
  if (await posterIdentityRequirement(db, posterId, now, quoteBreakdown(fees, parsed.data.pricing).posterTotalCents)) return { ok: false, code: 'identity_required' };
  const limited = await consumeRateLimit(db, `invites:${posterId}`, REQUEST_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const method = await methodForChoice(deps, posterId, parsed.data.payment);
  if (!('providerRef' in method)) return method;

  const breakdown = quoteBreakdown(fees, parsed.data.pricing);
  const inviteId = newId('inv');
  const paymentId = newId('pay');
  try {
    await db.transaction(async (tx) => {
      await tx.insert(payments).values({
        id: paymentId,
        purpose: 'invite_authorization',
        payerUserId: posterId,
        amountCents: breakdown.posterTotalCents,
        status: 'processing',
        provider: deps.payments.name,
        paymentMethodId: method.paymentMethodId,
        methodRef: method.providerRef,
        methodBrand: method.brand,
        methodLast4: method.last4,
        methodExpMonth: method.expMonth,
        methodExpYear: method.expYear,
        saveMethod: false,
        idempotencyKey: `invite:${inviteId}:${paymentId}`,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(invites).values({
        id: inviteId,
        taskId: task.id,
        posterUserId: posterId,
        helperUserId: helperId,
        status: 'authorizing',
        source: slotId ? 'availability' : 'profile',
        ...pricingColumns(parsed.data.pricing),
        startAt: start,
        message: parsed.data.message?.trim() || null,
        breakdown,
        paymentId,
        slotId,
        expiresAt: new Date(now.getTime() + AUTHORIZING_MS),
        createdAt: now,
        updatedAt: now,
      });
      if (slotId && !(await holdSlot(tx, slotId, now))) throw new SlotTaken();
    });
  } catch (error) {
    if (error instanceof SlotTaken || isUniqueViolation(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }
  const result = await deps.payments.authorize({ amountCents: breakdown.posterTotalCents, method: chargeMethodOf(method), idempotencyKey: `invite:${inviteId}:${paymentId}`, description: `TasksNearMe invite ${inviteId}` });
  return settleRequest(db, inviteId, paymentId, result.status === 'authorized' ? { status: 'authorized', providerRef: result.providerRef } : result, now, deps.payments);
}

/** A hold not decided yet: the first answer decides it (5.17: the browser and Stripe's webhook both finish one). */
const UNDECIDED = ['processing', 'requires_confirmation'];

/** The answer for a first hold the other path already settled: sent, or why it isn't. */
async function settledRequest(db: Db, inviteId: string): Promise<PaymentAttemptResult> {
  const [invite] = await db.select({ status: invites.status, taskId: invites.taskId, paymentId: invites.paymentId }).from(invites).where(eq(invites.id, inviteId)).limit(1);
  if (!invite) return { ok: false, code: 'not_found' };
  if (invite.status === 'auth_failed') {
    const [payment] = invite.paymentId ? await db.select({ failureCode: payments.failureCode }).from(payments).where(eq(payments.id, invite.paymentId)).limit(1) : [];
    return { ok: false, code: payment?.failureCode === 'insufficient_funds' ? 'insufficient_funds' : 'payment_declined' };
  }
  if (invite.status === 'expired') return { ok: false, code: 'expired' };
  if (invite.status === 'authorizing') return { ok: false, code: 'not_allowed' };
  // Sent, or answered since: the hold went through.
  return { ok: true, code: 'sent', redirectTo: routes.app.task(invite.taskId) };
}

/**
 * Records the bank's answer on an invite's first hold, once: the invite moves on from `authorizing` only for the
 * first answer (a guarded update), so a second finisher, at the same moment or later, changes nothing and gets the
 * same answer, and a late failure never undoes a hold that went through.
 */
async function settleRequest(
  db: Db,
  inviteId: string,
  paymentId: string,
  result: { status: 'authorized'; providerRef: string } | { status: 'failed'; providerRef: string; failureCode: 'payment_declined' | 'insufficient_funds' } | { status: 'requires_action'; providerRef: string },
  now: Date,
  provider?: PaymentProvider,
): Promise<PaymentAttemptResult> {
  if (result.status === 'requires_action') {
    const [waiting] = await db
      .update(payments)
      .set({ status: 'requires_confirmation', providerRef: result.providerRef, updatedAt: now })
      .where(and(eq(payments.id, paymentId), inArray(payments.status, UNDECIDED)))
      .returning({ id: payments.id });
    if (!waiting) return settledRequest(db, inviteId);
    return { ok: false, code: 'requires_bank_verification', verification: provider ? await bankStep(provider, paymentId, result.providerRef) : { paymentId, kind: 'dev' } };
  }
  if (result.status === 'failed') {
    const [failed] = await db.update(invites).set({ status: 'auth_failed', decidedAt: now, updatedAt: now }).where(and(eq(invites.id, inviteId), eq(invites.status, 'authorizing'))).returning({ slotId: invites.slotId });
    if (!failed) return settledRequest(db, inviteId);
    await db.update(payments).set({ status: 'failed', failureCode: result.failureCode, providerRef: result.providerRef, updatedAt: now }).where(eq(payments.id, paymentId));
    await releaseSlot(db, failed.slotId ?? null, now);
    return { ok: false, code: result.failureCode };
  }
  const [invite] = await db
    .update(invites)
    .set({ status: 'sent', expiresAt: sql`least(${now.toISOString()}::timestamptz + interval '48 hours', ${invites.startAt} - interval '2 hours')`, updatedAt: now })
    .where(and(eq(invites.id, inviteId), eq(invites.status, 'authorizing')))
    .returning();
  if (!invite) return settledRequest(db, inviteId);
  await db.update(payments).set({ status: 'authorized', providerRef: result.providerRef, updatedAt: now }).where(eq(payments.id, paymentId));
  await db.insert(outboxEvents).values({ id: newId('evt'), type: 'invite.sent', aggregateType: 'invite', aggregateId: invite.id, payload: { inviteId: invite.id, taskId: invite.taskId, posterUserId: invite.posterUserId, helperUserId: invite.helperUserId } });
  return { ok: true, code: 'sent', redirectTo: routes.app.task(invite.taskId) };
}

/** After the dev bank dialog on an invite's first authorization. */
export async function finishRequestVerification(deps: BookingDeps, posterId: string, paymentId: string, outcome: 'approved' | 'failed', now: Date): Promise<PaymentAttemptResult> {
  const [payment] = await deps.db.select().from(payments).where(and(eq(payments.id, String(paymentId)), eq(payments.payerUserId, posterId), eq(payments.purpose, 'invite_authorization'))).limit(1);
  const [invite] = payment ? await deps.db.select().from(invites).where(eq(invites.paymentId, payment.id)).limit(1) : [];
  if (!payment?.providerRef || !invite) return { ok: false, code: 'not_allowed' };
  // Stripe's webhook (or another tab) finished it first: the answer this call would have given (5.17).
  if (invite.status !== 'authorizing' || payment.status !== 'requires_confirmation') return settledRequest(deps.db, invite.id);
  const completed = await deps.payments.completeAction({ providerRef: payment.providerRef, outcome });
  return settleRequest(deps.db, invite.id, payment.id, completed.status === 'succeeded' ? { status: 'authorized', providerRef: payment.providerRef } : { status: 'failed', providerRef: payment.providerRef, failureCode: completed.failureCode === 'insufficient_funds' ? 'insufficient_funds' : 'payment_declined' }, now);
}

// ---- Answering ------------------------------------------------------------------------------------------

async function ownInvite(db: Db, payments_: PaymentProvider | null, userId: string, inviteId: string, side: 'poster' | 'helper', now: Date): Promise<InviteRow | null> {
  await expireDueInvites(db, payments_, now);
  const [row] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.id, String(inviteId)), eq(side === 'poster' ? invites.posterUserId : invites.helperUserId, userId)))
    .limit(1);
  return row ?? null;
}

/** Creates the booking with these terms, captures the hold, and confirms it like a paid offer. */
async function book(deps: BookingDeps, invite: InviteRow, pricing: PricingInput, start: Date, breakdown: PriceBreakdown, now: Date): Promise<PaymentAttemptResult> {
  const { db } = deps;
  const [payment] = invite.paymentId ? await db.select().from(payments).where(eq(payments.id, invite.paymentId)).limit(1) : [];
  if (!payment?.providerRef || payment.status !== 'authorized') return { ok: false, code: 'not_allowed' };
  const [task] = await db.select().from(tasks).where(eq(tasks.id, invite.taskId)).limit(1);
  const policy = task ? await getPublishedPolicy(task.marketId, db) : null;
  if (!task || !policy || task.status !== 'open') return { ok: false, code: 'not_allowed' };
  const bookingId = newId('bkg');
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from tasks where id = ${task.id} for update`);
      await tx.insert(bookings).values({
        id: bookingId,
        taskId: task.id,
        offerId: null,
        posterUserId: invite.posterUserId,
        helperUserId: invite.helperUserId,
        marketId: task.marketId,
        policyVersionId: policy.id,
        status: 'pending_funding',
        startAt: start,
        fundingExpiresAt: new Date(now.getTime() + policy.timers.pendingFundingMinutes * 60_000),
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(bookingTerms).values({
        id: newId('btm'),
        bookingId,
        version: 1,
        ...pricingColumns(pricing),
        expenseAllowanceCents: task.expenseAllowanceCents,
        breakdown,
        scopeText: task.description,
        startAt: start,
        createdAt: now,
      });
      // Once captured, the hold is the booking's funding charge (refunds and payouts look for it).
      await tx.update(payments).set({ bookingId, purpose: 'booking_funding', amountCents: breakdown.posterTotalCents, status: 'processing', updatedAt: now }).where(eq(payments.id, payment.id));
    });
  } catch (error) {
    // The task got another booking meanwhile.
    if (isUniqueViolation(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }
  const captured = await deps.payments.capture({ authorizationRef: payment.providerRef, amountCents: breakdown.posterTotalCents, idempotencyKey: `capture:${invite.id}` });
  if (captured.status === 'failed') {
    await db.update(payments).set({ status: 'failed', failureCode: captured.failureCode, updatedAt: now }).where(eq(payments.id, payment.id));
    await db.update(bookings).set({ status: 'canceled', cancelReason: 'funding_failed', canceledAt: now, fundingExpiresAt: null, updatedAt: now }).where(eq(bookings.id, bookingId));
    return { ok: false, code: captured.failureCode };
  }
  const result = await confirmFundedBooking(deps, invite.posterUserId, payment.id, payment.providerRef, now);
  if (!result.ok) return result;
  await db.update(invites).set({ status: 'accepted', bookingId, decidedAt: now, updatedAt: now }).where(eq(invites.id, invite.id));
  await bookSlot(db, invite.slotId, now);
  await db.insert(outboxEvents).values({ id: newId('evt'), type: 'invite.accepted', aggregateType: 'invite', aggregateId: invite.id, payload: { inviteId: invite.id, bookingId, posterUserId: invite.posterUserId, helperUserId: invite.helperUserId } });
  return { ok: true, code: 'booked', redirectTo: routes.app.booking(bookingId) };
}

/** The helper accepts: the hold is captured and the booking confirmed. */
export async function acceptInvite(deps: BookingDeps, helperId: string, inviteId: string, now: Date): Promise<ActionResult> {
  const invite = await ownInvite(deps.db, deps.payments, helperId, inviteId, 'helper', now);
  if (!invite) return { ok: false, code: 'not_allowed' };
  if (invite.status !== 'sent') return { ok: false, code: invite.status === 'expired' ? 'expired' : 'not_allowed' };
  if (await isBlockedBetween(deps.db, invite.posterUserId, helperId)) return { ok: false, code: 'not_allowed' };
  const [task] = await deps.db.select({ slug: categories.slug, marketId: tasks.marketId }).from(tasks).innerJoin(categories, eq(categories.id, tasks.categoryId)).where(eq(tasks.id, invite.taskId)).limit(1);
  const state = await loadHelperState(deps.db, helperId, now);
  if (!task || !state.facts.bookableCategories.includes(task.slug as CategorySlug)) return { ok: false, code: 'not_allowed' };
  // The outage switch: the request waits (its hold stays until it expires) rather than becoming a booking.
  const paused = await pausedIn(deps.db, task.marketId);
  if (paused) return paused;
  const pricing = pricingFrom(invite.pricingType, invite.priceCents, invite.hourlyRateCents, invite.estimatedHours, invite.hoursCap);
  const result = await book(deps, invite, pricing, invite.startAt, invite.breakdown, now);
  return 'verification' in result ? { ok: false, code: 'unknown' } : result;
}

async function closeInvite(db: Db, payments_: PaymentProvider | null, invite: InviteRow, status: 'declined' | 'canceled', from: InviteStatus[], now: Date): Promise<ActionResult> {
  if (!from.includes(invite.status as InviteStatus)) return { ok: false, code: invite.status === 'expired' ? 'expired' : 'not_allowed' };
  const [closed] = await db
    .update(invites)
    .set({ status, decidedAt: now, updatedAt: now })
    .where(and(eq(invites.id, invite.id), inArray(invites.status, from)))
    .returning({ id: invites.id });
  if (!closed) return { ok: false, code: 'not_allowed' };
  await release(db, payments_, invite.paymentId, now);
  await releaseSlot(db, invite.slotId, now);
  return { ok: true, code: 'updated' };
}

/** The helper canceled a requested slot: its waiting request is declined and the client's hold released. */
export async function closeSlotRequests(db: Db, payments_: PaymentProvider | null, slotId: string, now: Date): Promise<void> {
  const closed = await db
    .update(invites)
    .set({ status: 'declined', decidedAt: now, updatedAt: now })
    .where(and(eq(invites.slotId, slotId), inArray(invites.status, OPEN)))
    .returning({ id: invites.id, paymentId: invites.paymentId, posterUserId: invites.posterUserId, helperUserId: invites.helperUserId });
  for (const invite of closed) await release(db, payments_, invite.paymentId, now);
}

export async function declineInvite(db: Db, payments_: PaymentProvider | null, helperId: string, inviteId: string, now: Date): Promise<ActionResult> {
  const invite = await ownInvite(db, payments_, helperId, inviteId, 'helper', now);
  return invite ? closeInvite(db, payments_, invite, 'declined', ['sent'], now) : { ok: false, code: 'not_allowed' };
}

export async function cancelInvite(db: Db, payments_: PaymentProvider | null, posterId: string, inviteId: string, now: Date): Promise<ActionResult> {
  const invite = await ownInvite(db, payments_, posterId, inviteId, 'poster', now);
  return invite ? closeInvite(db, payments_, invite, 'canceled', ['sent', 'countered'], now) : { ok: false, code: 'not_allowed' };
}

export async function declineCounter(db: Db, payments_: PaymentProvider | null, posterId: string, inviteId: string, now: Date): Promise<ActionResult> {
  const invite = await ownInvite(db, payments_, posterId, inviteId, 'poster', now);
  return invite ? closeInvite(db, payments_, invite, 'declined', ['countered'], now) : { ok: false, code: 'not_allowed' };
}

/** The helper proposes a new price and/or start (the client has 24 h to answer). */
export async function counterInvite(db: Db, payments_: PaymentProvider | null, helperId: string, inviteId: string, input: CounterInviteInput, now: Date): Promise<ActionResult> {
  const parsed = counterInviteInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const invite = await ownInvite(db, payments_, helperId, inviteId, 'helper', now);
  if (!invite) return { ok: false, code: 'not_allowed' };
  if (invite.status !== 'sent') return { ok: false, code: invite.status === 'expired' ? 'expired' : 'not_allowed' };
  const [task] = await db.select({ marketId: tasks.marketId, windowStart: tasks.windowStart, windowEnd: tasks.windowEnd }).from(tasks).where(eq(tasks.id, invite.taskId)).limit(1);
  const fees = task ? await feesOf(db, task.marketId) : null;
  if (!task || !fees) return { ok: false, code: 'unknown' };
  const pricing = parsed.data.pricing ?? pricingFrom(invite.pricingType, invite.priceCents, invite.hourlyRateCents, invite.estimatedHours, invite.hoursCap);
  const start = parsed.data.start ? new Date(parsed.data.start) : invite.startAt;
  if (start < task.windowStart || start > task.windowEnd || start.getTime() - now.getTime() < 2 * HOUR) return { ok: false, code: 'validation_failed', fieldErrors: { start: ['invalid'] } };
  const counterBreakdown = quoteBreakdown(fees, pricing);
  const columns = pricingColumns(pricing);
  const [updated] = await db
    .update(invites)
    .set({
      status: 'countered',
      counterPricingType: columns.pricingType,
      counterPriceCents: columns.priceCents,
      counterHourlyRateCents: columns.hourlyRateCents,
      counterEstimatedHours: columns.estimatedHours,
      counterHoursCap: columns.hoursCap,
      counterStartAt: start,
      counterMessage: parsed.data.message.trim(),
      counterBreakdown,
      expiresAt: inviteExpiresAt('countered', start, now),
      updatedAt: now,
    })
    .where(and(eq(invites.id, invite.id), eq(invites.status, 'sent')))
    .returning({ id: invites.id });
  if (!updated) return { ok: false, code: 'not_allowed' };
  await db.insert(outboxEvents).values({ id: newId('evt'), type: 'invite.countered', aggregateType: 'invite', aggregateId: invite.id, payload: { inviteId: invite.id, posterUserId: invite.posterUserId, helperUserId: helperId } });
  return { ok: true, code: 'sent' };
}

const counterPricingOf = (invite: InviteRow) => pricingFrom(invite.counterPricingType, invite.counterPriceCents, invite.counterHourlyRateCents, invite.counterEstimatedHours, invite.counterHoursCap);

/**
 * The client accepts the counter: the booking confirms at once. A higher total is authorized again on the
 * same card first (the old hold is released), maybe with a bank step.
 */
export async function acceptCounter(deps: BookingDeps, posterId: string, inviteId: string, now: Date): Promise<PaymentAttemptResult> {
  const { db } = deps;
  const invite = await ownInvite(db, deps.payments, posterId, inviteId, 'poster', now);
  if (!invite) return { ok: false, code: 'not_allowed' };
  if (invite.status !== 'countered' || !invite.counterBreakdown) return { ok: false, code: invite.status === 'expired' ? 'expired' : 'not_allowed' };
  const [market] = await db.select({ id: tasks.marketId }).from(tasks).where(eq(tasks.id, invite.taskId)).limit(1);
  const paused = market ? await pausedIn(db, market.id) : null;
  if (paused) return paused;
  const [held] = invite.paymentId ? await db.select().from(payments).where(eq(payments.id, invite.paymentId)).limit(1) : [];
  if (!held?.methodRef) return { ok: false, code: 'not_allowed' };
  if (invite.counterBreakdown.posterTotalCents > held.amountCents) {
    const paymentId = newId('pay');
    const { id: _old, createdAt: _created, updatedAt: _updated, providerRef: _ref, failureCode: _failure, ...method } = held;
    await db.insert(payments).values({ ...method, id: paymentId, amountCents: invite.counterBreakdown.posterTotalCents, status: 'processing', idempotencyKey: `invite:${invite.id}:${paymentId}`, createdAt: now, updatedAt: now });
    // The same card, on the person's customer (Stripe needs it to use the card again).
    const customer = deps.payments.name === 'stripe' ? await customerFor(db, posterId, 'stripe') : null;
    const result = await deps.payments.authorize({ amountCents: invite.counterBreakdown.posterTotalCents, method: chargeMethodOf({ providerRef: held.methodRef, ...(customer?.ref ? { customerRef: customer.ref } : {}) }), idempotencyKey: `invite:${invite.id}:${paymentId}`, description: `TasksNearMe invite ${invite.id}` });
    if (result.status === 'failed') {
      await db.update(payments).set({ status: 'failed', failureCode: result.failureCode, providerRef: result.providerRef, updatedAt: now }).where(eq(payments.id, paymentId));
      return { ok: false, code: result.failureCode };
    }
    if (result.status === 'requires_action') {
      await db.update(payments).set({ status: 'requires_confirmation', providerRef: result.providerRef, updatedAt: now }).where(eq(payments.id, paymentId));
      return { ok: false, code: 'requires_bank_verification', verification: await bankStep(deps.payments, paymentId, result.providerRef) };
    }
    return switchHold(deps, invite, held.id, paymentId, result.providerRef, now);
  }
  return book(deps, invite, counterPricingOf(invite), invite.counterStartAt ?? invite.startAt, invite.counterBreakdown, now);
}

/** The answer for a counter's new hold the other path already settled: the booking, or why there isn't one. */
async function settledCounter(db: Db, inviteId: string, paymentId: string): Promise<PaymentAttemptResult> {
  const [invite] = await db.select({ status: invites.status, bookingId: invites.bookingId }).from(invites).where(eq(invites.id, inviteId)).limit(1);
  if (invite?.status === 'accepted' && invite.bookingId) return { ok: true, code: 'booked', redirectTo: routes.app.booking(invite.bookingId) };
  const [payment] = await db.select({ status: payments.status, failureCode: payments.failureCode }).from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (payment?.status === 'failed') return { ok: false, code: payment.failureCode === 'insufficient_funds' ? 'insufficient_funds' : 'payment_declined' };
  return { ok: false, code: 'not_allowed' };
}

/**
 * The new, higher hold replaces the old one, then the booking confirms. Once (5.17): the first finisher claims the
 * new hold (a guarded update); a second, at the same moment or later, gets the settled answer.
 */
async function switchHold(deps: BookingDeps, invite: InviteRow, oldPaymentId: string, paymentId: string, providerRef: string, now: Date): Promise<PaymentAttemptResult> {
  const [claimed] = await deps.db
    .update(payments)
    .set({ status: 'authorized', providerRef, updatedAt: now })
    .where(and(eq(payments.id, paymentId), inArray(payments.status, UNDECIDED)))
    .returning({ id: payments.id });
  if (!claimed) return settledCounter(deps.db, invite.id, paymentId);
  await release(deps.db, deps.payments, oldPaymentId, now);
  await deps.db.update(invites).set({ paymentId, updatedAt: now }).where(eq(invites.id, invite.id));
  return book(deps, { ...invite, paymentId }, counterPricingOf(invite), invite.counterStartAt ?? invite.startAt, invite.counterBreakdown!, now);
}

/** After the dev bank dialog on a higher hold for a counter. */
export async function finishCounterVerification(deps: BookingDeps, posterId: string, inviteId: string, paymentId: string, outcome: 'approved' | 'failed', now: Date): Promise<PaymentAttemptResult> {
  const invite = await ownInvite(deps.db, deps.payments, posterId, inviteId, 'poster', now);
  // The payment must be this invite's own new hold (its key names the invite), not another invite's bank step. Once
  // booked it's the booking's charge (`booking_funding`), which a late return still finds.
  const [payment] = await deps.db
    .select()
    .from(payments)
    .where(and(eq(payments.id, String(paymentId)), eq(payments.payerUserId, posterId), inArray(payments.purpose, ['invite_authorization', 'booking_funding']), eq(payments.idempotencyKey, `invite:${String(inviteId)}:${String(paymentId)}`)))
    .limit(1);
  if (!invite || !payment?.providerRef) return { ok: false, code: 'not_allowed' };
  // Stripe's webhook (or another tab) finished it first: the answer this call would have given (5.17).
  if (payment.status !== 'requires_confirmation') return settledCounter(deps.db, invite.id, payment.id);
  if (invite.status !== 'countered' || !invite.paymentId) return { ok: false, code: 'not_allowed' };
  const completed = await deps.payments.completeAction({ providerRef: payment.providerRef, outcome });
  if (completed.status !== 'succeeded') {
    const [failed] = await deps.db
      .update(payments)
      .set({ status: 'failed', failureCode: completed.failureCode, updatedAt: now })
      .where(and(eq(payments.id, payment.id), inArray(payments.status, UNDECIDED)))
      .returning({ id: payments.id });
    if (!failed) return settledCounter(deps.db, invite.id, payment.id);
    return { ok: false, code: completed.failureCode };
  }
  return switchHold(deps, invite, invite.paymentId, payment.id, payment.providerRef, now);
}

// ---- Views ----------------------------------------------------------------------------------------------

async function viewsOf(db: Db, rows: InviteRow[], viewerRole: 'poster' | 'helper'): Promise<InviteView[]> {
  if (rows.length === 0) return [];
  const taskIds = [...new Set(rows.map((row) => row.taskId))];
  const [taskRows, helpers, held] = await Promise.all([
    db.select({ id: tasks.id, title: tasks.title, slug: categories.slug }).from(tasks).innerJoin(categories, eq(categories.id, tasks.categoryId)).where(inArray(tasks.id, taskIds)),
    getHelperSummaries([...new Set(rows.map((row) => row.helperUserId))], db),
    viewerRole === 'poster'
      ? db.select({ id: payments.id, amountCents: payments.amountCents, status: payments.status }).from(payments).where(inArray(payments.id, rows.flatMap((row) => (row.paymentId ? [row.paymentId] : []))))
      : Promise.resolve([]),
  ]);
  const clients = new Map(await Promise.all([...new Set(rows.map((row) => row.posterUserId))].map(async (id) => [id, await clientSummary(db, id)] as const)));
  const slotIds = rows.flatMap((row) => (row.slotId ? [row.slotId] : []));
  const slots = slotIds.length
    ? await db.select({ id: availabilityPosts.id, startAt: availabilityPosts.startAt, endAt: availabilityPosts.endAt }).from(availabilityPosts).where(inArray(availabilityPosts.id, slotIds))
    : [];
  return rows.flatMap((row): InviteView[] => {
    const task = taskRows.find((item) => item.id === row.taskId);
    const client = clients.get(row.posterUserId);
    const helper = helpers.get(row.helperUserId);
    if (!task || !client || !helper) return [];
    const status = row.status as InviteStatus;
    const actions: InviteActionId[] = [];
    if (viewerRole === 'helper' && status === 'sent') actions.push('accept_invite', 'decline_invite', 'counter_invite');
    if (viewerRole === 'poster' && status === 'sent') actions.push('cancel_invite');
    if (viewerRole === 'poster' && status === 'countered') actions.push('accept_counter', 'decline_counter', 'cancel_invite');
    const hold = held.find((payment) => payment.id === row.paymentId && payment.status === 'authorized');
    return [
      {
        id: row.id,
        status,
        viewerRole,
        task: { id: task.id, title: task.title, categorySlug: task.slug as CategorySlug },
        client,
        helper,
        terms: { pricing: pricingFrom(row.pricingType, row.priceCents, row.hourlyRateCents, row.estimatedHours, row.hoursCap), start: row.startAt.toISOString(), ...(row.message ? { message: row.message } : {}) },
        ...(status === 'countered' && row.counterBreakdown
          ? { counter: { pricing: counterPricingOf(row), start: (row.counterStartAt ?? row.startAt).toISOString(), message: row.counterMessage ?? '', breakdown: row.counterBreakdown } }
          : {}),
        breakdown: row.breakdown,
        ...(hold ? { authorizedCents: hold.amountCents } : {}),
        ...(row.expiresAt && OPEN.includes(status) ? { expiresAt: row.expiresAt.toISOString() } : {}),
        ...(row.bookingId ? { bookingId: row.bookingId } : {}),
        ...slotOf(slots, row.slotId),
        sentAt: row.createdAt.toISOString(),
        actions,
      },
    ];
  });
}

function slotOf(slots: { id: string; startAt: Date; endAt: Date }[], slotId: string | null): Pick<InviteView, 'slot'> {
  const slot = slotId ? slots.find((item) => item.id === slotId) : undefined;
  return slot ? { slot: { id: slot.id, start: slot.startAt.toISOString(), end: slot.endAt.toISOString() } } : {};
}

const openFirst = (a: InviteView, b: InviteView) => Number(!OPEN.includes(a.status)) - Number(!OPEN.includes(b.status));

/** A helper's invites for `/app/offers` (open first, newest first; failed authorizations left out). */
export async function invitesForHelper(db: Db, payments_: PaymentProvider | null, helperId: string, now: Date): Promise<InviteView[]> {
  await expireDueInvites(db, payments_, now);
  const rows = await db
    .select()
    .from(invites)
    .where(and(eq(invites.helperUserId, helperId), ne(invites.status, 'authorizing'), ne(invites.status, 'auth_failed')))
    .orderBy(desc(invites.createdAt))
    .limit(50);
  return (await viewsOf(db, rows, 'helper')).sort(openFirst);
}

/** The invites a client sent for one of their tasks. */
export async function invitesForTask(db: Db, payments_: PaymentProvider | null, posterId: string, taskId: string, now: Date): Promise<InviteView[]> {
  await expireDueInvites(db, payments_, now);
  const rows = await db
    .select()
    .from(invites)
    .where(and(eq(invites.posterUserId, posterId), eq(invites.taskId, String(taskId)), ne(invites.status, 'authorizing')))
    .orderBy(desc(invites.createdAt));
  return (await viewsOf(db, rows, 'poster')).sort(openFirst);
}
