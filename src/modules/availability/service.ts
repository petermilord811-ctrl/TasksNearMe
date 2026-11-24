import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm';
import type { ActionResult, AvailabilityPostInput, AvailabilityPostView, AvailabilityStatus, CategorySlug, InviteStatus, MyAvailabilityPageData, PricingInput } from '@/contracts';
import { availabilityPostInputSchema } from '@/contracts';
import type { PaymentProvider } from '@/integrations/payments';
import { clientSummary } from '@/modules/bookings/hub';
import { invites } from '@/modules/invites/schema';
import { closeSlotRequests, listedPricingOf } from '@/modules/invites/service';
import { areas, categories } from '@/modules/markets/schema';
import { loadHelperState } from '@/modules/offers/helper';
import { helperProfiles } from '@/modules/profiles/schema';
import { marketTimeZone, userTimeZone } from '@/modules/markets/time-zone';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';
import { myNeighborhoodDays } from './day-cards';
import { availabilityPosts, neighborhoodDays } from './schema';
import { slotViewOf, type PostRow } from './slots';

/**
 * Availability posts (UI-029; blueprint 02 J3 step 4): a helper's open slots. Requests for a slot go through
 * the invites service, which holds, frees and books the slot (`./slots`).
 *
 * Rules: one of the helper's bookable categories; starts at least 3 h from now and within 14 days (market
 * time); lasts at most 12 h; doesn't overlap the helper's other open, requested or booked posts; at most 10
 * open or requested posts. The area is the helper's service area.
 */

export const AVAILABILITY_RULES = { leadHours: 3, maxDaysAhead: 14, maxHours: 12, maxActive: 10 } as const;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const KM_PER_MILE = 1.609344;
const OPEN_POSTS: AvailabilityStatus[] = ['active', 'held'];
const TAKEN: AvailabilityStatus[] = ['active', 'held', 'booked'];
const WAITING: InviteStatus[] = ['authorizing', 'sent', 'countered'];

/** Open slots past their start expire (lazily and from the job runner). Requested ones wait for their request. */
export async function expireDuePosts(db: Db, now: Date): Promise<number> {
  const expired = await db
    .update(availabilityPosts)
    .set({ status: 'expired', updatedAt: now })
    .where(and(eq(availabilityPosts.status, 'active'), lte(availabilityPosts.startAt, now)))
    .returning({ id: availabilityPosts.id });
  return expired.length;
}

/** The helper's handle and service area ("East Austin", 5 mi), as on their public profile. */
export async function helperAreaOf(db: Db, helperId: string): Promise<{ handle: string; areaName: string; radiusMiles: number } | null> {
  const [row] = await db
    .select({ handle: helperProfiles.handle, radiusKm: helperProfiles.serviceRadiusKm, areaName: areas.name })
    .from(helperProfiles)
    .leftJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(eq(helperProfiles.userId, helperId))
    .limit(1);
  return row ? { handle: row.handle, areaName: row.areaName ?? '', radiusMiles: Math.max(1, Math.floor(row.radiusKm / KM_PER_MILE)) } : null;
}

const activeCountOf = (rows: PostRow[], now: Date) => rows.filter((row) => OPEN_POSTS.includes(row.status as AvailabilityStatus) && row.startAt > now).length;

/** `routes.app.availability()`: upcoming posts soonest first, then the ten latest past or canceled ones. */
export async function getMyAvailabilityPage(db: Db, helperId: string, now: Date): Promise<MyAvailabilityPageData> {
  await expireDuePosts(db, now);
  const [state, area, listedPricing, neighborhood, rows] = await Promise.all([
    loadHelperState(db, helperId, now),
    helperAreaOf(db, helperId),
    listedPricingOf(db, helperId),
    myNeighborhoodDays(db, helperId, now),
    db
      .select({ row: availabilityPosts, slug: categories.slug })
      .from(availabilityPosts)
      .innerJoin(categories, eq(categories.id, availabilityPosts.categoryId))
      .where(eq(availabilityPosts.helperUserId, helperId))
      .orderBy(asc(availabilityPosts.startAt)),
  ]);
  const upcoming = rows.filter(({ row }) => OPEN_POSTS.includes(row.status as AvailabilityStatus) || (row.status === 'booked' && row.endAt > now));
  const past = rows.filter((item) => !upcoming.includes(item)).reverse().slice(0, 10);
  const shown = [...upcoming, ...past];
  const requests = shown.length
    ? await db
        .select({ id: invites.id, slotId: invites.slotId, status: invites.status, posterUserId: invites.posterUserId, bookingId: invites.bookingId, createdAt: invites.createdAt })
        .from(invites)
        .where(and(inArray(invites.slotId, shown.map(({ row }) => row.id)), inArray(invites.status, [...WAITING, 'accepted'])))
    : [];
  // A visit of a neighborhood day shows its neighborhood (2026-11-24); the helper's days are the latest ones, so look the rest up.
  const dayIds = [...new Set(shown.flatMap(({ row }) => (row.dayId ? [row.dayId] : [])))];
  const dayAreas = new Map(dayIds.length ? (await db.select({ id: neighborhoodDays.id, name: areas.name }).from(neighborhoodDays).innerJoin(areas, eq(areas.id, neighborhoodDays.areaId)).where(inArray(neighborhoodDays.id, dayIds))).map((day) => [day.id, day.name] as const) : []);
  const clients = new Map(await Promise.all([...new Set(requests.map((request) => request.posterUserId))].map(async (id) => [id, await clientSummary(db, id)] as const)));
  const posts = shown.map(({ row, slug }): AvailabilityPostView => {
    const status = row.status as AvailabilityStatus;
    const request = requests.find((item) => item.slotId === row.id && (status === 'booked' ? item.status === 'accepted' : WAITING.includes(item.status as InviteStatus)));
    const client = request ? clients.get(request.posterUserId) : undefined;
    return {
      ...slotViewOf(row, slug as CategorySlug),
      status,
      areaName: area?.areaName ?? '',
      radiusMiles: area?.radiusMiles ?? 1,
      ...(row.dayId && dayAreas.has(row.dayId) ? { dayAreaName: dayAreas.get(row.dayId)! } : {}),
      ...(request && client && (status === 'held' || status === 'booked') ? { request: { inviteId: request.id, client, status: request.status as InviteStatus } } : {}),
      ...(status === 'booked' && request?.bookingId ? { bookingId: request.bookingId } : {}),
      actions: OPEN_POSTS.includes(status) ? ['cancel_post'] : [],
    };
  });
  // The helper's market (their home market without an area): the form and the posts are on its clock (plan 8.1).
  const timeZone = state.marketId ? await marketTimeZone(db, state.marketId) : await userTimeZone(db, helperId);
  return {
    posts,
    setup: state.setup,
    areaName: area?.areaName ?? '',
    radiusMiles: area?.radiusMiles ?? 1,
    listedPricing,
    limits: {
      firstDate: marketDayKey(now, timeZone),
      lastDate: marketDayKey(new Date(now.getTime() + AVAILABILITY_RULES.maxDaysAhead * DAY), timeZone),
      leadHours: AVAILABILITY_RULES.leadHours,
      maxHours: AVAILABILITY_RULES.maxHours,
      maxActive: AVAILABILITY_RULES.maxActive,
      activeCount: activeCountOf(rows.map(({ row }) => row), now),
    },
    timeZone,
    // Neighborhood days (2026-11-24): once the helper has an area to choose neighborhoods from.
    ...(neighborhood.areas.length > 0 || neighborhood.days.length > 0 ? { neighborhood } : {}),
  };
}

