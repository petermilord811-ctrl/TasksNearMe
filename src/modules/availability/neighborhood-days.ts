import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import type { ActionResult, AvailabilityStatus, NeighborhoodDayInput } from '@/contracts';
import { neighborhoodDayInputSchema } from '@/contracts';
import type { PaymentProvider } from '@/integrations/payments';
import { categories } from '@/modules/markets/schema';
import { marketTimeZone } from '@/modules/markets/time-zone';
import { loadHelperState } from '@/modules/offers/helper';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';
import { neighborhoodAreasOf } from './day-cards';
import { canCancelDay } from './neighborhood-day-domain';
import { availabilityPosts, neighborhoodDays } from './schema';
import { AVAILABILITY_RULES, cancelAvailabilityPost, expireDuePosts } from './service';

/**
 * Neighborhood days (2026-11-24; blueprint 02 J3 step 5): a helper's visits on one date in one neighborhood of their
 * service area, published together. Each visit is an availability post (`day_id`), so the slot rules hold for each
 * one (3 h lead, within 14 days, at most 12 h, no overlap with the helper's other posts, at most 10 open posts in all)
 * and a request for one is the ordinary slot request. The price per visit is fixed; a neighbor price is the helper's
 * choice and must be lower than their usual price.
 */

const HOUR = 3_600_000;
const DAY = 86_400_000;
const TAKEN: AvailabilityStatus[] = ['active', 'held', 'booked'];
const OPEN: AvailabilityStatus[] = ['active', 'held'];

const visitError = (index: number, field: 'startTime' | 'endTime'): ActionResult => ({ ok: false, code: 'validation_failed', fieldErrors: { [`visits.${index}.${field}`]: ['out_of_range'] } });

/** Opens a day (the rules above): the day and its visits in one write. */
export async function createNeighborhoodDay(db: Db, helperId: string, input: NeighborhoodDayInput, now: Date): Promise<ActionResult> {
  const parsed = neighborhoodDayInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { areaSlug, categorySlug, date, visits, priceCents, neighborPriceCents } = parsed.data;
  const state = await loadHelperState(db, helperId, now);
  if (!state.setup.bookable || !state.marketId) return { ok: false, code: 'not_allowed' };
  if (!state.setup.bookableCategories.includes(categorySlug)) return { ok: false, code: 'validation_failed', fieldErrors: { categorySlug: ['invalid'] } };
  const area = (await neighborhoodAreasOf(db, helperId)).find((choice) => choice.slug === areaSlug);
  if (!area) return { ok: false, code: 'validation_failed', fieldErrors: { areaSlug: ['invalid'] } };
  const timeZone = await marketTimeZone(db, state.marketId);
  const lastDate = marketDayKey(new Date(now.getTime() + AVAILABILITY_RULES.maxDaysAhead * DAY), timeZone);
  if (date < marketDayKey(now, timeZone) || date > lastDate) return { ok: false, code: 'validation_failed', fieldErrors: { date: ['out_of_range'] } };
  const windows = visits.map((visit) => ({ start: new Date(marketLocalToUtc(date, visit.startTime, timeZone)), end: new Date(marketLocalToUtc(date, visit.endTime, timeZone)) }));
  for (const [index, { start, end }] of windows.entries()) {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { ok: false, code: 'validation_failed', fieldErrors: { [`visits.${index}.startTime`]: ['invalid'] } };
    if (start.getTime() - now.getTime() < AVAILABILITY_RULES.leadHours * HOUR) return visitError(index, 'startTime');
    if (end <= start || end.getTime() - start.getTime() > AVAILABILITY_RULES.maxHours * HOUR) return visitError(index, 'endTime');
  }

  await expireDuePosts(db, now);
  const mine = await db.select().from(availabilityPosts).where(and(eq(availabilityPosts.helperUserId, helperId), inArray(availabilityPosts.status, TAKEN), gt(availabilityPosts.endAt, now)));
  const clash = windows.findIndex(({ start, end }) => mine.some((row) => row.startAt < end && row.endAt > start));
  if (clash >= 0) return visitError(clash, 'startTime');
  const openCount = mine.filter((row) => OPEN.includes(row.status as AvailabilityStatus) && row.startAt > now).length;
  if (openCount + windows.length > AVAILABILITY_RULES.maxActive) return { ok: false, code: 'limit_reached' };
  const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, categorySlug)).limit(1);
  if (!category) return { ok: false, code: 'validation_failed', fieldErrors: { categorySlug: ['invalid'] } };

  const dayId = newId('nday');
  await db.transaction(async (tx) => {
    await tx.insert(neighborhoodDays).values({ id: dayId, helperUserId: helperId, marketId: state.marketId!, areaId: area.id, categoryId: category.id, day: date, priceCents, neighborPriceCents: neighborPriceCents ?? null, status: 'open', createdAt: now, updatedAt: now });
    await tx.insert(availabilityPosts).values(windows.map(({ start, end }) => ({
      id: newId('avl'),
      helperUserId: helperId,
      marketId: state.marketId!,
      categoryId: category.id,
      startAt: start,
      endAt: end,
      // A fixed price per visit: the neighbor price when the helper chose one.
      pricingType: 'fixed',
      priceCents: neighborPriceCents ?? priceCents,
      status: 'active',
      dayId,
      createdAt: now,
      updatedAt: now,
    })));
  });
  return { ok: true, code: 'saved' };
}

