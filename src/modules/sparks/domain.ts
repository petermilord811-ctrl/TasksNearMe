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
