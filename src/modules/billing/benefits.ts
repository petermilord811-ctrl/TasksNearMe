import { inArray } from 'drizzle-orm';
import type { PlanCode } from '@/contracts';
import type { Db } from '@/platform/db/connect';
import { planCounts } from './domain';
import { subscriptions } from './schema';
import { activePlans } from './service';

/**
 * What the plans give (LinkedIn-Premium-style since 2026-11-23, decisions.md; no service fees, so nothing is paid back):
 * - Plus (clients): no hold fee when a helper asks to be paid upfront and TasksNearMe holds the money; more AI searches.
 * - Pro (helpers): their offers come first on a client's list, with a Pro badge; offer insights on every task (how many
 *   offers and their price range); more AI searches.
 */

/** A Plus member pays no hold fee on a booking TasksNearMe holds the money for. */
export async function waivesHoldFee(db: Db, userId: string, now: Date): Promise<boolean> {
  return (await activePlans(db, userId, now)).has('plus');
}

/** Whether this person has an active plan of this kind. */
export async function hasPlan(db: Db, userId: string, plan: PlanCode, now: Date): Promise<boolean> {
  return (await activePlans(db, userId, now)).has(plan);
}

/** Of these helpers, the ones with an active Pro plan (their offers first, a badge), in one read. */
export async function proHelpersAmong(db: Pick<Db, 'select'>, userIds: readonly string[], now: Date): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.select().from(subscriptions).where(inArray(subscriptions.userId, [...new Set(userIds)]));
  return new Set(rows.filter((row) => row.plan === 'pro' && planCounts(row, now)).map((row) => row.userId));
}
