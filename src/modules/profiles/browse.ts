import { and, asc, desc, eq, exists, gt, ilike, inArray, lt, notInArray, sql } from 'drizzle-orm';
import { CATEGORY_SLUGS, type CategorySlug, type HelperBrowseQuery, type HelperBrowseRow, type HelpersBrowsePageData, type ServiceSummary } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { availabilityPosts } from '@/modules/availability/schema';
import { areas, categories } from '@/modules/markets/schema';
import { savedHelpers } from '@/modules/reviews/schema';
import { blockedPeopleOf } from '@/modules/trust/blocks';
import type { Db } from '@/platform/db/connect';
import { toHelperSummary } from './queries';
import { byReliability, isReliable, reliabilityFacts } from './reliability';
import { helperProfiles, helperServices } from './schema';

/**
 * Browse and search helpers (blueprint 02 `/app/helpers`): the market's active helpers, filtered by
 * category, the area they serve, open times this week and name. The viewer and blocked people are left out.
 */

const LIMIT = 60;
const DAY = 86_400_000;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

/** The filters from the page's search params (unknown values are dropped). */
export function parseHelperBrowseQuery(params: Record<string, string | string[] | undefined>): HelperBrowseQuery {
  const query: HelperBrowseQuery = {};
  const category = first(params.category);
  if (category && (CATEGORY_SLUGS as readonly string[]).includes(category)) query.category = category as CategorySlug;
  const area = first(params.area);
  if (area && /^[a-z0-9-]{1,60}$/.test(area)) query.area = area;
  const q = first(params.q)?.slice(0, 80);
  if (q) query.q = q;
  if (first(params.open) === '1') query.openTimes = true;
  return query;
}

/** Kilometres between two points (haversine). */
function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(h));
}

export async function getHelpersBrowse(db: Db, viewerId: string, marketId: string, query: HelperBrowseQuery, now: Date): Promise<HelpersBrowsePageData> {
  const [areaRows, blocked] = await Promise.all([
    db.select().from(areas).where(eq(areas.marketId, marketId)).orderBy(asc(areas.name)),
    blockedPeopleOf(db, viewerId),
  ]);
  const conditions = [eq(helperProfiles.status, 'active'), eq(users.status, 'active'), eq(areas.marketId, marketId), notInArray(helperProfiles.userId, [viewerId, ...blocked])];
  if (query.q) conditions.push(ilike(users.name, `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`));
  if (query.category) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(helperServices)
          .innerJoin(categories, eq(categories.id, helperServices.categoryId))
          .where(and(eq(helperServices.userId, helperProfiles.userId), eq(helperServices.status, 'active'), eq(categories.slug, query.category))),
      ),
    );
  }
  const rows = await db
    .select({ profile: helperProfiles, user: users, area: areas })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(and(...conditions))
    .orderBy(desc(helperProfiles.completedCount), sql`${helperProfiles.ratingAverage} desc nulls last`, asc(users.name));

  // The area they serve: within their service radius of its center.
  const target = query.area ? areaRows.find((area) => area.slug === query.area) : undefined;
  let candidates = target
    ? rows.filter(({ profile, area }) => kmBetween({ lat: area.centerLat, lng: area.centerLng }, { lat: target.centerLat, lng: target.centerLng }) <= profile.serviceRadiusKm)
    : query.area
      ? []
      : rows;

  const ids = candidates.map((row) => row.user.id);
  const slots = ids.length
    ? await db
        .select({ helperUserId: availabilityPosts.helperUserId, startAt: availabilityPosts.startAt, slug: categories.slug })
        .from(availabilityPosts)
        .innerJoin(categories, eq(categories.id, availabilityPosts.categoryId))
        .where(and(inArray(availabilityPosts.helperUserId, ids), eq(availabilityPosts.status, 'active'), gt(availabilityPosts.startAt, now), lt(availabilityPosts.startAt, new Date(now.getTime() + 7 * DAY))))
        .orderBy(asc(availabilityPosts.startAt))
    : [];
  const nextSlot = new Map<string, { start: string; categorySlug: CategorySlug }>();
  for (const slot of slots) if (!nextSlot.has(slot.helperUserId)) nextSlot.set(slot.helperUserId, { start: slot.startAt.toISOString(), categorySlug: slot.slug as CategorySlug });
  if (query.openTimes) candidates = candidates.filter((row) => nextSlot.has(row.user.id));

  // The most reliable first (blueprint 01 P2): kept bookings against cancellations, no-shows and strikes.
  const facts = await reliabilityFacts(db, candidates.map((row) => row.user.id), now);
  candidates = candidates
    .map((row) => ({ row, facts: facts.get(row.user.id)!, completedCount: row.profile.completedCount, ratingAverage: row.profile.ratingAverage, name: row.user.name }))
    .sort(byReliability)
    .map(({ row }) => row);

  const page = candidates.slice(0, LIMIT);
  const pageIds = page.map((row) => row.user.id);
  const [serviceRows, savedRows] = pageIds.length
    ? await Promise.all([
        db
          .select({ service: helperServices, slug: categories.slug })
          .from(helperServices)
          .innerJoin(categories, eq(categories.id, helperServices.categoryId))
          .where(and(inArray(helperServices.userId, pageIds), eq(helperServices.status, 'active')))
          .orderBy(asc(categories.sortOrder)),
        db.select({ helperUserId: savedHelpers.helperUserId }).from(savedHelpers).where(and(eq(savedHelpers.userId, viewerId), inArray(savedHelpers.helperUserId, pageIds))),
      ])
    : [[], []];
  const services = new Map<string, ServiceSummary[]>();
  for (const { service, slug } of serviceRows) {
    services.set(service.userId, [
      ...(services.get(service.userId) ?? []),
      {
        categorySlug: slug as CategorySlug,
        pricingType: service.pricingType as ServiceSummary['pricingType'],
        ...(service.fromPriceCents !== null ? { fromPriceCents: service.fromPriceCents } : {}),
        ...(service.hourlyRateCents !== null ? { hourlyRateCents: service.hourlyRateCents } : {}),
        ...(service.minHours !== null ? { minHours: service.minHours } : {}),
      },
    ]);
  }
  const saved = new Set(savedRows.map((row) => row.helperUserId));
  const result: HelperBrowseRow[] = page.map(({ profile, user, area }) => {
    const next = nextSlot.get(user.id);
    const summary = toHelperSummary(profile, user, area.name, services.get(user.id) ?? []);
    return { helper: isReliable(facts.get(user.id)!) ? { ...summary, reliable: true } : summary, saved: saved.has(user.id), ...(next ? { nextOpenTime: next } : {}) };
  });
  return { query, rows: result, areas: areaRows.map(({ slug, name }) => ({ slug, name })), total: candidates.length };
}
