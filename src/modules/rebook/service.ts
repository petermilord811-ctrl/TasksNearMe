import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { posterIdentityRequirement } from '@/modules/trust/poster-risk';
import type {
  AcceptProposalInput,
  ActionResult,
  CategorySlug,
  ClientActionId,
  MyClientRow,
  MyClientsPageData,
  PaymentAttemptResult,
  PriceBreakdown,
  PricingInput,
  ProposalPageData,
  ProposeRebookPageData,
  RebookActionId,
  RebookProposalInput,
  RebookProposalStatus,
  RebookProposalView,
} from '@/contracts';
import { acceptProposalInputSchema, MARKET_TIME_ZONE, RECURRING_CATEGORIES, rebookProposalInputSchema, routes, type SeriesCadence } from '@/contracts';
import type { PaymentProvider } from '@/integrations/payments';
import { clientSummary } from '@/modules/bookings/hub';
import { chargeMethodOf, finishBankVerification, methodForChoice, paymentPanel, settle, type BookingDeps } from '@/modules/bookings/confirm';
import { bookingCompletions, bookingTerms, bookings } from '@/modules/bookings/schema';
import { pricingColumns, pricingColumnsForTask, pricingOf } from '@/modules/bookings/pricing-columns';
import { areas, categories } from '@/modules/markets/schema';
import { getFlags, getPublishedPolicy } from '@/modules/markets/queries';
import { bookingSeries } from '@/modules/bookings/schema';
import { scheduleOf, startSeriesFromProposal } from '@/modules/bookings/series';
import { upcomingIndexes, visitStart } from '@/modules/bookings/series-domain';
import { loadHelperState } from '@/modules/offers/helper';
import { quoteBreakdown } from '@/modules/payments/fees';
import { payments } from '@/modules/payments/schema';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { taskLocations, tasks } from '@/modules/tasks/schema';
import { blockedPeopleOf, isBlockedBetween } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { isUniqueViolation } from '@/platform/db/errors';
import { cancelIntents } from '@/modules/payments/cancel-intents';
import { withCopySlug } from '@/modules/tasks/copy-slug';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { marketClockTime, marketDayKey, marketLocalToUtc } from '@/shared/format';
import { readExactAddress } from '@/modules/tasks/locations';
import { pausedIn } from '@/modules/markets/outage';
import { marketTimeZone } from '@/modules/markets/time-zone';
import { rebookProposals } from './schema';

/**
 * My clients and rebooking proposals (UI-032; blueprint 02 J8). See src/contracts/rebook.ts.
 *
 * Rules: the helper proposes from a completed booking of theirs; the start is at least 3 h away and within
 * 14 days (market time); the helper must be bookable in the category and neither person may have blocked
 * the other; one waiting proposal per pair; 10 proposals a day per helper. A proposal expires 48 h after
 * it's sent or 2 h before the start. Accepting charges the client at once (the market's fees then), copies
 * the past task (same place, a `draft` until paid) and confirms the booking like a paid offer.
 */

export const REBOOK_RULES = { leadHours: 3, maxDaysAhead: 14 } as const;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const PROPOSE_RULE = { limit: 10, windowSeconds: 24 * 60 * 60 };
type ProposalRow = typeof rebookProposals.$inferSelect;

/** Closes a proposal's leftovers: the draft task and a booking still waiting for money. */
async function dropDraft(db: Db, row: Pick<ProposalRow, 'taskId' | 'bookingId'>, now: Date): Promise<void> {
  if (row.bookingId) {
    await db
      .update(bookings)
      .set({ status: 'canceled', cancelReason: 'funding_failed', canceledAt: now, fundingExpiresAt: null, updatedAt: now })
      .where(and(eq(bookings.id, row.bookingId), eq(bookings.status, 'pending_funding')));
  }
  if (row.taskId) await db.update(tasks).set({ status: 'canceled', updatedAt: now }).where(and(eq(tasks.id, row.taskId), eq(tasks.status, 'draft')));
}

