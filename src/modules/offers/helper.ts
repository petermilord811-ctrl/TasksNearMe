import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lte, or, type SQL } from 'drizzle-orm';
import { aiDraftingEnabledFor } from '@/modules/assist/availability';
import type {
  ActionResult,
  CategorySlug,
  FindWorkCard,
  FindWorkDistance,
  FindWorkPageData,
  FindWorkSort,
  HelperOfferView,
  HelperSetupState,
  HelperTaskView,
  MyOfferRow,
  MyOffersPageData,
  OfferActionId,
  OfferInput,
  OfferStatus,
  PriceBreakdown,
  PricingInput,
} from '@/contracts';
import { createOfferInputSchema, FIND_WORK_DISTANCES, FIND_WORK_SORTS, routes } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { photoFromFile } from '@/modules/files/uploads';
import { getPublishedPolicy, listCategoryViews } from '@/modules/markets/queries';
import { offerThreadId } from '@/modules/messaging/service';
import { areas, categories, markets, type FeeSchedule } from '@/modules/markets/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { BOARD_PAGE_SIZE, parseTaskBoardQuery } from '@/modules/tasks/projections';
import { findTaskWithPublicView, listFeedTasks } from '@/modules/tasks/queries';
import { files, taskMarks, taskPhotos, tasks } from '@/modules/tasks/schema';
import { blockedPeopleOf, isBlockedBetween } from '@/modules/trust/blocks';
import { maskContactDetails, publicExcerpt } from '@/modules/trust/contact-masking';
import { computeOnboarding } from '@/modules/verification/progress';
import { loadOnboardingState, nearestRadius } from '@/modules/verification/service';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { isUniqueViolation } from '@/platform/db/errors';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';
import { mapTiles } from '@/modules/markets/map-tiles';
import {
  distanceBandOf,
  helperOfferActions,
  MAX_ACTIVE_OFFERS,
  maxMilesOf,
  offerBlockedReason,
  offerDefaultsFor,
  offerExpiresAt,
  offerRulesFor,
  type HelperOfferFacts,
  type TaskOfferFacts,
} from './helper-domain';
import { offerPricing } from './owner';
import { offers } from './schema';

/**
 * The helper's side of offers (blueprint 02 J2, 03 §3): the feed, a task from the helper's view,
 * sending, revising, withdrawing and re-confirming offers, and the helper's offer list.
 * Every read is projected for the helper: never an address, the description only for bookable
 * helpers, and money in the helper's variant.
 */

const ACTIVE: OfferStatus[] = ['pending', 'stale'];
type OfferRow = typeof offers.$inferSelect;
type TaskRow = typeof tasks.$inferSelect;

/** Sending offers: 20 an hour per helper. */
const OFFER_RATE_LIMIT = { limit: 20, windowSeconds: 3600 };

// ---- Helper state -----------------------------------------------------------------------------

export interface HelperState {
  facts: HelperOfferFacts;
  setup: HelperSetupState;
  /** The helper's area center; distances are measured from here. */
  center: { lat: number; lng: number } | null;
  marketId: string | null;
}

export async function loadHelperState(db: Db, userId: string, now: Date): Promise<HelperState> {
  const state = await loadOnboardingState(db, userId, now);
  const onboarding = computeOnboarding(state.facts);
  const suspended = state.profile?.status === 'suspended';
  const bookableCategories = suspended ? [] : onboarding.progress.bookableCategories;
  const [area] = state.profile?.areaId
    ? await db.select().from(areas).where(eq(areas.id, state.profile.areaId)).limit(1)
    : [];
  const [user] = await db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);
  return {
    facts: {
      userId,
      bookableCategories,
      offeredCategories: state.facts.services.map((service) => service.categorySlug),
      suspended,
      serviceRadiusMiles: nearestRadius(state.profile?.serviceRadiusKm ?? 8),
    },
    setup: {
      bookable: bookableCategories.length > 0,
      bookableCategories,
      ...(onboarding.firstIncomplete !== 'done' ? { nextOnboardingStep: onboarding.firstIncomplete } : {}),
    },
    center: area ? { lat: area.centerLat, lng: area.centerLng } : null,
    marketId: area?.marketId ?? user?.marketId ?? null,
  };
}

