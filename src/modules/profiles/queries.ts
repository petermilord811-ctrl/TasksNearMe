import 'server-only';
import { and, asc, count, desc, eq, exists, inArray, isNotNull, sql } from 'drizzle-orm';
import type { CategorySlug, HelperSummary, ServiceSummary } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { areas, categories } from '@/modules/markets/schema';
import { db } from '@/platform/db/client';
import { helperProfiles, helperServices } from './schema';

/**
 * Public helper cards. Only active helpers with active accounts appear. Last names, exact
 * locations, and contact details never leave this module: the area is a neighborhood name.
 */

export function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();
}

export async function listPublicHelpers(options: {
  marketId: string;
  categorySlug?: CategorySlug;
  limit: number;
}): Promise<HelperSummary[]> {
  const offersCategory = options.categorySlug
    ? exists(
        db
          .select({ one: sql`1` })
          .from(helperServices)
          .innerJoin(categories, eq(categories.id, helperServices.categoryId))
          .where(
            and(
              eq(helperServices.userId, helperProfiles.userId),
              eq(helperServices.status, 'active'),
              eq(categories.slug, options.categorySlug),
            ),
          ),
      )
    : undefined;

  const rows = await db
    .select({ profile: helperProfiles, user: users, areaName: areas.name })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(
      and(
        eq(helperProfiles.status, 'active'),
        eq(users.status, 'active'),
        eq(areas.marketId, options.marketId),
        offersCategory,
      ),
    )
    .orderBy(desc(helperProfiles.completedCount), sql`${helperProfiles.ratingAverage} desc nulls last`, asc(users.name))
    .limit(options.limit);

  if (rows.length === 0) return [];

  const serviceRows = await db
    .select({ service: helperServices, slug: categories.slug, sortOrder: categories.sortOrder })
    .from(helperServices)
    .innerJoin(categories, eq(categories.id, helperServices.categoryId))
    .where(
      and(
        inArray(
          helperServices.userId,
          rows.map((row) => row.user.id),
        ),
        eq(helperServices.status, 'active'),
      ),
    )
    .orderBy(asc(categories.sortOrder));

  const servicesByHelper = new Map<string, ServiceSummary[]>();
  for (const { service, slug } of serviceRows) {
    const list = servicesByHelper.get(service.userId) ?? [];
    list.push({
      categorySlug: slug as CategorySlug,
      pricingType: service.pricingType as ServiceSummary['pricingType'],
      ...(service.fromPriceCents !== null ? { fromPriceCents: service.fromPriceCents } : {}),
      ...(service.hourlyRateCents !== null ? { hourlyRateCents: service.hourlyRateCents } : {}),
      ...(service.minHours !== null ? { minHours: service.minHours } : {}),
    });
    servicesByHelper.set(service.userId, list);
  }

  return rows.map(({ profile, user, areaName }) => {
    const phoneVerified = user.phoneVerifiedAt !== null;
    return {
      id: user.id,
      displayName: user.name,
      initials: initialsOf(user.firstName, user.lastName),
      memberSince: user.createdAt.toISOString(),
      phoneVerified,
      handle: profile.handle,
      headline: profile.headline,
      areaName,
      badges: {
        ...(profile.idVerifiedAt ? { idVerifiedAt: new Date(profile.idVerifiedAt).toISOString() } : {}),
        ...(profile.backgroundCheckedAt ? { backgroundCheckedAt: new Date(profile.backgroundCheckedAt).toISOString() } : {}),
        phoneVerified,
      },
      ...(profile.ratingCount > 0 && profile.ratingAverage !== null
        ? { rating: { average: Math.round(profile.ratingAverage * 10) / 10, count: profile.ratingCount } }
        : {}),
      completedCount: profile.completedCount,
      ...(profile.responseTimeMinutes !== null ? { responseTimeMinutes: profile.responseTimeMinutes } : {}),
      services: servicesByHelper.get(user.id) ?? [],
      ...(profile.foundingNumber !== null ? { foundingHelperNumber: profile.foundingNumber } : {}),
    };
  });
}

/** Founding-cohort spots already taken in the market (helpers given a founding number). */
export async function countFoundingHelpers(marketId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(helperProfiles)
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(and(eq(areas.marketId, marketId), isNotNull(helperProfiles.foundingNumber)));
  return row?.value ?? 0;
}
