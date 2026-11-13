import { and, count, eq, gte, inArray, ne } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import { distanceKm } from '@/modules/markets/geo';
import { areas, categories } from '@/modules/markets/schema';
import { notifications } from '@/modules/notifications/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { tasks } from '@/modules/tasks/schema';
import { byReliability, reliabilityFacts } from '@/modules/profiles/reliability';
import { blockedPeopleOf } from '@/modules/trust/blocks';
import type { Db } from '@/platform/db/connect';
import { loadHelperState } from './helper';

/**
 * Task alerts (blueprint 02 J1): when a task is posted, the helpers it suits hear about it. A helper is told
 * when they're bookable in its category (background check and all), offer it, and either cover its area
 * (their area's center within their service radius of the task's public point) or, for a remote task,
 * take remote work. Not the poster, not anyone either of them blocked, and at most 3 alerts an hour and 10
 * a day, so a busy evening doesn't flood anyone.
 */
export const TASK_ALERT_LIMITS = { perHour: 3, perDay: 10 } as const;

const HOUR_MS = 3_600_000;

/**
 * Replacement alerts (blueprint 01 P2, automated replacement matching): when a booked helper cancels, up to 10
 * helpers the task suits, the most reliable first, hear that a client needs someone (never the helper who
 * canceled, nor the earlier offerers, who hear separately), at most 3 a day each.
 */
export const REPLACEMENT_ALERT_LIMITS = { perTask: 10, perDay: 3 } as const;

/** Helpers the open task suits: bookable in its category, offering it, covering its area (or remote), not blocked. */
async function suitableHelpers(db: Db, taskId: string, now: Date): Promise<string[]> {
  const [row] = await db
    .select({ task: tasks, categorySlug: categories.slug })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row || row.task.status !== 'open' || row.task.hiddenAt) return [];
  const { task } = row;

  const candidates = await db
    .select({ userId: helperProfiles.userId, radiusKm: helperProfiles.serviceRadiusKm, remoteOk: helperProfiles.remoteOk, lat: areas.centerLat, lng: areas.centerLng })
    .from(helperProfiles)
    .innerJoin(helperServices, and(eq(helperServices.userId, helperProfiles.userId), eq(helperServices.categoryId, task.categoryId), eq(helperServices.status, 'active')))
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(and(eq(helperProfiles.status, 'active'), eq(users.homeMarketId, task.marketId), eq(users.status, 'active'), ne(helperProfiles.userId, task.posterUserId)));
  if (candidates.length === 0) return [];

  const blocked = new Set(await blockedPeopleOf(db, task.posterUserId));
  const near = candidates.filter((helper) => {
    if (blocked.has(helper.userId)) return false;
    if (task.mode === 'remote') return helper.remoteOk;
    if (task.publicLat === null || task.publicLng === null) return false;
    return distanceKm({ lat: helper.lat, lng: helper.lng }, { lat: task.publicLat, lng: task.publicLng }) <= helper.radiusKm;
  });

  const out: string[] = [];
  for (const helper of near) {
    const state = await loadHelperState(db, helper.userId, now);
    if (state.facts.bookableCategories.includes(row.categorySlug as never)) out.push(helper.userId);
  }
  return out;
}

/** A new task's alerts: the helpers it suits, at most 3 an hour and 10 a day each. */
export async function helpersToAlert(db: Db, taskId: string, now: Date): Promise<string[]> {
  const out: string[] = [];
  for (const helperId of await suitableHelpers(db, taskId, now)) {
    const helper = { userId: helperId };
    const [lastHour] = await db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, helper.userId), eq(notifications.type, 'task_match'), gte(notifications.createdAt, new Date(now.getTime() - HOUR_MS))));
    if ((lastHour?.value ?? 0) >= TASK_ALERT_LIMITS.perHour) continue;
    const [lastDay] = await db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, helper.userId), eq(notifications.type, 'task_match'), gte(notifications.createdAt, new Date(now.getTime() - 24 * HOUR_MS))));
    if ((lastDay?.value ?? 0) >= TASK_ALERT_LIMITS.perDay) continue;
    out.push(helper.userId);
  }
  return out;
}

/** A reopened task's replacement alerts: the most reliable helpers it suits, leaving out `exclude`. */
export async function replacementHelpers(db: Db, taskId: string, exclude: string[], now: Date): Promise<string[]> {
  const suited = (await suitableHelpers(db, taskId, now)).filter((id) => !exclude.includes(id));
  if (suited.length === 0) return [];
  const [facts, profiles, users_] = await Promise.all([
    reliabilityFacts(db, suited, now),
    db.select({ userId: helperProfiles.userId, completedCount: helperProfiles.completedCount, ratingAverage: helperProfiles.ratingAverage }).from(helperProfiles).where(inArray(helperProfiles.userId, suited)),
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, suited)),
  ]);
  const ranked = suited
    .map((id) => {
      const profile = profiles.find((row) => row.userId === id);
      return { id, facts: facts.get(id)!, completedCount: profile?.completedCount ?? 0, ratingAverage: profile?.ratingAverage ?? null, name: users_.find((row) => row.id === id)?.name ?? '' };
    })
    .sort(byReliability);
  const out: string[] = [];
  for (const helper of ranked) {
    if (out.length >= REPLACEMENT_ALERT_LIMITS.perTask) break;
    const [today] = await db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, helper.id), eq(notifications.type, 'replacement_needed'), gte(notifications.createdAt, new Date(now.getTime() - 24 * HOUR_MS))));
    if ((today?.value ?? 0) >= REPLACEMENT_ALERT_LIMITS.perDay) continue;
    out.push(helper.id);
  }
  return out;
}
