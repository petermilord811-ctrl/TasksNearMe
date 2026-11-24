import { and, desc, eq, inArray, isNull, like, lte, ne, or, sql } from 'drizzle-orm';
import { posterIdentityRequirement } from '@/modules/trust/poster-risk';
import type {
  ActionResult,
  AvailabilitySlotView,
  BookAgainSource,
  CategorySlug,
  CounterInviteInput,
  InvitableTask,
  InviteActionId,
  InviteHelpersPageData,
  InviteStatus,
  InviteView,
  PaymentAttemptResult,
  PriceBreakdown,
  PricingInput,
  RequestHelperInput,
  RequestHelperPageData,
} from '@/contracts';
import { BOOK_AGAIN_RULES, counterInviteInputSchema, requestHelperInputSchema, routes } from '@/contracts';
import type { PaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { availabilityPosts } from '@/modules/availability/schema';
import { dayAreaOfSlot, dayOfSlot, publicCard } from '@/modules/availability/day-cards';
import { bookSlot, holdSlot, openSlotOf, releaseSlot, slotViewOf } from '@/modules/availability/slots';
import { bankStep, chargeMethodOf, confirmFundedBooking, customerFor, methodForChoice, paymentPanel, type BookingDeps } from '@/modules/bookings/confirm';
import { clientSummary } from '@/modules/bookings/hub';
import { pricingColumnsForTask } from '@/modules/bookings/pricing-columns';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { categories } from '@/modules/markets/schema';
import { loadHelperState } from '@/modules/offers/helper';
import { quoteBreakdown } from '@/modules/payments/fees';
import { waivesHoldFee } from '@/modules/billing/benefits';
import { payments } from '@/modules/payments/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { savedHelpers } from '@/modules/reviews/schema';
import { taskCopyFields } from '@/modules/tasks/copy';
import { withCopySlug } from '@/modules/tasks/copy-slug';
import { findTaskWithPublicView } from '@/modules/tasks/queries';
import { taskLocations, tasks } from '@/modules/tasks/schema';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { isUniqueViolation } from '@/platform/db/errors';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { pausedIn } from '@/modules/markets/outage';
import { holdKeysOf, releaseHold, releaseInviteHolds } from './holds';
import { invites } from './schema';
import { postInDirectThread } from '@/modules/messaging/direct';

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
/** Book again: a request for the same past booking is already open (J-C7). */
class RequestOpen extends Error {}

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

/**
 * An invite's or a counter's price as offers take it (security review): never more hours estimated than the cap. A price
 * under the category's usual minimum is allowed, as on tasks and offers (owner, 2026-11-21: "remove minimum budget
 * price: just notify it to user").
 */
function pricingRefused(pricing: PricingInput): boolean {
  return pricing.type === 'hourly' && pricing.estimatedHours > pricing.hoursCap;
}

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

/** The invite ended (canceled, declined, expired) or another acceptance took it, between reading it and booking. */
class InviteTaken extends Error {}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Book again's draft ends with its request when no booking comes of it (declined, canceled, expired, a declined
 * counter, a card that failed; J-C7), in the same transaction as the request. Only a draft: a task the client posted
 * is never touched.
 */
async function cancelDraftTask(tx: Tx, taskId: string, now: Date): Promise<void> {
  await tx.update(tasks).set({ status: 'canceled', updatedAt: now }).where(and(eq(tasks.id, taskId), eq(tasks.status, 'draft')));
}

/** Expires open invites past their time and lets go of every hold they made (lazily and from the job runner). */
export async function expireDueInvites(db: Db, payments_: PaymentProvider | null, now: Date): Promise<void> {
  // A bank step abandoned during the first hold stays `authorizing` until this (OPEN includes it).
  const due = await db.transaction(async (tx) => {
    const rows = await tx
      .update(invites)
      .set({ status: 'expired', decidedAt: now, updatedAt: now })
      .where(and(inArray(invites.status, OPEN), lte(invites.expiresAt, now)))
      .returning({ id: invites.id, slotId: invites.slotId, taskId: invites.taskId });
    for (const row of rows) await cancelDraftTask(tx, row.taskId, now);
    return rows;
  });
  for (const row of due) {
    await releaseInviteHolds(db, payments_, row.id, now);
    await releaseSlot(db, row.slotId, now);
  }
}