/** The helper cancels the visits still open or requested (a waiting request is declined); booked visits go ahead. */
/**
 * Every open day of a helper our team suspended or banned (sweep 2026-11-24 A5), canceled as the helper's own Cancel
 * does: waiting and still-authorizing requests are declined and their holds released. Visits already booked stay
 * bookings. Returns how many days were canceled.
 */
export async function cancelOpenNeighborhoodDays(db: Db, payments_: PaymentProvider | null, helperId: string, now: Date): Promise<number> {
  const days = await db.select({ id: neighborhoodDays.id }).from(neighborhoodDays).where(and(eq(neighborhoodDays.helperUserId, helperId), eq(neighborhoodDays.status, 'open')));
  let canceled = 0;
  for (const day of days) if ((await cancelNeighborhoodDay(db, payments_, helperId, day.id, now)).ok) canceled += 1;
  return canceled;
}

export async function cancelNeighborhoodDay(db: Db, payments_: PaymentProvider | null, helperId: string, dayId: string, now: Date): Promise<ActionResult> {
  const [day] = await db.select().from(neighborhoodDays).where(and(eq(neighborhoodDays.id, String(dayId)), eq(neighborhoodDays.helperUserId, helperId))).limit(1);
  if (!day) return { ok: false, code: 'not_allowed' };
  const visits = await db.select().from(availabilityPosts).where(eq(availabilityPosts.dayId, day.id)).orderBy(desc(availabilityPosts.startAt));
  if (!canCancelDay(day.status, visits.map((visit) => ({ status: visit.status as AvailabilityStatus, end: visit.endAt })), now)) return { ok: false, code: 'not_allowed' };
  // Claim the day first, so a second tap answers not_allowed instead of canceling twice.
  const claimed = await db.update(neighborhoodDays).set({ status: 'canceled', canceledAt: now, updatedAt: now }).where(and(eq(neighborhoodDays.id, day.id), eq(neighborhoodDays.status, 'open'))).returning({ id: neighborhoodDays.id });
  if (claimed.length === 0) return { ok: false, code: 'not_allowed' };
  for (const visit of visits) {
    if (OPEN.includes(visit.status as AvailabilityStatus) && visit.endAt > now) await cancelAvailabilityPost(db, payments_, helperId, visit.id, now);
  }
  return { ok: true, code: 'canceled' };
}
