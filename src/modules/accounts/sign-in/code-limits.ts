import type { ActionResult } from '@/contracts';
import { rateLimited } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { consumeRateLimits, releaseRateLimit, type RateLimitRule } from '@/platform/rate-limit';

/** Sign-in codes by email: per address, per address a day, and per network. */
export const EMAIL_SEND_RULES = {
  perEmail: { limit: 3, windowSeconds: 10 * 60 },
  /** A day's codes to one address (security review 2026-11-20): enough to sign in on every device, not 400 emails. */
  perEmailDay: { limit: 20, windowSeconds: 24 * 3600 },
  perIp: { limit: 10, windowSeconds: 10 * 60 },
};

export function emailCodeLimits(email: string, ip: string | null): { key: string; rule: RateLimitRule }[] {
  return [
    { key: `email-code:email:${email}`, rule: EMAIL_SEND_RULES.perEmail },
    { key: `email-code:email-day:${email}`, rule: EMAIL_SEND_RULES.perEmailDay },
    ...(ip ? [{ key: `email-code:ip:${ip}`, rule: EMAIL_SEND_RULES.perIp }] : []),
  ];
}

/**
 * Asks for a code within its limits. Each ask is counted first, atomically, so parallel asks can't all pass a read of
 * the count. One that didn't go out (`unavailable`: the provider refused or didn't answer) is given back: nobody can
 * cause a provider outage, so it doesn't count against the address or the network (ab, when things break 2026-11-21).
 */
export async function askForCodeWithinLimits(db: Db, limits: { key: string; rule: RateLimitRule }[], ask: () => Promise<ActionResult>, now: Date = new Date()): Promise<ActionResult> {
  const limited = await consumeRateLimits(db, limits, now);
  if (!limited.ok) return rateLimited(limited.retryAt);
  const result = await ask();
  if (!result.ok && result.code === 'unavailable') for (const { key, rule } of limits) await releaseRateLimit(db, key, rule, now);
  return result;
}