// ---- Requesting ---------------------------------------------------------------------------------------

/** The client's open tasks in the helper's bookable categories. */
async function invitableTasks(db: Db, posterId: string, helperId: string, now: Date): Promise<(InvitableTask & { marketId: string; expenseAllowanceCents: number; areaId: string | null })[]> {
  const state = await loadHelperState(db, helperId, now);
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, slug: categories.slug, windowStart: tasks.windowStart, windowEnd: tasks.windowEnd, marketId: tasks.marketId, expenseAllowanceCents: tasks.expenseAllowanceCents, areaId: taskLocations.areaId })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    // The task's neighborhood (its place's area): a neighborhood day's visit goes there (2026-11-24).
    .leftJoin(taskLocations, eq(taskLocations.id, tasks.locationId))
    // Hidden tasks can't be shown to a helper through an invite either.
    .where(and(eq(tasks.posterUserId, posterId), eq(tasks.status, 'open'), isNull(tasks.hiddenAt), isNull(tasks.teamPartOf)))
    .orderBy(desc(tasks.createdAt));
  return rows
    .filter((row) => state.facts.bookableCategories.includes(row.slug as CategorySlug))
    .map((row) => ({ id: row.id, title: row.title, categorySlug: row.slug as CategorySlug, windowStart: row.windowStart.toISOString(), windowEnd: row.windowEnd.toISOString(), marketId: row.marketId, expenseAllowanceCents: row.expenseAllowanceCents, areaId: row.areaId }));
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

/**
 * `routes.app.inviteHelpers(taskId)` (2026-11-23): the client's saved helpers, for one of their open tasks (null for
 * anyone else's task, or one that isn't open). Each says whether they can be asked for it now: they take its kind of
 * task, and neither of the two blocked the other.
 */
export async function getInviteHelpersPage(db: Db, posterId: string, taskId: string, now: Date): Promise<InviteHelpersPageData | null> {
  const [task] = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.id, String(taskId)), eq(tasks.posterUserId, posterId), eq(tasks.status, 'open'), isNull(tasks.hiddenAt), isNull(tasks.teamPartOf)))
    .limit(1);
  if (!task) return null;
  const rows = await db.select({ helperUserId: savedHelpers.helperUserId }).from(savedHelpers).where(eq(savedHelpers.userId, posterId)).orderBy(desc(savedHelpers.createdAt));
  const summaries = await getHelperSummaries(rows.map((row) => row.helperUserId), db);
  const helpers = await Promise.all(rows.flatMap((row) => {
    const helper = summaries.get(row.helperUserId);
    if (!helper) return [];
    return [(async () => {
      const blocked = await isBlockedBetween(db, posterId, helper.id);
      const fits = !blocked && (await invitableTasks(db, posterId, helper.id, now)).some((candidate) => candidate.id === task.id);
      return { helper, canRequest: fits };
    })()];
  }));
  return { task, helpers };
}

/**
 * `routes.app.requestHelper(handle, { fromBookingId })` (null: no such helper, or the client blocked/was blocked).
 * `taskId`: one of the client's open tasks to start with ("Invite helpers" on it); ignored when the helper can't take it.
 */
