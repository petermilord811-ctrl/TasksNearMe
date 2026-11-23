import { inArray } from 'drizzle-orm';
import type { PlanCode } from '@/contracts';
import type { Db } from '@/platform/db/connect';
import { planCounts } from './domain';
import { subscriptions } from './schema';
import { activePlans } from './service';

/**
 * What the plans give (LinkedIn-Premium-style since 2026-11-23, decisions.md; no service fees, so nothing is paid back),
 * a ladder since the owner's second change that day, each plan with everything in the one before:
 * - Plus: more AI searches (5 a day, 150 a month), new direct conversations, saved searches and instant alerts.
 * - Pro: no hold fee when a helper asks to be paid upfront and TasksNearMe holds the money (owner: "Pro only no fee");
 *   unlimited AI search; the most new direct conversations, saved searches and instant alerts; and for helpers, offers
 *   first on a client's list with a Pro badge, and offer insights on every task.
 * The numbers: `DEFAULT_PLANS` (AI search, per market policy) and the contracts' constants (the rest).
 */

/** A Pro member pays no hold fee on a booking TasksNearMe holds the money for (Plus doesn't waive it since 2026-11-23). */
export async function waivesHoldFee(db: Db, userId: string, now: Date): Promise<boolean> {
  return (await activePlans(db, userId, now)).has('pro');
}

/** Whether this person has an active plan of this kind. */
export async function hasPlan(db: Db, userId: string, plan: PlanCode, now: Date): Promise<boolean> {
  return (await activePlans(db, userId, now)).has(plan);
}

/** Each of these people's plans that count now (none: Starter), in one read. */
export async function plansAmong(db: Pick<Db, 'select'>, userIds: readonly string[], now: Date): Promise<Map<string, Set<PlanCode>>> {
  const out = new Map<string, Set<PlanCode>>();
  if (userIds.length === 0) return out;
  const rows = await db.select().from(subscriptions).where(inArray(subscriptions.userId, [...new Set(userIds)]));
  for (const row of rows) {
    if (!planCounts(row, now)) continue;
    const held = out.get(row.userId) ?? new Set<PlanCode>();
    held.add(row.plan as PlanCode);
    out.set(row.userId, held);
  }
  return out;
}

/** Of these helpers, the ones with an active Pro plan (their offers first, a badge), in one read. */
export async function proHelpersAmong(db: Pick<Db, 'select'>, userIds: readonly string[], now: Date): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.select().from(subscriptions).where(inArray(subscriptions.userId, [...new Set(userIds)]));
  return new Set(rows.filter((row) => row.plan === 'pro' && planCounts(row, now)).map((row) => row.userId));
}
