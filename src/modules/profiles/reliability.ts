import { and, count, gte, inArray, isNull, sql } from 'drizzle-orm';
import { bookings, helperStrikes } from '@/modules/bookings/schema';
import type { Db } from '@/platform/db/connect';

/**
 * Ranking helpers by reliability (blueprint 01 P2, "ranking by reliability"). Over the last 12 months: the bookings a
 * helper completed against the ones they canceled or didn't show up for, and the strikes that stand. Pure rules
 * with a small prior, so a new helper starts in the middle instead of at the top or the bottom; plus a loader.
 */

export const RELIABILITY_RULES = {
  windowDays: 365,
  /** "Reliable": at least this many completed bookings, no no-show or strike, and few cancellations. */
  reliableMinCompleted: 5,
  reliableMaxCancelRate: 0.1,
} as const;

export interface ReliabilityFacts {
  completed: number;
  /** Bookings the helper canceled. */
  canceled: number;
  noShows: number;
  /** Strikes that weren't reversed. */
  strikes: number;
}

export const NO_HISTORY: ReliabilityFacts = { completed: 0, canceled: 0, noShows: 0, strikes: 0 };

/**
 * A score from 0 to 1: kept bookings over all, a no-show counting twice and a strike once more, with a prior of
 * three kept bookings out of four (a new helper scores 0.75; a perfect record climbs toward 1).
 */
export function reliabilityScore(facts: ReliabilityFacts): number {
  const kept = facts.completed + 3;
  const all = facts.completed + facts.canceled + 2 * facts.noShows + facts.strikes + 4;
  return kept / all;
}

/** The "Reliable" mark: enough completed work, no no-show or strike, and at most 1 in 10 canceled. */
export function isReliable(facts: ReliabilityFacts): boolean {
  if (facts.completed < RELIABILITY_RULES.reliableMinCompleted || facts.noShows > 0 || facts.strikes > 0) return false;
  return facts.canceled / (facts.completed + facts.canceled) <= RELIABILITY_RULES.reliableMaxCancelRate;
}

/** Ranks helpers: the most reliable first, then the most completed work, then the best rated, then by name. */
export function byReliability<T extends { facts: ReliabilityFacts; completedCount: number; ratingAverage: number | null; name: string }>(a: T, b: T): number {
  return reliabilityScore(b.facts) - reliabilityScore(a.facts) || b.completedCount - a.completedCount || (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) || a.name.localeCompare(b.name);
}

/** The helpers' facts over the last 12 months (helpers with no history get `NO_HISTORY`). */
export async function reliabilityFacts(db: Db, helperIds: string[], now: Date): Promise<Map<string, ReliabilityFacts>> {
  const out = new Map<string, ReliabilityFacts>(helperIds.map((id) => [id, { ...NO_HISTORY }]));
  if (helperIds.length === 0) return out;
  const since = new Date(now.getTime() - RELIABILITY_RULES.windowDays * 86_400_000);
  const [outcomes, strikes] = await Promise.all([
    db
      .select({
        helperId: bookings.helperUserId,
        completed: sql<number>`count(*) filter (where ${bookings.status} = 'completed')`.mapWith(Number),
        canceled: sql<number>`count(*) filter (where ${bookings.status} = 'canceled' and ${bookings.cancelReason} = 'helper')`.mapWith(Number),
        noShows: sql<number>`count(*) filter (where ${bookings.status} = 'canceled' and ${bookings.cancelReason} = 'helper_no_show')`.mapWith(Number),
      })
      .from(bookings)
      .where(and(inArray(bookings.helperUserId, helperIds), gte(bookings.startAt, since)))
      .groupBy(bookings.helperUserId),
    db
      .select({ helperId: helperStrikes.helperUserId, strikes: count() })
      .from(helperStrikes)
      .where(and(inArray(helperStrikes.helperUserId, helperIds), isNull(helperStrikes.reversedAt), gte(helperStrikes.createdAt, since)))
      .groupBy(helperStrikes.helperUserId),
  ]);
  for (const row of outcomes) out.set(row.helperId, { ...out.get(row.helperId)!, completed: row.completed, canceled: row.canceled, noShows: row.noShows });
  for (const row of strikes) out.set(row.helperId, { ...out.get(row.helperId)!, strikes: Number(row.strikes) });
  return out;
}

/** One helper's facts. */
export async function reliabilityOf(db: Db, helperId: string, now: Date): Promise<ReliabilityFacts> {
  return (await reliabilityFacts(db, [helperId], now)).get(helperId) ?? { ...NO_HISTORY };
}