export async function getRequestHelperPage(
  db: Db,
  payments_: PaymentProvider,
  posterId: string,
  handle: string,
  options: { fromBookingId?: string; slotId?: string; taskId?: string },
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
  // Book again (J-C7): the past task, to request again as a draft of its own.
  let fromBooking: BookAgainSource | undefined;
  if (options.fromBookingId) {
    const source = await bookAgainSourceOf(db, posterId, helperId, String(options.fromBookingId));
    const state = source ? await loadHelperState(db, helperId, now) : null;
    const found = source && state?.facts.bookableCategories.includes(source.categorySlug) ? await findTaskWithPublicView(db, source.task.id) : null;
    if (source && found) {
      const window = bookAgainWindow(now);
      fromBooking = {
        bookingId: source.booking.id,
        bookedFor: source.booking.startAt.toISOString(),
        title: source.task.title,
        categorySlug: source.categorySlug,
        location: found.view.location,
        description: source.terms.scopeText ?? source.task.description,
        startWindow: { start: window.start.toISOString(), end: window.end.toISOString() },
      };
    }
  }
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
  // A neighborhood day's visit (2026-11-24): only the client's tasks in that neighborhood, where the trip goes.
  const day = slot ? await dayOfSlot(db, slot.id, now) : null;
  const offered = slot ? tasksFound.filter((task) => fitsSlot(task, slot) && (!day || task.areaId === day.areaId)) : tasksFound;
  if (slot) suggestion = { ...(offered[0] ? { taskId: offered[0].id } : {}), pricing: slot.pricing };
  // "Invite helpers" on one of the client's tasks: that task first, at the helper's listed price for its kind of work.
  const chosen = !slot && !options.fromBookingId && options.taskId ? offered.find((task) => task.id === String(options.taskId)) : undefined;
  if (chosen) suggestion = { taskId: chosen.id, pricing: listedPricing[chosen.categorySlug] ?? { type: 'fixed', priceCents: 0 } };
  return {
    helper,
    tasks: offered.map(({ marketId: _market, expenseAllowanceCents: _allowance, areaId: _area, ...task }) => task),
    listedPricing,
    ...(suggestion ? { suggestion } : {}),
    ...(fromBooking && !options.slotId ? { fromBooking } : {}),
    ...(slot ? { slot } : {}),
    ...(options.slotId && !slot ? { slotUnavailable: true } : {}),
    ...(day ? { neighborhoodDay: publicCard(day, posterId) } : {}),
    payment: panel,
  };
}

/**
 * The client's breakdown for a price: for the client's own task `taskId`, in its market and with its expense allowance (the
 * hold covers it, as an offer's charge does); without one, in the market of a task of theirs, with no allowance.
 */
export async function quoteInvite(db: Db, posterId: string, pricing: PricingInput, taskId?: string): Promise<PriceBreakdown | null> {
  const [task] = await db
    .select({ marketId: tasks.marketId, expenseAllowanceCents: tasks.expenseAllowanceCents })
    .from(tasks)
    .where(taskId === undefined ? eq(tasks.posterUserId, posterId) : and(eq(tasks.id, taskId), eq(tasks.posterUserId, posterId)))
    .limit(1);
  const fees = task ? await feesOf(db, task.marketId) : null;
  // A request is paid upfront and held by TasksNearMe: the hold fee, none for a Plus member (2026-11-23).
  return fees ? quoteBreakdown(fees, pricing, { expenseAllowanceCents: taskId === undefined ? 0 : task!.expenseAllowanceCents, waiveHoldFee: await waivesHoldFee(db, posterId, new Date()) }) : null;
}

