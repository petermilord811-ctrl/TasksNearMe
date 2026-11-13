import { and, count, eq, gte, ne } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import { distanceKm } from '@/modules/markets/geo';
import { areas, categories } from '@/modules/markets/schema';
import { notifications } from '@/modules/notifications/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { tasks } from '@/modules/tasks/schema';
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

export async function helpersToAlert(db: Db, taskId: string, now: Date): Promise<string[]> {
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
    if (!state.facts.bookableCategories.includes(row.categorySlug as never)) continue;
    const [lastHour] = await db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, helper.userId), eq(notifications.type, 'task_match'), gte(notifications.createdAt, new Date(now.getTime() - HOUR_MS))));
    if ((lastHour?.value ?? 0) >= TASK_ALERT_LIMITS.perHour) continue;
    const [lastDay] = await db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, helper.userId), eq(notifications.type, 'task_match'), gte(notifications.createdAt, new Date(now.getTime() - 24 * HOUR_MS))));
    if ((lastDay?.value ?? 0) >= TASK_ALERT_LIMITS.perDay) continue;
    out.push(helper.userId);
  }
  return out;
}
