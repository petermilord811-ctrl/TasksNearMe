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