/** Sends an invite: the card is authorized for the total (or a bank step comes first). */
export async function requestHelper(deps: BookingDeps, posterId: string, handle: string, input: RequestHelperInput, now: Date): Promise<PaymentAttemptResult> {
  const { db } = deps;
  const parsed = requestHelperInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const helperId = await helperIdOf(db, handle);
  if (!helperId || helperId === posterId || (await isBlockedBetween(db, posterId, helperId))) return { ok: false, code: 'not_allowed' };
  if (parsed.data.fromBookingId) return requestAgain(deps, posterId, helperId, { ...parsed.data, fromBookingId: parsed.data.fromBookingId, description: parsed.data.description ?? '' }, now);
  const task = (await invitableTasks(db, posterId, helperId, now)).find((item) => item.id === parsed.data.taskId);
  if (!task) return { ok: false, code: 'validation_failed', fieldErrors: { taskId: ['invalid'] } };
  if (pricingRefused(parsed.data.pricing)) return { ok: false, code: 'validation_failed', fieldErrors: { pricing: ['out_of_range'] } };
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
    // A neighborhood day's visit is for a task in that neighborhood (2026-11-24).
    if (open.row.dayId && (await dayAreaOfSlot(db, open.row.id)) !== task.areaId) return { ok: false, code: 'validation_failed', fieldErrors: { taskId: ['invalid'] } };
    slotId = open.row.id;
  }
  // The outage switch: no new request (and no hold on the card) until it's off.
  const paused = await pausedIn(db, task.marketId);
  if (paused) return paused;
  const fees = await feesOf(db, task.marketId);
  if (!fees) return { ok: false, code: 'unknown' };
  // Risk asked this client to verify their ID first; the amount counts for new accounts.
  // The task's expense allowance is held with the price, as an offer charges it: the booking's terms carry it, and receipts
  // approved against it are paid back to the helper out of what the client paid (before, the platform paid them).
  // Held by TasksNearMe: the client's hold fee, none for a Plus member (2026-11-23).
  const allowance = { expenseAllowanceCents: task.expenseAllowanceCents, waiveHoldFee: await waivesHoldFee(db, posterId, now) };
  if (await posterIdentityRequirement(db, posterId, now, quoteBreakdown(fees, parsed.data.pricing, allowance).posterTotalCents)) return { ok: false, code: 'identity_required' };
  const limited = await consumeRateLimit(db, `invites:${posterId}`, REQUEST_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const method = await methodForChoice(deps, posterId, parsed.data.payment);
  if (!('providerRef' in method)) return method;

  const breakdown = quoteBreakdown(fees, parsed.data.pricing, allowance);
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
        methodFingerprint: method.fingerprint ?? null,
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
  const result = await deps.payments.authorize({ amountCents: breakdown.posterTotalCents, method: chargeMethodOf(method), idempotencyKey: `invite:${inviteId}:${paymentId}`, description: `TasksNearMe invite ${inviteId}`, paymentId });
  return settleRequest(db, inviteId, paymentId, result.status === 'authorized' ? { status: 'authorized', providerRef: result.providerRef } : result, now, deps.payments);
}

// ---- Book again (J-C7) ----------------------------------------------------------------------------

/**
 * A past booking of the client's with this helper, for Book again: done, or canceled by the helper (the two that offer
 * Book again). Its place must still be kept: once retention deleted the address, there's nothing to copy (rebook's
 * rule), and the client posts the task again instead.
 */
async function bookAgainSourceOf(db: Db, posterId: string, helperId: string, bookingId: string) {
  const [row] = await db
    .select({ booking: bookings, task: tasks, slug: categories.slug, terms: bookingTerms })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
    .where(and(eq(bookings.id, bookingId), eq(bookings.posterUserId, posterId), eq(bookings.helperUserId, helperId), or(eq(bookings.status, 'completed'), and(eq(bookings.status, 'canceled'), eq(bookings.cancelReason, 'helper')))))
    .limit(1);
  if (!row) return null;
  if (row.task.locationId) {
    const [place] = await db.select({ deletedAt: taskLocations.deletedAt }).from(taskLocations).where(eq(taskLocations.id, row.task.locationId)).limit(1);
    if (!place || place.deletedAt) return null;
  }
  return { ...row, categorySlug: row.slug as CategorySlug };
}

/** Book again's start: from 2 hours to 14 days ahead (BOOK_AGAIN_RULES). */
function bookAgainWindow(now: Date): { start: Date; end: Date } {
  return { start: new Date(now.getTime() + BOOK_AGAIN_RULES.leadHours * HOUR), end: new Date(now.getTime() + BOOK_AGAIN_RULES.maxDaysAhead * 24 * HOUR) };
}

/**
 * Book again (blueprint 02 J3, J8): the past task copied as a draft that never reaches the board, with the place as
 * it was (the exact address stays encrypted) and this request's description, time and price; no photos, questions or
 * offers. The draft, the request and its hold's payment row are written together before the card is asked, and a
 * second send of the same booking while one is open gets `taskId: ['in_use']` (the booking's row is the lock both
 * sends queue on; invites_open_source_booking_idx backs it up).
 */