/** Offers past their expiry become `expired` (lazily, on reads and writes that touch them). */
export async function expireDueOffers(db: Db, now: Date, scope: { taskId?: string; helperUserId?: string }): Promise<void> {
  const conditions: SQL[] = [inArray(offers.status, ACTIVE), lte(offers.expiresAt, now)];
  if (scope.taskId) conditions.push(eq(offers.taskId, scope.taskId));
  if (scope.helperUserId) conditions.push(eq(offers.helperUserId, scope.helperUserId));
  const expired = await db
    .update(offers)
    .set({ status: 'expired', closedAt: now, updatedAt: now })
    .where(and(...conditions))
    .returning({ taskId: offers.taskId });
  for (const taskId of new Set(expired.map((row) => row.taskId))) await refreshOfferCount(db, taskId);
}

async function refreshOfferCount(db: Db, taskId: string): Promise<void> {
  const [active] = await db
    .select({ value: count() })
    .from(offers)
    .where(and(eq(offers.taskId, taskId), inArray(offers.status, ACTIVE)));
  await db.update(tasks).set({ offerCount: active?.value ?? 0 }).where(eq(tasks.id, taskId));
}

async function feesFor(db: Db, marketId: string): Promise<FeeSchedule | null> {
  const policy = await getPublishedPolicy(marketId, db);
  return policy?.fees ?? null;
}

/** The helper's own breakdown for a price (helper variant lines; fees from the market policy). */
export async function quoteForHelper(db: Db, userId: string, pricing: PricingInput, now: Date): Promise<PriceBreakdown | null> {
  const state = await loadHelperState(db, userId, now);
  const fees = state.marketId ? await feesFor(db, state.marketId) : null;
  return fees ? quoteBreakdown(fees, pricing) : null;
}

// ---- Feed --------------------------------------------------------------------------------------

type SearchParams = Record<string, string | string[] | undefined>;

export function parseFindWorkQuery(params: SearchParams): FindWorkPageData['query'] {
  const one = (key: string) => (Array.isArray(params[key]) ? params[key]![0] : params[key]) as string | undefined;
  const raw = one('distance');
  const distance = (FIND_WORK_DISTANCES as readonly string[]).includes(raw ?? '') ? (raw as FindWorkDistance) : 'any';
  const sortRaw = one('sort');
  const sort = (FIND_WORK_SORTS as readonly string[]).includes(sortRaw ?? '') ? (sortRaw as FindWorkSort) : 'soonest';
  const { sort: _boardSort, ...board } = parseTaskBoardQuery(params);
  return { ...board, sort, distance, saved: one('saved') === '1', view: one('view') === 'map' ? 'map' : 'list' };
}

const NEW_FOR_HOURS = 24;

/** What the helper would earn after the service fee (blueprint 04): for the task, or per hour and for the cap. */
function earningsFor(fees: FeeSchedule | null, budget: PricingInput): FindWorkCard['earnings'] {
  if (budget.type === 'fixed') return { type: 'fixed', amountCents: fees ? quoteBreakdown(fees, budget).helperEarningsCents : budget.priceCents };
  const capCents = fees ? quoteBreakdown(fees, budget).helperEarningsCents : Math.round(budget.rateCents * budget.hoursCap);
  return { type: 'hourly', rateCents: Math.round(capCents / budget.hoursCap), capCents };
}