/** Proposals past their time expire (lazily and from the job runner). */
export async function expireDueProposals(db: Db, now: Date): Promise<number> {
  const expired = await db
    .update(rebookProposals)
    .set({ status: 'expired', decidedAt: now, updatedAt: now })
    .where(and(eq(rebookProposals.status, 'sent'), lte(rebookProposals.expiresAt, now)))
    .returning();
  for (const row of expired) await dropDraft(db, row, now);
  return expired.length;
}

/** A completed booking of the helper's, with what a proposal repeats. */
async function pastBooking(db: Db, helperId: string, bookingId: string) {
  const [row] = await db
    .select({ booking: bookings, task: tasks, slug: categories.slug, areaName: areas.name, terms: bookingTerms })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .leftJoin(areas, eq(areas.id, tasks.publicAreaId))
    .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
    .where(and(eq(bookings.id, String(bookingId)), eq(bookings.helperUserId, helperId), eq(bookings.status, 'completed')))
    .limit(1);
  return row ?? null;
}

/** Regular visits for this past booking: its category has them and the market has them on (blueprint 03 §7). */
async function canRepeat(db: Db, slug: string, marketId: string): Promise<boolean> {
  if (!(RECURRING_CATEGORIES as readonly string[]).includes(slug)) return false;
  return (await getFlags(marketId, db)).recurring === true;
}

/**
 * A rebooking copies the past task's place. Once the retention timer deleted that address (180 days after
 * the last booking there), there's nothing to copy: the client posts the task again instead.
 */
async function placeKept(db: Db, task: { locationId: string | null }): Promise<boolean> {
  if (!task.locationId) return true;
  const [location] = await db.select({ deletedAt: taskLocations.deletedAt }).from(taskLocations).where(eq(taskLocations.id, task.locationId)).limit(1);
  return Boolean(location) && !location!.deletedAt;
}

const termsPricing = (terms: typeof bookingTerms.$inferSelect): PricingInput =>
  pricingOf({ pricingType: terms.pricingType, priceCents: terms.priceCents, hourlyRateCents: terms.hourlyRateCents, estimatedHours: terms.estimatedHours, hoursCap: terms.hoursCap });

// ---- My clients ---------------------------------------------------------------------------------------

/** `routes.app.clients()`: the helper's past clients, most recent booking first. */
export async function getMyClientsPage(db: Db, helperId: string, now: Date): Promise<MyClientsPageData> {
  await expireDueProposals(db, now);
  const [state, rows, open, blocked] = await Promise.all([
    loadHelperState(db, helperId, now),
    db
      .select({ booking: bookings, title: tasks.title, slug: categories.slug, terms: bookingTerms, finalBreakdown: bookingCompletions.finalBreakdown })
      .from(bookings)
      .innerJoin(tasks, eq(tasks.id, bookings.taskId))
      .innerJoin(categories, eq(categories.id, tasks.categoryId))
      .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
      .leftJoin(bookingCompletions, eq(bookingCompletions.bookingId, bookings.id))
      .where(and(eq(bookings.helperUserId, helperId), eq(bookings.status, 'completed')))
      .orderBy(desc(bookings.completedAt)),
    db.select().from(rebookProposals).where(and(eq(rebookProposals.helperUserId, helperId), eq(rebookProposals.status, 'sent'))),
    blockedPeopleOf(db, helperId),
  ]);
  const byClient = new Map<string, typeof rows>();
  for (const row of rows) byClient.set(row.booking.posterUserId, [...(byClient.get(row.booking.posterUserId) ?? []), row]);
  const clients: MyClientRow[] = [];
  for (const [posterId, list] of byClient) {
    const last = list[0]!;
    const proposal = open.find((item) => item.posterUserId === posterId);
    const actions: ClientActionId[] = [];
    if (!proposal && !blocked.includes(posterId) && state.facts.bookableCategories.includes(last.slug as CategorySlug)) actions.push('propose_rebook');
    const client = await clientSummary(db, posterId);
    if (!client) continue;
    clients.push({
      client,
      completedCount: list.length,
      lastBooking: {
        id: last.booking.id,
        title: last.title,
        categorySlug: last.slug as CategorySlug,
        completedAt: (last.booking.completedAt ?? last.booking.updatedAt).toISOString(),
        pricing: termsPricing(last.terms),
        earnedCents: (last.finalBreakdown ?? last.terms.breakdown).helperEarningsCents,
      },
      ...(proposal ? { openProposal: { id: proposal.id, start: proposal.startAt.toISOString(), expiresAt: proposal.expiresAt.toISOString() } } : {}),
      actions,
    });
  }
  return { clients, setup: state.setup };
}