async function requestAgain(
  deps: BookingDeps,
  posterId: string,
  helperId: string,
  input: Omit<RequestHelperInput, 'fromBookingId' | 'description' | 'pricing'> & { fromBookingId: string; description: string; pricing: PricingInput },
  now: Date,
): Promise<PaymentAttemptResult> {
  const { db } = deps;
  const source = await bookAgainSourceOf(db, posterId, helperId, input.fromBookingId);
  if (!source) return { ok: false, code: 'not_allowed' };
  const helper = await loadHelperState(db, helperId, now);
  if (!helper.facts.bookableCategories.includes(source.categorySlug)) return { ok: false, code: 'not_allowed' };
  if (pricingRefused(input.pricing)) return { ok: false, code: 'validation_failed', fieldErrors: { pricing: ['out_of_range'] } };
  const start = new Date(input.start);
  const window = bookAgainWindow(now);
  if (!(start >= window.start && start <= window.end)) return { ok: false, code: 'validation_failed', fieldErrors: { start: ['out_of_range'] } };
  const marketId = source.task.marketId;
  const paused = await pausedIn(db, marketId);
  if (paused) return paused;
  // The fees in force now, never the past booking's breakdown.
  const fees = await feesOf(db, marketId);
  if (!fees) return { ok: false, code: 'unknown' };
  const breakdown = quoteBreakdown(fees, input.pricing, { waiveHoldFee: await waivesHoldFee(db, posterId, now) });
  if (await posterIdentityRequirement(db, posterId, now, breakdown.posterTotalCents)) return { ok: false, code: 'identity_required' };
  const limited = await consumeRateLimit(db, `invites:${posterId}`, REQUEST_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const method = await methodForChoice(deps, posterId, input.payment);
  if (!('providerRef' in method)) return method;

  const inviteId = newId('inv');
  const paymentId = newId('pay');
  const draftId = newId('tsk');
  const length = Math.min(12 * HOUR, Math.max(HOUR, source.task.windowEnd.getTime() - source.task.windowStart.getTime()));
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from bookings where id = ${source.booking.id} for update`);
      const [open] = await tx
        .select({ id: invites.id })
        .from(invites)
        .where(and(eq(invites.sourceBookingId, source.booking.id), eq(invites.posterUserId, posterId), eq(invites.helperUserId, helperId), inArray(invites.status, OPEN)))
        .limit(1);
      if (open) throw new RequestOpen();
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
        methodFingerprint: method.fingerprint ?? null,
        methodExpMonth: method.expMonth,
        methodExpYear: method.expYear,
        saveMethod: false,
        idempotencyKey: `invite:${inviteId}:${paymentId}`,
        createdAt: now,
        updatedAt: now,
      });
      const copy = taskCopyFields(source.task);
      // In a savepoint, so a slug that's taken is tried again with another (repeats review #16).
      await withCopySlug(source.task.slug, (slug) =>
        tx.transaction((savepoint) =>
          savepoint.insert(tasks).values({
            ...copy,
            id: draftId,
            slug,
            status: 'draft',
            description: input.description,
            ...pricingColumnsForTask(input.pricing),
            // The request has no expense allowance (the hold doesn't cover one), so the past one isn't copied (32's review).
            expenseAllowanceCents: 0,
            expenseAllowanceNote: null,
            windowStart: start,
            windowEnd: new Date(start.getTime() + length),
            flexible: false,
            offerCount: 0,
            version: 1,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      );
      await tx.insert(invites).values({
        id: inviteId,
        taskId: draftId,
        posterUserId: posterId,
        helperUserId: helperId,
        status: 'authorizing',
        source: 'rebook',
        sourceBookingId: source.booking.id,
        ...pricingColumns(input.pricing),
        startAt: start,
        message: input.message?.trim() || null,
        breakdown,
        paymentId,
        slotId: null,
        expiresAt: new Date(now.getTime() + AUTHORIZING_MS),
        createdAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    if (error instanceof RequestOpen || isUniqueViolation(error)) return { ok: false, code: 'validation_failed', fieldErrors: { taskId: ['in_use'] } };
    throw error;
  }
  const result = await deps.payments.authorize({ amountCents: breakdown.posterTotalCents, method: chargeMethodOf(method), idempotencyKey: `invite:${inviteId}:${paymentId}`, description: `TasksNearMe invite ${inviteId}`, paymentId });
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
    const failed = await db.transaction(async (tx) => {
      const [row] = await tx.update(invites).set({ status: 'auth_failed', decidedAt: now, updatedAt: now }).where(and(eq(invites.id, inviteId), eq(invites.status, 'authorizing'))).returning({ slotId: invites.slotId, taskId: invites.taskId });
      if (row) await cancelDraftTask(tx, row.taskId, now);
      return row;
    });
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
  // The two people's direct conversation, when they have one, shows the request as a card (2026-11-23).
  await postInDirectThread(db, invite.posterUserId, invite.helperUserId, { type: 'invite_sent', params: { inviteId: invite.id } }, now, invite.posterUserId);
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
  const [row] = await db.select({ task: tasks, categorySlug: categories.slug }).from(tasks).innerJoin(categories, eq(categories.id, tasks.categoryId)).where(eq(tasks.id, invite.taskId)).limit(1);
  const task = row?.task;
  const policy = task ? await getPublishedPolicy(task.marketId, db) : null;
  // An open task, or Book again's draft (J-C7): settle() books a draft too, and moves it to assigned.
  const bookable = task?.status === 'open' || (task?.status === 'draft' && invite.source === 'rebook');
  if (!row || !task || !policy || !bookable) return { ok: false, code: 'not_allowed' };
  // Every way in checks the same (repeats review #9): the client accepting a counter too, not only the helper accepting.
  // No block between the two, and the helper can still take work in this category.
  if (await isBlockedBetween(db, invite.posterUserId, invite.helperUserId)) return { ok: false, code: 'not_allowed' };
  const helper = await loadHelperState(db, invite.helperUserId, now);
  if (!helper.facts.bookableCategories.includes(row.categorySlug as CategorySlug)) return { ok: false, code: 'not_allowed' };
  // The outage switch (5.15, 5.18) covers every way in, the counter's finished bank step included: the hold stays
  // authorized and the invite as it is, to accept once the switch is off.
  const paused = await pausedIn(db, task.marketId);
  if (paused) return paused;
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
      // The invite is claimed with its booking (repeats review #10): a client's cancel landing at the same moment either
      // wins, and this booking never exists, or finds the invite accepted. Before, the cancel let go of the hold while the
      // booking captured it, and the accept wrote over the cancel.
      const [claimed] = await tx
        .update(invites)
        .set({ status: 'accepted', bookingId, decidedAt: now, updatedAt: now })
        .where(and(eq(invites.id, invite.id), inArray(invites.status, ['sent', 'countered'])))
        .returning({ id: invites.id });
      if (!claimed) throw new InviteTaken();
      // Once captured, the hold is the booking's funding charge (refunds and payouts look for it).
      await tx.update(payments).set({ bookingId, purpose: 'booking_funding', amountCents: breakdown.posterTotalCents, status: 'processing', updatedAt: now }).where(eq(payments.id, payment.id));
    });
  } catch (error) {
    // The task got another booking meanwhile, or the invite ended.
    if (error instanceof InviteTaken || isUniqueViolation(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }
  const capture = () => deps.payments.capture({ authorizationRef: payment.providerRef!, amountCents: breakdown.posterTotalCents, idempotencyKey: `capture:${invite.id}` });
  let captured: Awaited<ReturnType<PaymentProvider['capture']>>;
  let unanswered = false;
  try {
    // A capture that throws is asked once more with the same key: it gives back the first one's result.
    captured = await capture().catch(capture);
  } catch (error) {
    console.error(`[invites] capturing ${invite.id} didn't answer`, error);
    captured = { status: 'failed', failureCode: 'payment_declined' };
    unanswered = true;
    // No answer twice (repeats review #12): the hold is let go at the provider. Had the capture gone through after all,
    // the payment is marked canceled, so its late event refunds it (stripe-webhooks.ts).
    await deps.payments.cancelAuthorization({ authorizationRef: payment.providerRef }).catch(() => undefined);
    await db.update(payments).set({ status: 'canceled', updatedAt: now }).where(eq(payments.id, payment.id));
  }
  if (captured.status === 'failed') {
    await db.update(payments).set({ status: 'failed', failureCode: captured.failureCode, updatedAt: now }).where(and(eq(payments.id, payment.id), eq(payments.status, 'processing')));
    await db.update(bookings).set({ status: 'canceled', cancelReason: 'funding_failed', canceledAt: now, fundingExpiresAt: null, updatedAt: now }).where(eq(bookings.id, bookingId));
    // The invite ends with its hold (and Book again's draft with it), and its slot opens again.
    await db.transaction(async (tx) => {
      const [ended] = await tx.update(invites).set({ status: 'auth_failed', updatedAt: now }).where(and(eq(invites.id, invite.id), eq(invites.status, 'accepted'))).returning({ id: invites.id });
      if (ended) await cancelDraftTask(tx, invite.taskId, now);
    });
    await releaseSlot(db, invite.slotId, now);
    return { ok: false, code: unanswered ? 'unknown' : captured.failureCode };
  }
  const result = await confirmFundedBooking(deps, invite.posterUserId, payment.id, payment.providerRef, now);
  if (!result.ok) return result;
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
  const closed = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(invites)
      .set({ status, decidedAt: now, updatedAt: now })
      .where(and(eq(invites.id, invite.id), inArray(invites.status, from)))
      .returning({ id: invites.id });
    if (row) await cancelDraftTask(tx, invite.taskId, now);
    return row;
  });
  if (!closed) return { ok: false, code: 'not_allowed' };
  await releaseInviteHolds(db, payments_, invite.id, now);
  await releaseSlot(db, invite.slotId, now);
  return { ok: true, code: 'updated' };
}