export async function getFindWorkPageData(db: Db, userId: string, params: SearchParams, now: Date): Promise<FindWorkPageData | null> {
  const state = await loadHelperState(db, userId, now);
  if (!state.marketId) return null;
  const query = parseFindWorkQuery(params);
  const [categoryViews, categoryRows] = await Promise.all([
    listCategoryViews(state.marketId, db),
    db.select({ slug: categories.slug, requiresBackgroundCheck: categories.requiresBackgroundCheck, minPriceCents: categories.minPriceCents }).from(categories),
  ]);
  const needsCheck = new Map(categoryRows.map((row) => [row.slug, row.requiresBackgroundCheck]));
  const minPrice = new Map(categoryRows.map((row) => [row.slug, row.minPriceCents]));
  const blocked = await blockedPeopleOf(db, userId);
  const { tasks: found, totalCount } = await listFeedTasks(db, {
    marketId: state.marketId,
    query,
    now,
    excludePosterIds: [userId, ...blocked],
    center: state.center,
    maxMiles: maxMilesOf(query.distance),
    viewerId: userId,
  });
  const [fees, [market], [area], savedRows] = await Promise.all([
    feesFor(db, state.marketId),
    db.select({ lat: markets.centerLat, lng: markets.centerLng }).from(markets).where(eq(markets.id, state.marketId)).limit(1),
    db.select({ name: areas.name }).from(areas).innerJoin(helperProfiles, eq(helperProfiles.areaId, areas.id)).where(eq(helperProfiles.userId, userId)).limit(1),
    db
      .select({ taskId: taskMarks.taskId })
      .from(taskMarks)
      .innerJoin(tasks, eq(tasks.id, taskMarks.taskId))
      .where(and(eq(taskMarks.userId, userId), eq(taskMarks.kind, 'saved'), eq(tasks.status, 'open'), gt(tasks.windowEnd, now))),
  ]);
  const savedIds = new Set(savedRows.map((row) => row.taskId));

  const taskIds = found.map((item) => item.view.id);
  const myOffers = taskIds.length
    ? await db
        .select({ id: offers.id, taskId: offers.taskId, status: offers.status, expiresAt: offers.expiresAt })
        .from(offers)
        .innerJoin(tasks, eq(tasks.id, offers.taskId))
        // Offers made before Find a replacement reopened a task belong to the canceled booking.
        .where(and(eq(offers.helperUserId, userId), inArray(offers.taskId, taskIds), or(isNull(tasks.reopenedAt), gte(offers.createdAt, tasks.reopenedAt))))
        .orderBy(desc(offers.createdAt))
    : [];
  const latestOffer = new Map<string, { id: string; status: OfferStatus }>();
  for (const offer of myOffers) {
    if (latestOffer.has(offer.taskId)) continue;
    const expired = ACTIVE.includes(offer.status as OfferStatus) && offer.expiresAt <= now;
    latestOffer.set(offer.taskId, { id: offer.id, status: expired ? 'expired' : (offer.status as OfferStatus) });
  }

  return {
    query,
    categories: categoryViews,
    cards: found.map(({ view, distanceMiles, posterUserId, status, windowEnd }) => {
      const task: typeof view =
        view.location.kind === 'local' && distanceMiles !== null
          ? { ...view, location: { ...view.location, distanceBand: distanceBandOf(distanceMiles) } }
          : view;
      const myOffer = latestOffer.get(view.id);
      const blockedReason = offerBlockedReason(
        state.facts,
        {
          posterUserId,
          status,
          windowEnd,
          categorySlug: view.categorySlug,
          requiresBackgroundCheck: needsCheck.get(view.categorySlug) ?? false,
          remote: view.location.kind === 'remote',
          distanceMiles,
        },
        now,
      );
      const earnings = earningsFor(fees, view.budget);
      // One tap (completion plan 4.3): a fixed-price task the helper can offer on, at the poster's price.
      const quickOffer =
        !myOffer && !blockedReason && view.budget.type === 'fixed' && earnings.type === 'fixed' && view.budget.priceCents >= (minPrice.get(view.categorySlug) ?? 0)
          ? { priceCents: view.budget.priceCents, earningsCents: earnings.amountCents, proposedStart: view.schedule.windowStart }
          : undefined;
      return {
        task,
        ...(myOffer ? { myOffer } : {}),
        ...(blockedReason && !myOffer ? { blockedReason } : {}),
        earnings,
        startDay: marketDayKey(view.schedule.windowStart),
        isNew: now.getTime() - Date.parse(view.postedAt) < NEW_FOR_HOURS * 3_600_000,
        saved: savedIds.has(view.id),
        ...(quickOffer ? { quickOffer } : {}),
      };
    }),
    totalCount,
    pageCount: Math.max(1, Math.ceil(totalCount / BOARD_PAGE_SIZE)),
    setup: state.setup,
    map: {
      ...mapTiles(),
      ...(state.center && area ? { area: { name: area.name, center: state.center, serviceRadiusMiles: state.facts.serviceRadiusMiles } } : {}),
      marketCenter: market ? { lat: market.lat, lng: market.lng } : (state.center ?? { lat: 30.2672, lng: -97.7431 }),
    },
    today: marketDayKey(now),
    savedCount: savedIds.size,
  };
}