const pricingColumns = (pricing: PricingInput) => ({
  pricingType: pricing.type,
  priceCents: pricing.type === 'fixed' ? pricing.priceCents : null,
  hourlyRateCents: pricing.type === 'hourly' ? pricing.rateCents : null,
  estimatedHours: pricing.type === 'hourly' ? pricing.estimatedHours : null,
  hoursCap: pricing.type === 'hourly' ? pricing.hoursCap : null,
});

const outOfRange = (field: 'date' | 'startTime' | 'endTime'): ActionResult => ({ ok: false, code: 'validation_failed', fieldErrors: { [field]: ['out_of_range'] } });

/** A new open slot (see the rules above). */
export async function createAvailabilityPost(db: Db, helperId: string, input: AvailabilityPostInput, now: Date): Promise<ActionResult> {
  const parsed = availabilityPostInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { categorySlug, date, startTime, endTime, pricing } = parsed.data;
  const state = await loadHelperState(db, helperId, now);
  if (!state.setup.bookable || !state.marketId) return { ok: false, code: 'not_allowed' };
  if (!state.setup.bookableCategories.includes(categorySlug)) return { ok: false, code: 'validation_failed', fieldErrors: { categorySlug: ['invalid'] } };
  // The slot is in the helper's market, on its clock (completion plan 8.1).
  const timeZone = await marketTimeZone(db, state.marketId);
  const lastDate = marketDayKey(new Date(now.getTime() + AVAILABILITY_RULES.maxDaysAhead * DAY), timeZone);
  if (date < marketDayKey(now, timeZone) || date > lastDate) return outOfRange('date');
  const start = new Date(marketLocalToUtc(date, startTime, timeZone));
  const end = new Date(marketLocalToUtc(date, endTime, timeZone));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { ok: false, code: 'validation_failed', fieldErrors: { startTime: ['invalid'] } };
  if (start.getTime() - now.getTime() < AVAILABILITY_RULES.leadHours * HOUR) return outOfRange('startTime');
  if (end <= start || end.getTime() - start.getTime() > AVAILABILITY_RULES.maxHours * HOUR) return outOfRange('endTime');

  await expireDuePosts(db, now);
  const mine = await db.select().from(availabilityPosts).where(and(eq(availabilityPosts.helperUserId, helperId), inArray(availabilityPosts.status, TAKEN), gt(availabilityPosts.endAt, now)));
  if (mine.some((row) => row.startAt < end && row.endAt > start)) return outOfRange('startTime');
  if (activeCountOf(mine, now) >= AVAILABILITY_RULES.maxActive) return { ok: false, code: 'limit_reached' };
  const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, categorySlug)).limit(1);
  if (!category) return { ok: false, code: 'validation_failed', fieldErrors: { categorySlug: ['invalid'] } };

  await db.insert(availabilityPosts).values({
    id: newId('avl'),
    helperUserId: helperId,
    marketId: state.marketId,
    categoryId: category.id,
    startAt: start,
    endAt: end,
    ...pricingColumns(pricing),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, code: 'saved' };
}

/** The helper cancels an open or requested slot; a waiting request is declined and its hold released. */
export async function cancelAvailabilityPost(db: Db, payments_: PaymentProvider | null, helperId: string, postId: string, now: Date): Promise<ActionResult> {
  const [canceled] = await db
    .update(availabilityPosts)
    .set({ status: 'canceled', canceledAt: now, updatedAt: now })
    .where(and(eq(availabilityPosts.id, String(postId)), eq(availabilityPosts.helperUserId, helperId), inArray(availabilityPosts.status, OPEN_POSTS), gt(availabilityPosts.endAt, now)))
    .returning({ id: availabilityPosts.id });
  if (!canceled) return { ok: false, code: 'not_allowed' };
  await closeSlotRequests(db, payments_, canceled.id, now);
  return { ok: true, code: 'canceled' };
}