// ---- Proposing ----------------------------------------------------------------------------------------

/** `routes.app.bookingRebook(bookingId)`: null unless the helper may propose it now. */
export async function getProposeRebookPage(db: Db, helperId: string, bookingId: string, now: Date): Promise<ProposeRebookPageData | null> {
  const past = await pastBooking(db, helperId, bookingId);
  if (!past || (await isBlockedBetween(db, helperId, past.booking.posterUserId))) return null;
  const client = await clientSummary(db, past.booking.posterUserId);
  if (!client) return null;
  // The new visit is in the same market: its dates are on that clock (completion plan 8.1).
  const timeZone = await marketTimeZone(db, past.booking.marketId);
  return {
    client,
    booking: {
      id: past.booking.id,
      title: past.task.title,
      categorySlug: past.slug as CategorySlug,
      areaName: past.areaName ?? '',
      lastPricing: termsPricing(past.terms),
      lastStart: past.booking.startAt.toISOString(),
    },
    limits: { firstDate: marketDayKey(now, timeZone), lastDate: marketDayKey(new Date(now.getTime() + REBOOK_RULES.maxDaysAhead * DAY), timeZone), leadHours: REBOOK_RULES.leadHours },
    timeZone,
    canRepeat: await canRepeat(db, past.slug, past.booking.marketId),
  };
}

async function feesOfMarket(db: Db, marketId: string) {
  return (await getPublishedPolicy(marketId, db))?.fees ?? null;
}

/** The numbers for a proposed price, in the past booking's market. */
export async function quoteRebook(db: Db, helperId: string, bookingId: string, pricing: PricingInput): Promise<PriceBreakdown | null> {
  const past = await pastBooking(db, helperId, bookingId);
  const fees = past ? await feesOfMarket(db, past.booking.marketId) : null;
  return fees ? quoteBreakdown(fees, pricing) : null;
}