// ---- Task view ----------------------------------------------------------------------------------

async function taskWithCategory(db: Db, taskId: string) {
  const [row] = await db
    .select({ task: tasks, category: categories })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(eq(tasks.id, taskId))
    .limit(1);
  return row ?? null;
}

function taskFacts(row: { task: TaskRow; category: typeof categories.$inferSelect }, distanceMiles: number | null): TaskOfferFacts {
  return {
    posterUserId: row.task.posterUserId,
    status: row.task.status,
    hidden: row.task.hiddenAt !== null,
    windowEnd: row.task.windowEnd,
    categorySlug: row.category.slug as CategorySlug,
    requiresBackgroundCheck: row.category.requiresBackgroundCheck,
    remote: row.task.mode === 'remote',
    distanceMiles,
  };
}

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

function helperOfferView(row: OfferRow, task: TaskRow, fees: FeeSchedule, now: Date): HelperOfferView {
  const pricing = offerPricing(row);
  return {
    id: row.id,
    status: row.status as OfferStatus,
    pricing,
    proposedStart: row.proposedStart.toISOString(),
    message: row.message,
    brings: row.brings,
    expiresAt: row.expiresAt.toISOString(),
    revision: row.revision,
    submittedAt: row.updatedAt.toISOString(),
    breakdown: quoteBreakdown(fees, pricing),
    actions: helperOfferActions(row, task, now),
  };
}

/**
 * A task from the helper's side. Bookable helpers see the full description (contact details masked),
 * the details and the photos; everyone else sees the public excerpt only (ui-contract §5).
 * Drafts are never shown. The helper's offer is included while it's in play or booked.
 */
export async function getHelperTaskView(db: Db, userId: string, taskId: string, now: Date): Promise<HelperTaskView | null> {
  const row = await taskWithCategory(db, taskId);
  if (!row || row.task.status === 'draft') return null;
  if (await isBlockedBetween(db, userId, row.task.posterUserId)) return null;
  await expireDueOffers(db, now, { taskId });
  const [state, found, fees] = await Promise.all([loadHelperState(db, userId, now), findTaskWithPublicView(db, taskId), feesFor(db, row.task.marketId)]);
  if (!found || !fees) return null;

  const [latest] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.taskId, taskId), eq(offers.helperUserId, userId)))
    .orderBy(desc(offers.createdAt))
    .limit(1);
  // A task that no longer takes offers (or that staff hid) is shown only to helpers who offered on it.
  if ((row.task.status !== 'open' || row.task.hiddenAt) && !latest) return null;
  // The offer shows while it's in play or booked; after a decline, withdrawal or expiry the helper may offer
  // again, and so after Find a replacement reopened the task (earlier offers belong to the canceled booking).
  const thisRound = latest && (!row.task.reopenedAt || latest.createdAt >= row.task.reopenedAt) ? latest : undefined;
  const offerRow = thisRound && [...ACTIVE, 'accepted'].includes(thisRound.status as OfferStatus) ? thisRound : undefined;

  const point = row.task.publicLat !== null && row.task.publicLng !== null ? { lat: row.task.publicLat, lng: row.task.publicLng } : null;
  const distanceMiles = state.center && point && row.task.mode !== 'remote' ? milesBetween(state.center, point) : null;
  const view = found.view;
  const task =
    view.location.kind === 'local' && distanceMiles !== null
      ? { ...view, location: { ...view.location, distanceBand: distanceBandOf(distanceMiles) } }
      : view;
  const blockedReason = offerBlockedReason(state.facts, taskFacts(row, distanceMiles), now);
  const seesDetails = state.setup.bookable || Boolean(latest);

  const photoRows = seesDetails
    ? await db
        .select({ file: files })
        .from(taskPhotos)
        .innerJoin(files, eq(files.id, taskPhotos.fileId))
        .where(eq(taskPhotos.taskId, taskId))
        .orderBy(asc(taskPhotos.position))
    : [];
  const rules = offerRulesFor(row.task, row.category);

  return {
    task,
    description: seesDetails ? maskContactDetails(row.task.description).text : publicExcerpt(row.task.description),
    details: seesDetails ? row.task.details : {},
    photos: photoRows.map(({ file }) => photoFromFile(file)),
    ...(seesDetails && row.task.expenseAllowanceCents > 0
      ? { expenseAllowance: { amountCents: row.task.expenseAllowanceCents, description: row.task.expenseAllowanceNote ?? '' } }
      : {}),
    ...(offerRow ? { myOffer: helperOfferView(offerRow, row.task, fees, now) } : {}),
    ...(blockedReason && !offerRow ? { blockedReason } : {}),
    setup: state.setup,
    offerRules: rules,
    offerDefaults: offerDefaultsFor(budgetOfTask(row.task), rules),
    aiDraftingEnabled: await aiDraftingEnabledFor(db, userId),
  };
}

