import {
  DIRECT_CHATS_PER_DAY,
  PLAN_DIRECT_CHATS_PER_DAY,
  SPARK_LEVEL_THRESHOLDS,
  SPARK_LEVELS,
  SPARK_RULES,
  SPARK_SOURCES,
  type PlanCode,
  type SparkLevel,
  type SparkSource,
  type SparksSummary,
} from '@/contracts';

/**
 * Sparks' rules as pure functions (owner, 2026-11-21; decisions.md). The numbers live in src/contracts/sparks.ts so
 * the page can state them.
 */

/** The level a total reaches. */
export function sparkLevel(total: number): SparkLevel {
  let level: SparkLevel = 'newcomer';
  for (const candidate of SPARK_LEVELS) if (total >= SPARK_LEVEL_THRESHOLDS[candidate]) level = candidate;
  return level;
}

/** The next level and the total it starts at; undefined at the top. */
export function nextSparkLevel(total: number): { level: SparkLevel; at: number } | undefined {
  const next = SPARK_LEVELS.find((level) => SPARK_LEVEL_THRESHOLDS[level] > total);
  return next ? { level: next, at: SPARK_LEVEL_THRESHOLDS[next] } : undefined;
}

/** New direct conversations a day: the level's allowance, or the person's plan's when that's more (Plus 25, Pro 100). */
export function directChatsPerDay(total: number, plans: Iterable<PlanCode>): number {
  return Math.max(DIRECT_CHATS_PER_DAY[sparkLevel(total)], ...[...plans].map((plan) => PLAN_DIRECT_CHATS_PER_DAY[plan]));
}

/**
 * How many of each thing count. Posts and replies arrive as per-day counts so each day's cap applies; the other
 * sources are plain counts.
 */
export interface SparkCounts {
  postsPerDay: readonly number[];
  repliesPerDay: readonly number[];
  helpful: number;
  thanks: number;
  bookings: number;
  reviews: number;
}

/**
 * Helpful and Thanks after the per-giver cap (sweep 2026-11-24 A2): `perGiver` holds, for each person who reacted, how
 * many of each kind they gave this person (posts and replies together), already limited to givers `SPARK_GIVER_RULES`
 * accepts. Each giver counts at most `SPARK_RULES[kind].perGiver` of each kind.
 */
export function cappedReactions(perGiver: Iterable<{ kind: string; count: number }>): { helpful: number; thanks: number } {
  const out = { helpful: 0, thanks: 0 };
  for (const { kind, count } of perGiver) {
    if (kind !== 'helpful' && kind !== 'thanks') continue;
    const cap = SPARK_RULES[kind].perGiver;
    out[kind] += Math.max(0, cap === undefined ? count : Math.min(count, cap));
  }
  return out;
}

/** The page's rule rows: what each source earns and its caps, in `SPARK_SOURCES` order. */
export function sparkRuleRows(): { source: SparkSource; points: number; dailyCap?: number; perGiver?: number }[] {
  return SPARK_SOURCES.map((source) => {
    const rule = SPARK_RULES[source];
    return { source, points: rule.points, ...(rule.dailyCap ? { dailyCap: rule.dailyCap } : {}), ...(rule.perGiver ? { perGiver: rule.perGiver } : {}) };
  });
}

const capped = (perDay: readonly number[], cap: number | undefined) => perDay.reduce((sum, count) => sum + Math.max(0, cap === undefined ? count : Math.min(count, cap)), 0);

/** Earned Sparks, with what each source gave, in `SPARK_SOURCES` order. */
export function earnedSparks(counts: SparkCounts): { earned: number; breakdown: { source: SparkSource; count: number; points: number }[] } {
  const counted: Record<SparkSource, number> = {
    posts: capped(counts.postsPerDay, SPARK_RULES.posts.dailyCap),
    replies: capped(counts.repliesPerDay, SPARK_RULES.replies.dailyCap),
    helpful: Math.max(0, counts.helpful),
    thanks: Math.max(0, counts.thanks),
    bookings: Math.max(0, counts.bookings),
    reviews: Math.max(0, counts.reviews),
  };
  const breakdown = SPARK_SOURCES.map((source) => ({ source, count: counted[source], points: counted[source] * SPARK_RULES[source].points }));
  return { earned: breakdown.reduce((sum, row) => sum + row.points, 0), breakdown };
}

/** What others see: the total with the bought part, or nothing for someone with none. */
export function sparksSummary(earned: number, bought: number): SparksSummary | undefined {
  const total = Math.max(0, earned) + Math.max(0, bought);
  if (total <= 0) return undefined;
  return { total, bought: Math.max(0, bought), level: sparkLevel(total) };
}
