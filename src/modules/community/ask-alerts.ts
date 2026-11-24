import { and, count, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import type { ActionResult } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { distanceKm } from '@/modules/markets/geo';
import { areas, categories } from '@/modules/markets/schema';
import { notificationPreferences, notifications } from '@/modules/notifications/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { blockedPeopleOf } from '@/modules/trust/blocks';
import type { Db } from '@/platform/db/connect';
import { realRowsOnly, samplesHiddenInThisBuild } from '@/shared/sample-data';
import { ASK_ALERT_TYPE_LIST, ASK_ALERTS_PREFERENCE, ASK_MATCH_LIMITS, askAlertsOn, askAlertTypeFor } from './domain';

/**
 * Ask alerts (plan 10.11; the owner's default, 2026-11-22; questions too since 2026-11-24): when a neighbor asks who to
 * hire for a service, or asks a question and picks the service ("Ask helpers who do this"), the helpers who offer it
 * there hear about it, so they can answer (a helper's own name counts least in a recommendation thread). Active helpers
 * in the market offering the service, whose area covers the post's neighborhood (any helper of the market for a
 * citywide post), never its author or anyone either of them blocked, nor a helper who turned these alerts off
 * (`ASK_ALERTS_PREFERENCE`); at most `ASK_MATCH_LIMITS.perDay` a day each, both kinds together, and
 * `ASK_MATCH_LIMITS.perPost` helpers per ask, those with the most finished work first.
 */
export async function helpersForAsk(db: Db, post: { authorUserId: string; marketId: string; areaId: string | null; categorySlug: string | null; id: string; kind?: string }, now: Date): Promise<string[]> {
  if (!askAlertTypeFor({ kind: post.kind ?? 'recommendation', categorySlug: post.categorySlug }) || !post.categorySlug) return [];
  const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, post.categorySlug)).limit(1);
  if (!category) return [];
  const [postArea] = post.areaId ? await db.select({ lat: areas.centerLat, lng: areas.centerLng }).from(areas).where(eq(areas.id, post.areaId)).limit(1) : [];
  const candidates = await db
    .select({ userId: helperProfiles.userId, radiusKm: helperProfiles.serviceRadiusKm, lat: areas.centerLat, lng: areas.centerLng })
    .from(helperProfiles)
    .innerJoin(helperServices, and(eq(helperServices.userId, helperProfiles.userId), eq(helperServices.categoryId, category.id), eq(helperServices.status, 'active')))
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(
      and(
        eq(helperProfiles.status, 'active'),
        eq(users.homeMarketId, post.marketId),
        eq(users.status, 'active'),
        ne(helperProfiles.userId, post.authorUserId),
        // "Neighbors asking about my services" turned off on the account page.
        sql`not exists (select 1 from ${notificationPreferences} where ${notificationPreferences.userId} = ${helperProfiles.userId} and ${notificationPreferences.topic} = ${ASK_ALERTS_PREFERENCE.topic} and ${notificationPreferences.channel} = ${ASK_ALERTS_PREFERENCE.channel} and ${notificationPreferences.enabled} = 'false')`,
        // A real neighbor's request never alerts the demo marketplace's helpers where samples are hidden.
        samplesHiddenInThisBuild() ? realRowsOnly(helperProfiles.userId) : undefined,
      ),
    )
    .orderBy(desc(helperProfiles.completedCount), desc(helperProfiles.ratingCount));
  if (candidates.length === 0) return [];
  const blocked = new Set(await blockedPeopleOf(db, post.authorUserId));
  const near = candidates.filter((helper) => !blocked.has(helper.userId) && (!postArea || distanceKm({ lat: helper.lat, lng: helper.lng }, postArea) <= helper.radiusKm));
  const out: string[] = [];
  for (const helper of near) {
    if (out.length >= ASK_MATCH_LIMITS.perPost) break;
    if (out.includes(helper.userId)) continue;
    const [today] = await db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, helper.userId), inArray(notifications.type, [...ASK_ALERT_TYPE_LIST]), gte(notifications.createdAt, new Date(now.getTime() - 24 * 3_600_000))));
    if ((today?.value ?? 0) >= ASK_MATCH_LIMITS.perDay) continue;
    out.push(helper.userId);
  }
  return out;
}

/** Whether ask alerts reach this person (the account page's switch). */
export async function askAlertsEnabled(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ enabled: notificationPreferences.enabled })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.topic, ASK_ALERTS_PREFERENCE.topic), eq(notificationPreferences.channel, ASK_ALERTS_PREFERENCE.channel)))
    .limit(1);
  return askAlertsOn(row?.enabled);
}

/** "Neighbors asking about my services" on or off (`AccountHandlers.onSaveAskAlerts`). */
export async function saveAskAlerts(db: Db, userId: string, input: { enabled: boolean }, now: Date): Promise<ActionResult> {
  if (typeof input?.enabled !== 'boolean') return { ok: false, code: 'validation_failed' };
  const enabled = input.enabled ? 'true' : 'false';
  await db
    .insert(notificationPreferences)
    .values({ userId, ...ASK_ALERTS_PREFERENCE, enabled, updatedAt: now })
    .onConflictDoUpdate({ target: [notificationPreferences.userId, notificationPreferences.topic, notificationPreferences.channel], set: { enabled, updatedAt: now } });
  return { ok: true, code: 'updated' };
}