export async function proposeRebook(db: Db, helperId: string, bookingId: string, input: RebookProposalInput, now: Date): Promise<ActionResult> {
  const parsed = rebookProposalInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const past = await pastBooking(db, helperId, bookingId);
  if (!past) return { ok: false, code: 'not_allowed' };
  if (!(await placeKept(db, past.task))) return { ok: false, code: 'not_allowed' };
  const posterId = past.booking.posterUserId;
  if (await isBlockedBetween(db, helperId, posterId)) return { ok: false, code: 'not_allowed' };
  const state = await loadHelperState(db, helperId, now);
  if (!state.facts.bookableCategories.includes(past.slug as CategorySlug)) return { ok: false, code: 'not_allowed' };
  const { date, startTime, pricing, message, repeat = 'once' } = parsed.data;
  if (repeat !== 'once' && !(await canRepeat(db, past.slug, past.booking.marketId))) return { ok: false, code: 'validation_failed', fieldErrors: { repeat: ['invalid'] } };
  const timeZone = await marketTimeZone(db, past.booking.marketId);
  if (date < marketDayKey(now, timeZone) || date > marketDayKey(new Date(now.getTime() + REBOOK_RULES.maxDaysAhead * DAY), timeZone)) {
    return { ok: false, code: 'validation_failed', fieldErrors: { date: ['out_of_range'] } };
  }
  const start = new Date(marketLocalToUtc(date, startTime, timeZone));
  if (Number.isNaN(start.getTime()) || start.getTime() - now.getTime() < REBOOK_RULES.leadHours * HOUR) {
    return { ok: false, code: 'validation_failed', fieldErrors: { startTime: ['out_of_range'] } };
  }
  const fees = await feesOfMarket(db, past.booking.marketId);
  if (!fees) return { ok: false, code: 'unknown' };
  await expireDueProposals(db, now);
  const limited = await consumeRateLimit(db, `rebook:${helperId}`, PROPOSE_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const id = newId('prp');
  try {
    await db.insert(rebookProposals).values({
      id,
      helperUserId: helperId,
      posterUserId: posterId,
      fromBookingId: past.booking.id,
      status: 'sent',
      startAt: start,
      ...pricingColumns(pricing),
      message: message?.trim() || null,
      cadence: repeat === 'once' ? null : repeat,
      breakdown: quoteBreakdown(fees, pricing),
      expiresAt: new Date(Math.min(now.getTime() + 48 * HOUR, start.getTime() - 2 * HOUR)),
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }
  await db.insert(outboxEvents).values({ id: newId('evt'), type: 'rebook.proposed', aggregateType: 'rebook_proposal', aggregateId: id, payload: { proposalId: id, helperUserId: helperId, posterUserId: posterId, bookingId: past.booking.id } });
  return { ok: true, code: 'sent', redirectTo: routes.app.clients() };
}

// ---- The proposal page --------------------------------------------------------------------------------

/** A repeating proposal: how it repeats (from its start), the first four visit dates, and the series once it started. */
async function repeatOf(db: Db, row: ProposalRow): Promise<Pick<RebookProposalView, 'schedule' | 'visitStarts' | 'seriesId'>> {
  if (!row.cadence) return {};
  const [past] = await db.select({ windowStart: tasks.windowStart, windowEnd: tasks.windowEnd, marketId: bookings.marketId }).from(bookings).innerJoin(tasks, eq(tasks.id, bookings.taskId)).where(eq(bookings.id, row.fromBookingId)).limit(1);
  const timeZone = past ? await marketTimeZone(db, past.marketId) : MARKET_TIME_ZONE;
  const calendar = { timeZone, anchorDate: marketDayKey(row.startAt, timeZone), startTime: marketClockTime(row.startAt, timeZone), cadence: row.cadence as SeriesCadence, durationMinutes: past ? Math.max(60, Math.round((past.windowEnd.getTime() - past.windowStart.getTime()) / 60_000)) : 120 };
  const [series] = row.status === 'accepted' ? await db.select({ id: bookingSeries.id }).from(bookingSeries).where(eq(bookingSeries.proposalId, row.id)).limit(1) : [];
  // The dates as of the start: the first visit and the three after it.
  const starts = upcomingIndexes({ ...calendar, status: 'active' }, new Date(row.startAt.getTime() - 60_000)).map((index) => visitStart(calendar, index).toISOString());
  return { schedule: scheduleOf(calendar, timeZone), visitStarts: starts, ...(series ? { seriesId: series.id } : {}) };
}

async function viewOf(db: Db, cipher: FieldCipher | null, row: ProposalRow, viewerId: string): Promise<RebookProposalView | null> {
  const viewerRole = row.posterUserId === viewerId ? 'poster' : row.helperUserId === viewerId ? 'helper' : null;
  if (!viewerRole) return null;
  const [past] = await db
    .select({ title: tasks.title, slug: categories.slug, areaName: areas.name, locationId: tasks.locationId })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .leftJoin(areas, eq(areas.id, tasks.publicAreaId))
    .where(eq(bookings.id, row.fromBookingId))
    .limit(1);
  const [helper, client] = await Promise.all([getHelperSummaries([row.helperUserId], db).then((found) => found.get(row.helperUserId)), clientSummary(db, row.posterUserId)]);
  if (!past || !helper || !client) return null;
  const status = row.status as RebookProposalStatus;
  const actions: RebookActionId[] = status !== 'sent' ? [] : viewerRole === 'poster' ? ['accept_proposal', 'decline_proposal'] : ['withdraw_proposal'];
  const [location] = viewerRole === 'poster' && past.locationId && cipher ? await db.select({ addressEnc: taskLocations.addressEnc }).from(taskLocations).where(eq(taskLocations.id, past.locationId)).limit(1) : [];
  const exactAddress = location && cipher ? (readExactAddress(cipher, location.addressEnc) ?? null) : null;
  return {
    id: row.id,
    status,
    viewerRole,
    client,
    helper,
    task: { title: past.title, categorySlug: past.slug as CategorySlug, areaName: past.areaName ?? '' },
    ...(exactAddress ? { exactAddress } : {}),
    start: row.startAt.toISOString(),
    pricing: pricingOf(row),
    ...(row.message ? { message: row.message } : {}),
    breakdown: row.breakdown,
    ...(status === 'sent' ? { expiresAt: row.expiresAt.toISOString() } : {}),
    ...(status === 'accepted' && row.bookingId ? { bookingId: row.bookingId } : {}),
    ...(await repeatOf(db, row)),
    sentAt: row.createdAt.toISOString(),
    actions,
  };
}

/** `routes.app.proposal(id)`: either person; the client gets the card panel while it waits. */
export async function getProposalPage(db: Db, payments_: PaymentProvider | null, cipher: FieldCipher | null, userId: string, proposalId: string, now: Date): Promise<ProposalPageData | null> {
  await expireDueProposals(db, now);
  const [row] = await db.select().from(rebookProposals).where(eq(rebookProposals.id, String(proposalId))).limit(1);
  if (!row) return null;
  const proposal = await viewOf(db, cipher, row, userId);
  if (!proposal) return null;
  return proposal.viewerRole === 'poster' && proposal.status === 'sent' && payments_ ? { proposal, payment: await paymentPanel(db, userId, payments_) } : { proposal };
}

// ---- Answering ----------------------------------------------------------------------------------------

async function ownProposal(db: Db, userId: string, proposalId: string, side: 'poster' | 'helper', now: Date): Promise<ProposalRow | null> {
  await expireDueProposals(db, now);
  const [row] = await db
    .select()
    .from(rebookProposals)
    .where(and(eq(rebookProposals.id, String(proposalId)), eq(side === 'poster' ? rebookProposals.posterUserId : rebookProposals.helperUserId, userId)))
    .limit(1);
  return row ?? null;
}

async function close(db: Db, row: ProposalRow, status: 'declined' | 'withdrawn', now: Date): Promise<ActionResult> {
  const [closed] = await db
    .update(rebookProposals)
    .set({ status, decidedAt: now, updatedAt: now })
    .where(and(eq(rebookProposals.id, row.id), eq(rebookProposals.status, 'sent')))
    .returning();
  if (!closed) return { ok: false, code: row.status === 'expired' ? 'expired' : 'not_allowed' };
  await dropDraft(db, closed, now);
  if (status === 'declined') {
    await db.insert(outboxEvents).values({ id: newId('evt'), type: 'rebook.declined', aggregateType: 'rebook_proposal', aggregateId: row.id, payload: { proposalId: row.id, helperUserId: row.helperUserId, posterUserId: row.posterUserId } });
  }
  return { ok: true, code: 'updated' };
}

export async function declineProposal(db: Db, posterId: string, proposalId: string, now: Date): Promise<ActionResult> {
  const row = await ownProposal(db, posterId, proposalId, 'poster', now);
  return row ? close(db, row, 'declined', now) : { ok: false, code: 'not_allowed' };
}

export async function withdrawProposal(db: Db, helperId: string, proposalId: string, now: Date): Promise<ActionResult> {
  const row = await ownProposal(db, helperId, proposalId, 'helper', now);
  return row ? close(db, row, 'withdrawn', now) : { ok: false, code: 'not_allowed' };
}

/** Once the booking is confirmed: the proposal is accepted and the helper hears about it. */
async function accepted(db: Db, proposalId: string, result: PaymentAttemptResult, now: Date): Promise<PaymentAttemptResult> {
  if (!result.ok) return result;
  const [row] = await db
    .update(rebookProposals)
    .set({ status: 'accepted', decidedAt: now, updatedAt: now })
    .where(and(eq(rebookProposals.id, proposalId), eq(rebookProposals.status, 'sent')))
    .returning();
  if (row) {
    await db.insert(outboxEvents).values({ id: newId('evt'), type: 'rebook.accepted', aggregateType: 'rebook_proposal', aggregateId: row.id, payload: { proposalId: row.id, helperUserId: row.helperUserId, posterUserId: row.posterUserId, bookingId: row.bookingId } });
  }
  // Regular visits: the first one is paid, so the series starts (its page is where the client lands).
  const [proposal] = await db.select({ cadence: rebookProposals.cadence }).from(rebookProposals).where(eq(rebookProposals.id, proposalId)).limit(1);
  if (proposal?.cadence) {
    const seriesId = await startSeriesFromProposal(db, proposalId, now);
    if (seriesId) return { ok: true, code: 'booked', redirectTo: routes.app.series(seriesId) };
  }
  return result;
}

/**
 * Stripe's webhook settled the payment of a booking a proposal made, while the client never came back from the bank
 * (5.17): the proposal ends as it does on the client's path (accepted, the helper told, regular visits started).
 * Nothing to do when it isn't a proposal's booking or the client got there first.
 */
export async function proposalFunded(db: Db, bookingId: string, now: Date): Promise<void> {
  const [row] = await db.select({ id: rebookProposals.id }).from(rebookProposals).where(and(eq(rebookProposals.bookingId, bookingId), eq(rebookProposals.status, 'sent'))).limit(1);
  if (row) await accepted(db, row.id, { ok: true, code: 'booked', redirectTo: routes.app.booking(bookingId) }, now);
}

/**
 * The client accepts and pays. The first attempt copies the past task (same place, a draft) and opens a
 * booking waiting for money; a retry after a declined card reuses them.
 */
export async function acceptProposal(deps: BookingDeps, posterId: string, proposalId: string, input: AcceptProposalInput, now: Date): Promise<PaymentAttemptResult> {
  const { db } = deps;
  const parsed = acceptProposalInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const row = await ownProposal(db, posterId, proposalId, 'poster', now);
  if (!row) return { ok: false, code: 'not_allowed' };
  if (row.status === 'accepted' && row.bookingId) return { ok: true, code: 'booked', redirectTo: routes.app.booking(row.bookingId) };
  if (row.status !== 'sent') return { ok: false, code: row.status === 'expired' ? 'expired' : 'not_allowed' };
  if (await isBlockedBetween(db, posterId, row.helperUserId)) return { ok: false, code: 'not_allowed' };
  const [past] = await db.select({ task: tasks, slug: categories.slug }).from(bookings).innerJoin(tasks, eq(tasks.id, bookings.taskId)).innerJoin(categories, eq(categories.id, tasks.categoryId)).where(eq(bookings.id, row.fromBookingId)).limit(1);
  if (!past) return { ok: false, code: 'not_allowed' };
  if (!(await placeKept(db, past.task))) return { ok: false, code: 'not_allowed' };
  const helper = await loadHelperState(db, row.helperUserId, now);
  if (!helper.facts.bookableCategories.includes(past.slug as CategorySlug)) return { ok: false, code: 'not_allowed' };
  // The outage switch: the proposal stays open until it's off.
  const paused = await pausedIn(db, past.task.marketId);
  if (paused) return paused;
  const policy = await getPublishedPolicy(past.task.marketId, db);
  if (!policy) return { ok: false, code: 'unknown' };
  // Risk asked this client to verify their ID first; the amount counts for new accounts.
  if (await posterIdentityRequirement(db, posterId, now, quoteBreakdown(policy.fees, pricingOf(row)).posterTotalCents)) return { ok: false, code: 'identity_required' };
  const chosen = await methodForChoice(deps, posterId, parsed.data.payment);
  if (!('providerRef' in chosen)) return chosen;
  // Regular visits charge this card again before each visit: a new card is kept (the client agreed when accepting).
  const method = row.cadence && !chosen.paymentMethodId ? { ...chosen, save: true } : chosen;

  const pricing = pricingOf(row);
  const breakdown = quoteBreakdown(policy.fees, pricing);
  const amountCents = breakdown.posterTotalCents;
  const length = Math.min(12 * HOUR, Math.max(HOUR, past.task.windowEnd.getTime() - past.task.windowStart.getTime()));
  const hold = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from rebook_proposals where id = ${row.id} for update`);
    const [current] = await tx.select().from(rebookProposals).where(eq(rebookProposals.id, row.id)).limit(1);
    if (!current || current.status !== 'sent') return null;
    let taskId = current.taskId;
    if (!taskId) {
      taskId = newId('tsk');
      const { id: _id, slug: _slug, createdAt: _created, updatedAt: _updated, publishedAt: _published, expiresAt: _expires, aiGenerationId: _ai, ...copy } = past.task;
      const copyId = taskId;
      // In a savepoint, so a slug that's taken is tried again with another (repeats review #16).
      await withCopySlug(past.task.slug, (slug) =>
        tx.transaction((savepoint) =>
          savepoint.insert(tasks).values({
            ...copy,
            id: copyId,
            slug,
            status: 'draft',
            ...pricingColumnsForTask(pricing),
            windowStart: row.startAt,
            windowEnd: new Date(row.startAt.getTime() + length),
            flexible: false,
            offerCount: 0,
            version: 1,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      );
    }
    let bookingId = current.bookingId;
    const [live] = bookingId ? await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1) : [];
    // An attempt still being charged (a double tap, a second tab): never charge twice.
    if (live && live.status === 'pending_funding') {
      const [inFlight] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.bookingId, live.id), eq(payments.status, 'processing')))
        .limit(1);
      if (inFlight) return null;
    }
    if (!live || live.status !== 'pending_funding') {
      bookingId = newId('bkg');
      await tx.insert(bookings).values({
        id: bookingId,
        taskId,
        posterUserId: posterId,
        helperUserId: row.helperUserId,
        marketId: past.task.marketId,
        policyVersionId: policy.id,
        status: 'pending_funding',
        startAt: row.startAt,
        fundingExpiresAt: new Date(Math.min(row.expiresAt.getTime(), now.getTime() + policy.timers.pendingFundingMinutes * 60_000)),
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(bookingTerms).values({
        id: newId('btm'),
        bookingId,
        version: 1,
        ...pricingColumns(pricing),
        expenseAllowanceCents: 0,
        breakdown,
        scopeText: past.task.description,
        startAt: row.startAt,
        createdAt: now,
      });
    }
    await tx.update(rebookProposals).set({ taskId, bookingId, updatedAt: now }).where(eq(rebookProposals.id, row.id));
    // A new attempt replaces one still waiting for the bank; its intent is canceled at the provider below (repeats review #5).
    const replaced = await tx
      .update(payments)
      .set({ status: 'canceled', updatedAt: now })
      .where(and(eq(payments.bookingId, bookingId!), eq(payments.status, 'requires_confirmation')))
      .returning({ providerRef: payments.providerRef });
    const paymentId = newId('pay');
    const idempotencyKey = `${bookingId}:${paymentId}`;
    await tx.insert(payments).values({
      id: paymentId,
      bookingId: bookingId!,
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
    return { bookingId: bookingId!, paymentId, idempotencyKey, replaced: replaced.map((payment) => payment.providerRef) };
  });
  if (!hold) return { ok: false, code: 'not_allowed' };
  await cancelIntents(deps.payments, hold.replaced, `booking ${hold.bookingId}`);
  const result = await deps.payments.charge({ amountCents, method: chargeMethodOf(method), idempotencyKey: hold.idempotencyKey, description: `TasksNearMe booking ${hold.bookingId}`, paymentId: hold.paymentId });
  return accepted(db, row.id, await settle(deps, posterId, hold.paymentId, result, now), now);
}

/** After the dev bank dialog on an accepted proposal's charge. */
export async function finishProposalVerification(deps: BookingDeps, posterId: string, proposalId: string, paymentId: string, outcome: 'approved' | 'failed', now: Date): Promise<PaymentAttemptResult> {
  const row = await ownProposal(deps.db, posterId, proposalId, 'poster', now);
  // Accepted already: Stripe's webhook finished the payment first (5.17); finishing it again answers as it would have.
  if (!row || (row.status !== 'sent' && row.status !== 'accepted') || !row.bookingId) return { ok: false, code: 'not_allowed' };
  const [payment] = await deps.db.select({ bookingId: payments.bookingId }).from(payments).where(eq(payments.id, String(paymentId))).limit(1);
  if (payment?.bookingId !== row.bookingId) return { ok: false, code: 'not_allowed' };
  return accepted(deps.db, row.id, await finishBankVerification(deps, posterId, String(paymentId), outcome, now), now);
}