function budgetOfTask(task: TaskRow): PricingInput {
  return task.pricingType === 'hourly'
    ? { type: 'hourly', rateCents: task.hourlyRateCents ?? 0, estimatedHours: task.estimatedHours ?? 0, hoursCap: task.hoursCap ?? 0 }
    : { type: 'fixed', priceCents: task.budgetCents ?? 0 };
}

// ---- Changes ------------------------------------------------------------------------------------

async function recordOfferEvent(
  db: Pick<Db, 'insert'>,
  type: 'offer.submitted' | 'offer.revised' | 'offer.withdrawn' | 'offer.reconfirmed',
  actorId: string,
  offer: { id: string; taskId: string },
  posterUserId: string,
): Promise<void> {
  await db.insert(outboxEvents).values({
    id: newId('evt'),
    type,
    aggregateType: 'offer',
    aggregateId: offer.id,
    payload: { offerId: offer.id, taskId: offer.taskId, helperUserId: actorId, posterUserId },
  });
  await db.insert(auditLog).values({ id: newId('aud'), actorId, actorRole: 'user', action: type, targetType: 'offer', targetId: offer.id });
}

function pricingColumns(pricing: OfferInput['pricing']) {
  return pricing.type === 'fixed'
    ? { pricingType: 'fixed', priceCents: pricing.priceCents, hourlyRateCents: null, estimatedHours: null, hoursCap: null }
    : {
        pricingType: 'hourly',
        priceCents: null,
        hourlyRateCents: pricing.rateCents,
        estimatedHours: pricing.estimatedHours,
        hoursCap: pricing.hoursCap,
      };
}

/** Checks the form against the task's rules and that the helper may offer; returns what to store. */
async function prepareOffer(db: Db, userId: string, taskId: string, input: OfferInput, now: Date) {
  const row = await taskWithCategory(db, String(taskId));
  if (!row || row.task.status === 'draft') return { ready: false as const, result: { ok: false, code: 'not_found' } as ActionResult };
  if (await isBlockedBetween(db, userId, row.task.posterUserId)) return { ready: false as const, result: { ok: false, code: 'not_allowed' } as ActionResult };
  const state = await loadHelperState(db, userId, now);
  const point = row.task.publicLat !== null && row.task.publicLng !== null ? { lat: row.task.publicLat, lng: row.task.publicLng } : null;
  const distanceMiles = state.center && point && row.task.mode !== 'remote' ? milesBetween(state.center, point) : null;
  if (offerBlockedReason(state.facts, taskFacts(row, distanceMiles), now)) return { ready: false as const, result: { ok: false, code: 'not_allowed' } as ActionResult };

  const rules = offerRulesFor(row.task, row.category);
  const parsed = createOfferInputSchema(rules).safeParse(input);
  if (!parsed.success) return { ready: false as const, result: validationFailed(parsed.error) };
  const offer = parsed.data;
  return {
    ready: true as const,
    row,
    values: {
      ...pricingColumns(offer.pricing),
      proposedStart: new Date(marketLocalToUtc(rules.date, offer.startTime)),
      message: offer.message,
      brings: offer.brings,
      expiresAt: offerExpiresAt(row.task.windowStart, now),
    },
  };
}