/**
 * A deleted account's open requests, whatever their state (privacy rehearsal J-PR3): the ones it sent are canceled
 * and the ones sent to it declined, a countered one or a bank step under way included; every hold is released and
 * every slot freed, so nobody books, or is booked by, an account that's gone.
 */
export async function closeInvitesOf(db: Db, payments_: PaymentProvider | null, userId: string, now: Date): Promise<number> {
  const closed = await db.transaction(async (tx) => {
    const rows = await tx
      .update(invites)
      .set({ status: sql`case when ${invites.posterUserId} = ${userId} then 'canceled' else 'declined' end`, decidedAt: now, updatedAt: now })
      .where(and(or(eq(invites.posterUserId, userId), eq(invites.helperUserId, userId)), inArray(invites.status, OPEN)))
      .returning({ id: invites.id, slotId: invites.slotId, taskId: invites.taskId });
    for (const row of rows) await cancelDraftTask(tx, row.taskId, now);
    return rows;
  });
  for (const invite of closed) {
    await releaseInviteHolds(db, payments_, invite.id, now);
    await releaseSlot(db, invite.slotId, now);
  }
  return closed.length;
}

/** The helper canceled a requested slot: its waiting request is declined and the client's hold released. */
export async function closeSlotRequests(db: Db, payments_: PaymentProvider | null, slotId: string, now: Date): Promise<void> {
  const closed = await db.transaction(async (tx) => {
    const rows = await tx
      .update(invites)
      .set({ status: 'declined', decidedAt: now, updatedAt: now })
      .where(and(eq(invites.slotId, slotId), inArray(invites.status, OPEN)))
      .returning({ id: invites.id, taskId: invites.taskId });
    for (const row of rows) await cancelDraftTask(tx, row.taskId, now);
    return rows;
  });
  for (const invite of closed) await releaseInviteHolds(db, payments_, invite.id, now);
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
  const [task] = await db
    .select({ marketId: tasks.marketId, windowStart: tasks.windowStart, windowEnd: tasks.windowEnd, categorySlug: categories.slug, expenseAllowanceCents: tasks.expenseAllowanceCents })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(eq(tasks.id, invite.taskId))
    .limit(1);
  const fees = task ? await feesOf(db, task.marketId) : null;
  if (!task || !fees) return { ok: false, code: 'unknown' };
  // A helper who couldn't take the booking can't counter either (security review): a block between the two, or a helper
  // suspended or no longer cleared for the category, sent the client a message and a counter to accept.
  if (await isBlockedBetween(db, invite.posterUserId, helperId)) return { ok: false, code: 'not_allowed' };
  const helper = await loadHelperState(db, helperId, now);
  if (!helper.facts.bookableCategories.includes(task.categorySlug as CategorySlug)) return { ok: false, code: 'not_allowed' };
  const pricing = parsed.data.pricing ?? pricingFrom(invite.pricingType, invite.priceCents, invite.hourlyRateCents, invite.estimatedHours, invite.hoursCap);
  if (pricingRefused(pricing)) return { ok: false, code: 'validation_failed', fieldErrors: { pricing: ['out_of_range'] } };
  const start = parsed.data.start ? new Date(parsed.data.start) : invite.startAt;
  if (start < task.windowStart || start > task.windowEnd || start.getTime() - now.getTime() < 2 * HOUR) return { ok: false, code: 'validation_failed', fieldErrors: { start: ['invalid'] } };
  // The task's expense allowance stays in the total, as in the first hold.
  const counterBreakdown = quoteBreakdown(fees, pricing, { expenseAllowanceCents: task.expenseAllowanceCents, waiveHoldFee: await waivesHoldFee(db, invite.posterUserId, now) });
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
    // The amount counts for a new account's ID check (security review): a raised total is checked like a first request.
    if (await posterIdentityRequirement(db, posterId, now, invite.counterBreakdown.posterTotalCents)) return { ok: false, code: 'identity_required' };
    const paymentId = newId('pay');
    const { id: _old, createdAt: _created, updatedAt: _updated, providerRef: _ref, failureCode: _failure, ...method } = held;
    // One new hold at a time (repeats review #12): a second tap while one is out or in the bank's step opens nothing, so
    // no hold is left on the card that the invite never points at.
    const opened = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from invites where id = ${invite.id} for update`);
      const [current] = await tx.select({ status: invites.status, paymentId: invites.paymentId }).from(invites).where(eq(invites.id, invite.id)).limit(1);
      if (current?.status !== 'countered' || current.paymentId !== held.id) return false;
      const [pending] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(like(payments.idempotencyKey, holdKeysOf(invite.id)), ne(payments.id, held.id), inArray(payments.status, UNDECIDED)))
        .limit(1);
      if (pending) return false;
      await tx.insert(payments).values({ ...method, id: paymentId, amountCents: invite.counterBreakdown!.posterTotalCents, status: 'processing', idempotencyKey: `invite:${invite.id}:${paymentId}`, createdAt: now, updatedAt: now });
      return true;
    });
    if (!opened) return { ok: false, code: 'not_allowed' };
    // The same card, on the person's customer (Stripe needs it to use the card again).
    const customer = deps.payments.name === 'stripe' ? await customerFor(db, posterId, 'stripe') : null;
    const result = await deps.payments.authorize({ amountCents: invite.counterBreakdown.posterTotalCents, method: chargeMethodOf({ providerRef: held.methodRef, ...(customer?.ref ? { customerRef: customer.ref } : {}) }), idempotencyKey: `invite:${invite.id}:${paymentId}`, description: `TasksNearMe invite ${invite.id}`, paymentId });
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
  // The invite moves to the new hold only while it still waits on the counter with the old one; otherwise the new hold is
  // let go instead of staying on the card (repeats review #12).
  const [moved] = await deps.db
    .update(invites)
    .set({ paymentId, updatedAt: now })
    .where(and(eq(invites.id, invite.id), eq(invites.status, 'countered'), eq(invites.paymentId, oldPaymentId)))
    .returning({ id: invites.id });
  if (!moved) {
    await releaseHold(deps.db, deps.payments, paymentId, now);
    return settledCounter(deps.db, invite.id, paymentId);
  }
  await releaseHold(deps.db, deps.payments, oldPaymentId, now);
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
  if (invite.status !== 'countered' || !invite.paymentId) {
    // The counter expired or ended while the bank's step was open: that new hold is let go (repeats review #12).
    await releaseHold(deps.db, deps.payments, payment.id, now);
    return { ok: false, code: invite.status === 'expired' ? 'expired' : 'not_allowed' };
  }
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
        // Contact details stay hidden like an offer's before a booking (security review).
        terms: { pricing: pricingFrom(row.pricingType, row.priceCents, row.hourlyRateCents, row.estimatedHours, row.hoursCap), start: row.startAt.toISOString(), ...(row.message ? { message: maskContactDetails(row.message).text } : {}) },
        ...(status === 'countered' && row.counterBreakdown
          ? { counter: { pricing: counterPricingOf(row), start: (row.counterStartAt ?? row.startAt).toISOString(), message: maskContactDetails(row.counterMessage ?? '').text, breakdown: row.counterBreakdown } }
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
