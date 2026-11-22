import { and, count, desc, eq, gte, ne } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import { distanceKm } from '@/modules/markets/geo';
import { areas, categories } from '@/modules/markets/schema';
import { notifications } from '@/modules/notifications/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { blockedPeopleOf } from '@/modules/trust/blocks';
import type { Db } from '@/platform/db/connect';
import { realRowsOnly, samplesHiddenInThisBuild } from '@/shared/sample-data';
import { ASK_MATCH_LIMITS } from './domain';

/**
 * Recommendation-request alerts (plan 10.11; the owner's default, 2026-11-22): when a neighbor asks who to hire for a
 * service, the helpers who offer it there hear about it, so they can answer (a helper's own name counts least in the
 * thread). Active helpers in the market offering the service, whose area covers the post's neighborhood (any helper of
 * the market for a citywide post), never its author or anyone either of them blocked; at most `ASK_MATCH_LIMITS.perDay`
 * a day each, and `ASK_MATCH_LIMITS.perPost` helpers per request, those with the most finished work first.
 */
export async function helpersForAsk(db: Db, post: { authorUserId: string; marketId: string; areaId: string | null; categorySlug: string | null; id: string }, now: Date): Promise<string[]> {
  if (!post.categorySlug) return [];
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
      .where(and(eq(notifications.userId, helper.userId), eq(notifications.type, 'community_ask_match'), gte(notifications.createdAt, new Date(now.getTime() - 24 * 3_600_000))));
    if ((today?.value ?? 0) >= ASK_MATCH_LIMITS.perDay) continue;
    out.push(helper.userId);
  }
  return out;
}