/** A new offer. One active offer per task; at most 25 active offers. */
export async function submitOffer(db: Db, userId: string, taskId: string, input: OfferInput, now: Date): Promise<ActionResult> {
  const limited = await consumeRateLimit(db, `offer:${userId}`, OFFER_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  await expireDueOffers(db, now, { helperUserId: userId });
  const prepared = await prepareOffer(db, userId, taskId, input, now);
  if (!prepared.ready) return prepared.result;
  const { row, values } = prepared;

  const [active] = await db
    .select({ value: count() })
    .from(offers)
    .where(and(eq(offers.helperUserId, userId), inArray(offers.status, ACTIVE)));
  const [existing] = await db
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.taskId, row.task.id), eq(offers.helperUserId, userId), inArray(offers.status, ACTIVE)))
    .limit(1);
  if (existing) return { ok: false, code: 'not_allowed' };
  if ((active?.value ?? 0) >= MAX_ACTIVE_OFFERS) return { ok: false, code: 'limit_reached' };

  const id = newId('off');
  try {
    await db.transaction(async (tx) => {
      await tx.insert(offers).values({ id, taskId: row.task.id, helperUserId: userId, status: 'pending', ...values, createdAt: now, updatedAt: now });
      await recordOfferEvent(tx, 'offer.submitted', userId, { id, taskId: row.task.id }, row.task.posterUserId);
    });
  } catch (error) {
    // The partial unique index: another request created the active offer first.
    if (isUniqueViolation(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }
  await refreshOfferCount(db, row.task.id);
  return { ok: true, code: 'sent' };
}

/**
 * The one-tap offer from find work (completion plan 4.3): on a fixed-price task, exactly the poster's price,
 * from the start of the task's window, with no message (the poster sees the helper's profile). Everything else is
 * an ordinary offer (`submitOffer`): the same eligibility, limits and rate limit. Hourly tasks need the helper's
 * own hours, so they go through the offer form.
 */
export async function submitQuickOffer(db: Db, userId: string, taskId: string, now: Date): Promise<ActionResult> {
  const row = await taskWithCategory(db, String(taskId));
  if (!row || row.task.status === 'draft') return { ok: false, code: 'not_found' };
  const budget = budgetOfTask(row.task);
  if (budget.type !== 'fixed') return { ok: false, code: 'not_allowed' };
  return submitOffer(db, userId, row.task.id, offerDefaultsFor(budget, offerRulesFor(row.task, row.category)), now);
}

/** Undo for a one-tap offer: withdraws the helper's active offer on the task (as "Withdraw" on the offer does). */
export async function withdrawOfferOnTask(db: Db, userId: string, taskId: string, now: Date): Promise<ActionResult> {
  const [active] = await db
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.taskId, String(taskId)), eq(offers.helperUserId, userId), inArray(offers.status, ACTIVE)))
    .limit(1);
  if (!active) return { ok: false, code: 'not_found' };
  return helperOfferAction(db, userId, active.id, 'withdraw_offer', now);
}

/** A new revision of the helper's active offer: back to pending, shown to the poster as new again. */
export async function reviseOffer(db: Db, userId: string, taskId: string, input: OfferInput, now: Date): Promise<ActionResult> {
  const prepared = await prepareOffer(db, userId, taskId, input, now);
  if (!prepared.ready) return prepared.result;
  const { row, values } = prepared;
  const [offer] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.taskId, row.task.id), eq(offers.helperUserId, userId), inArray(offers.status, ACTIVE)))
    .limit(1);
  if (!offer) return { ok: false, code: 'not_found' };
  if (offer.expiresAt <= now) return { ok: false, code: 'expired' };
  await db.transaction(async (tx) => {
    await tx
      .update(offers)
      .set({ ...values, status: 'pending', revision: offer.revision + 1, posterSeenAt: null, updatedAt: now })
      .where(eq(offers.id, offer.id));
    await recordOfferEvent(tx, 'offer.revised', userId, offer, row.task.posterUserId);
  });
  await refreshOfferCount(db, row.task.id);
  return { ok: true, code: 'updated' };
}

