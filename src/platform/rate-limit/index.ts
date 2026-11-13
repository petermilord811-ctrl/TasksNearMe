import { sql } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { rateLimits } from './schema';

/**
 * DB-backed fixed-window rate limits (blueprint 06 §3). Every call counts as one hit; the
 * (limit + 1)th hit inside a window is refused until the window ends.
 */
export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAt: Date };

export async function consumeRateLimit(
  db: Db,
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  const count = row?.count ?? 1;
  if (count > rule.limit) return { ok: false, retryAt: new Date(windowStart.getTime() + windowMs) };
  return { ok: true, remaining: rule.limit - count };
}

/**
 * Whether the window is already full, without counting a hit: for limits on failures only (count them with
 * `consumeRateLimit` when one happens), so successes never use up the allowance.
 */
export async function rateLimitReached(db: Db, key: string, rule: RateLimitRule, now: Date = new Date()): Promise<RateLimitResult> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(sql`${rateLimits.key} = ${key} and ${rateLimits.windowStart} = ${windowStart}`)
    .limit(1);
  const count = row?.count ?? 0;
  return count >= rule.limit ? { ok: false, retryAt: new Date(windowStart.getTime() + windowMs) } : { ok: true, remaining: rule.limit - count };
}

/** The first refusal among several rules, or ok. Every rule counts the hit. */
export async function consumeRateLimits(
  db: Db,
  checks: { key: string; rule: RateLimitRule }[],
  now: Date = new Date(),
): Promise<RateLimitResult> {
  let refused: RateLimitResult | undefined;
  for (const { key, rule } of checks) {
    const result = await consumeRateLimit(db, key, rule, now);
    if (!result.ok && (!refused || refused.ok || result.retryAt > refused.retryAt)) refused = result;
  }
  return refused ?? { ok: true, remaining: 0 };
}
