import { and, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { AdminMetricsPageData, CategorySlug, MetricsPeriodDays, RewardProgramCode, RewardStatus, StaffRole } from '@/contracts';
import { bookingCompletions, bookingTerms, bookings, helperStrikes } from '@/modules/bookings/schema';
import { areas, categories } from '@/modules/markets/schema';
import { offers } from '@/modules/offers/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { REWARD_BUDGETS, REWARD_RULES } from '@/modules/rewards/domain';
import { rewardGrants } from '@/modules/rewards/schema';
import { supportCases } from '@/modules/support/schema';
import type { StaffActor } from '@/modules/support/staff';
import { tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { computeMetrics, metricsPeriod, type BookingFact, type GrantFact, type MetricsFacts, type TaskFact } from './domain';

/**
 * `/admin/metrics` (B-067): loads the period's facts in a handful of reads and hands them to the pure
 * `computeMetrics`. Reward grants are read only for the roles that see money.
 */

/** Blueprint 08: finance keeps the budgets and sees payments in full; admins see everything. */
export const canSeeMetricsMoney = (roles: readonly StaffRole[]) => roles.includes('finance') || roles.includes('admin');

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));

export async function getAdminMetrics(db: Db, staff: StaffActor, days: MetricsPeriodDays, now: Date): Promise<AdminMetricsPageData> {
  const period = metricsPeriod(days, now);
  const { from } = period;
  const canSeeMoney = canSeeMetricsMoney(staff.roles);

  const firstOffers = db
    .select({ taskId: offers.taskId, at: sql<Date | string>`min(${offers.createdAt})`.as('first_offer_at') })
    .from(offers)
    .where(gte(offers.createdAt, from))
    .groupBy(offers.taskId)
    .as('first_offers');

  const [taskRows, offerRows, bookingRows, firstCompletions, strikeRows, disputeRows, grantRows] = await Promise.all([
    db
      .select({
        id: tasks.id,
        posterUserId: tasks.posterUserId,
        status: tasks.status,
        publishedAt: tasks.publishedAt,
        category: categories.slug,
        categoryName: categories.name,
        areaId: areas.id,
        areaName: areas.name,
        firstOfferAt: firstOffers.at,
      })
      .from(tasks)
      .innerJoin(categories, eq(categories.id, tasks.categoryId))
      .leftJoin(areas, eq(areas.id, tasks.publicAreaId))
      .leftJoin(firstOffers, eq(firstOffers.taskId, tasks.id))
      .where(and(isNotNull(tasks.publishedAt), gte(tasks.publishedAt, from), lte(tasks.publishedAt, now))),
    db.select({ createdAt: offers.createdAt }).from(offers).where(and(gte(offers.createdAt, from), lte(offers.createdAt, now))),
    db
      .select({ booking: bookings, breakdown: bookingTerms.breakdown, finalBreakdown: bookingCompletions.finalBreakdown })
      .from(bookings)
      .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
      .leftJoin(bookingCompletions, eq(bookingCompletions.bookingId, bookings.id))
      .where(or(gte(bookings.createdAt, from), gte(bookings.startAt, from), gte(bookings.completedAt, from))),
    db
      .select({ posterUserId: bookings.posterUserId, at: sql<Date | string>`min(${bookings.completedAt})` })
      .from(bookings)
      .where(and(eq(bookings.status, 'completed'), isNotNull(bookings.completedAt)))
      .groupBy(bookings.posterUserId),
    db
      .select({ bookingId: helperStrikes.bookingId })
      .from(helperStrikes)
      .innerJoin(bookings, eq(bookings.id, helperStrikes.bookingId))
      .where(and(isNull(helperStrikes.reversedAt), gte(bookings.startAt, from))),
    db
      .select({ bookingId: supportCases.bookingId })
      .from(supportCases)
      .innerJoin(bookings, eq(bookings.id, supportCases.bookingId))
      .where(and(eq(supportCases.type, 'dispute'), gte(bookings.startAt, from))),
    canSeeMoney ? db.select().from(rewardGrants) : Promise.resolve([]),
  ]);

  const helperIds = [...new Set(bookingRows.map((row) => row.booking.helperUserId))];
  const verifiedRows = helperIds.length
    ? await db
        .select({ userId: helperProfiles.userId, idVerifiedAt: helperProfiles.idVerifiedAt })
        .from(helperProfiles)
        .where(and(inArray(helperProfiles.userId, helperIds), isNotNull(helperProfiles.idVerifiedAt)))
    : [];

  const facts: MetricsFacts = {
    tasks: taskRows.map(
      (row): TaskFact => ({
        id: row.id,
        posterUserId: row.posterUserId,
        category: row.category as CategorySlug,
        categoryName: row.categoryName,
        ...(row.areaId ? { areaId: row.areaId, areaName: row.areaName ?? row.areaId } : {}),
        status: row.status,
        publishedAt: toDate(row.publishedAt),
        ...(row.firstOfferAt ? { firstOfferAt: toDate(row.firstOfferAt) } : {}),
      }),
    ),
    offerTimes: offerRows.map((row) => row.createdAt),
    bookings: bookingRows.map(
      ({ booking, breakdown, finalBreakdown }): BookingFact => ({
        id: booking.id,
        taskId: booking.taskId,
        posterUserId: booking.posterUserId,
        helperUserId: booking.helperUserId,
        status: booking.status,
        createdAt: booking.createdAt,
        startAt: booking.startAt,
        ...(booking.confirmedAt ? { confirmedAt: booking.confirmedAt } : {}),
        ...(booking.completedAt ? { completedAt: booking.completedAt } : {}),
        ...(booking.visitIndex ? { visitIndex: booking.visitIndex } : {}),
        breakdown: finalBreakdown ?? breakdown,
      }),
    ),
    firstCompletionByPoster: new Map(firstCompletions.map((row) => [row.posterUserId, toDate(row.at)])),
    strikeBookingIds: new Set(strikeRows.map((row) => row.bookingId)),
    disputeBookingIds: new Set(disputeRows.flatMap((row) => (row.bookingId ? [row.bookingId] : []))),
    helperIdVerifiedAt: new Map(verifiedRows.flatMap((row) => (row.idVerifiedAt ? [[row.userId, toDate(row.idVerifiedAt)] as const] : []))),
    grants: grantRows.map(
      (grant): GrantFact => ({
        helperUserId: grant.helperUserId,
        program: grant.program as RewardProgramCode,
        amountCents: grant.amountCents,
        status: grant.status as RewardStatus,
        createdAt: grant.createdAt,
        updatedAt: grant.updatedAt,
        ...(grant.deliveredAt ? { deliveredAt: grant.deliveredAt } : {}),
      }),
    ),
    budgets: REWARD_BUDGETS,
    monthlyCapCents: REWARD_RULES.monthlyCapCents,
  };
  return computeMetrics(facts, period, canSeeMoney);
}

/** `?days=` → a known period (anything else: 30 days). */
export function parseMetricsDays(value: string | string[] | undefined): MetricsPeriodDays {
  const one = Number(Array.isArray(value) ? value[0] : value);
  return one === 7 || one === 30 || one === 90 ? one : 30;
}