/** Withdraw or re-confirm the helper's own offer (only the actions the domain offers now). */
export async function helperOfferAction(db: Db, userId: string, offerId: string, action: OfferActionId, now: Date): Promise<ActionResult> {
  const [found] = await db
    .select({ offer: offers, task: tasks })
    .from(offers)
    .innerJoin(tasks, eq(tasks.id, offers.taskId))
    .where(and(eq(offers.id, String(offerId)), eq(offers.helperUserId, userId)))
    .limit(1);
  if (!found) return { ok: false, code: 'not_found' };
  if (ACTIVE.includes(found.offer.status as OfferStatus) && found.offer.expiresAt <= now) return { ok: false, code: 'expired' };
  const allowed = helperOfferActions(found.offer, found.task, now).find((item) => item.id === action);
  if (!allowed?.enabled) return { ok: false, code: 'not_allowed' };
  if (action === 'message_poster') {
    const threadId = await offerThreadId(db, found.offer.id, now);
    return threadId ? { ok: true, code: 'updated', redirectTo: routes.app.thread(threadId) } : { ok: false, code: 'not_found' };
  }
  if (action !== 'withdraw_offer' && action !== 'reconfirm_offer') return { ok: false, code: 'not_allowed' };

  await db.transaction(async (tx) => {
    if (action === 'withdraw_offer') {
      await tx.update(offers).set({ status: 'withdrawn', closedAt: now, updatedAt: now }).where(eq(offers.id, found.offer.id));
      await recordOfferEvent(tx, 'offer.withdrawn', userId, found.offer, found.task.posterUserId);
    } else {
      await tx
        .update(offers)
        .set({ status: 'pending', expiresAt: offerExpiresAt(found.task.windowStart, now), posterSeenAt: null, updatedAt: now })
        .where(eq(offers.id, found.offer.id));
      await recordOfferEvent(tx, 'offer.reconfirmed', userId, found.offer, found.task.posterUserId);
    }
  });
  await refreshOfferCount(db, found.task.id);
  return { ok: true, code: 'updated' };
}

// ---- My offers ----------------------------------------------------------------------------------

/** `/app/offers`: active soonest first; booked and closed newest first. */
export async function getMyOffers(db: Db, userId: string, now: Date): Promise<MyOffersPageData> {
  await expireDueOffers(db, now, { helperUserId: userId });
  const rows = await db.select().from(offers).where(eq(offers.helperUserId, userId)).orderBy(desc(offers.updatedAt));
  if (rows.length === 0) return { active: [], booked: [], closed: [] };

  const taskIds = [...new Set(rows.map((row) => row.taskId))];
  const views = new Map(
    (await Promise.all(taskIds.map((id) => findTaskWithPublicView(db, id)))).flatMap((found) =>
      found ? [[found.view.id, found] as const] : [],
    ),
  );
  const feesByMarket = new Map<string, FeeSchedule | null>();
  const toRow = async (row: OfferRow): Promise<MyOfferRow | null> => {
    const found = views.get(row.taskId);
    if (!found) return null;
    const marketId = found.row.marketId;
    if (!feesByMarket.has(marketId)) feesByMarket.set(marketId, await feesFor(db, marketId));
    const fees = feesByMarket.get(marketId);
    if (!fees) return null;
    const pricing = offerPricing(row);
    return {
      offer: {
        id: row.id,
        status: row.status as OfferStatus,
        pricing,
        proposedStart: row.proposedStart.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        revision: row.revision,
        breakdown: quoteBreakdown(fees, pricing),
      },
      task: found.view,
    };
  };
  const all = (await Promise.all(rows.map(toRow))).filter((row): row is MyOfferRow => row !== null);
  const byStart = (a: MyOfferRow, b: MyOfferRow) => Date.parse(a.offer.proposedStart) - Date.parse(b.offer.proposedStart);
  return {
    active: all.filter((row) => ACTIVE.includes(row.offer.status)).sort(byStart),
    booked: all.filter((row) => row.offer.status === 'accepted'),
    closed: all.filter((row) => ['declined', 'withdrawn', 'expired'].includes(row.offer.status)),
  };
}

/** Save for later, or Not interested (hidden from find work), on an open task; and back. */
export async function setTaskMark(db: Db, userId: string, input: { taskId: string; kind: 'saved' | 'hidden'; on: boolean }, now: Date): Promise<ActionResult> {
  const [task] = await db.select({ id: tasks.id, posterUserId: tasks.posterUserId }).from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.status, 'open'), gt(tasks.windowEnd, now))).limit(1);
  if (!task || task.posterUserId === userId) return { ok: false, code: 'not_found' };
  if (input.on) {
    await db.insert(taskMarks).values({ userId, taskId: task.id, kind: input.kind, createdAt: now }).onConflictDoNothing();
  } else {
    await db.delete(taskMarks).where(and(eq(taskMarks.userId, userId), eq(taskMarks.taskId, task.id), eq(taskMarks.kind, input.kind)));
  }
  return { ok: true, code: 'updated' };
}
