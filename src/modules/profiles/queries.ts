import 'server-only';
import { openSlotsOf } from '@/modules/availability/slots';
import { and, asc, count, desc, eq, exists, inArray, isNotNull, sql } from 'drizzle-orm';
import type {
  CategorySlug,
  HelperProfilePageData,
  HelperReviewTag,
  HelperServiceDetail,
  HelperSummary,
  PublicReviewView,
  ServiceSummary,
} from '@/contracts';
import { HELPER_REVIEW_TAGS } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { areas, categories } from '@/modules/markets/schema';
import { reviews } from '@/modules/reviews/schema';
import { avatarPhoto } from '@/modules/files/photos';
import { files } from '@/modules/tasks/schema';
import { db } from '@/platform/db/client';
import type { Db } from '@/platform/db/connect';
import { helperProfiles, helperServices, helperWorkSamples } from './schema';

/**
 * Public helper cards. Only active helpers with active accounts appear. Last names, exact
 * locations, and contact details never leave this module: the area is a neighborhood name.
 */

export function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();
}

type ProfileRow = typeof helperProfiles.$inferSelect;
type UserRow = typeof users.$inferSelect;

export function toHelperSummary(profile: ProfileRow, user: UserRow, areaName: string, services: ServiceSummary[]): HelperSummary {
  const phoneVerified = user.phoneVerifiedAt !== null;
  return {
    id: user.id,
    displayName: user.name,
    initials: initialsOf(user.firstName, user.lastName),
    ...(user.avatarFileId ? { photo: avatarPhoto(user.avatarFileId, user.name) } : {}),
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
    services,
    ...(profile.foundingNumber !== null ? { foundingHelperNumber: profile.foundingNumber } : {}),
  };
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

  return rows.map(({ profile, user, areaName }) => toHelperSummary(profile, user, areaName, servicesByHelper.get(user.id) ?? []));
}

/** Founding-cohort spots already taken in the market (helpers given a founding number). */
export async function countFoundingHelpers(marketId: string, database: Db = db): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(helperProfiles)
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(and(eq(areas.marketId, marketId), isNotNull(helperProfiles.foundingNumber)));
  return row?.value ?? 0;
}

const KM_PER_MILE = 1.609344;
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

/** `/helpers/[handle]`: the public profile of an active helper. Null for unknown or inactive helpers. */
export async function getHelperProfile(handle: string, database: Db = db): Promise<HelperProfilePageData | null> {
  const [row] = await database
    .select({ profile: helperProfiles, user: users, areaName: areas.name })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(and(eq(helperProfiles.handle, handle), eq(helperProfiles.status, 'active'), eq(users.status, 'active')))
    .limit(1);
  if (!row) return null;
  const userId = row.user.id;

  const [serviceRows, reviewRows, sampleRows] = await Promise.all([
    database
      .select({ service: helperServices, slug: categories.slug })
      .from(helperServices)
      .innerJoin(categories, eq(categories.id, helperServices.categoryId))
      .where(and(eq(helperServices.userId, userId), eq(helperServices.status, 'active')))
      .orderBy(asc(categories.sortOrder)),
    database
      .select({ review: reviews, author: users, categorySlug: categories.slug })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.authorUserId))
      .innerJoin(categories, eq(categories.id, reviews.categoryId))
      .where(and(eq(reviews.subjectUserId, userId), eq(reviews.direction, 'client_to_helper'), eq(reviews.status, 'published')))
      .orderBy(desc(reviews.publishedAt))
      .limit(10),
    database
      .select({ sample: helperWorkSamples, file: files, categorySlug: categories.slug })
      .from(helperWorkSamples)
      .innerJoin(files, eq(files.id, helperWorkSamples.fileId))
      .leftJoin(categories, eq(categories.id, helperWorkSamples.categoryId))
      .where(eq(helperWorkSamples.userId, userId))
      .orderBy(asc(helperWorkSamples.position)),
  ]);

  const services: HelperServiceDetail[] = serviceRows.map(({ service, slug }) => ({
    categorySlug: slug as CategorySlug,
    pricingType: service.pricingType as ServiceSummary['pricingType'],
    ...(service.fromPriceCents !== null ? { fromPriceCents: service.fromPriceCents } : {}),
    ...(service.hourlyRateCents !== null ? { hourlyRateCents: service.hourlyRateCents } : {}),
    ...(service.minHours !== null ? { minHours: service.minHours } : {}),
    description: service.description,
  }));
  const tagSet = new Set<string>(HELPER_REVIEW_TAGS);

  return {
    helper: toHelperSummary(
      row.profile,
      row.user,
      row.areaName,
      services.map(({ description: _description, ...summary }) => summary),
    ),
    bio: row.profile.bio,
    serviceRadiusMiles: Math.max(1, Math.floor(row.profile.serviceRadiusKm / KM_PER_MILE)),
    remoteOk: row.profile.remoteOk,
    tools: row.profile.tools,
    languages: row.profile.languages.map((code) => languageNames.of(code) ?? code),
    services,
    reviews: reviewRows.map(({ review, author, categorySlug }) => ({
      id: review.id,
      rating: Math.min(5, Math.max(1, review.rating)) as PublicReviewView['rating'],
      tags: review.tags.filter((tag): tag is HelperReviewTag => tagSet.has(tag)),
      ...(review.body ? { body: review.body } : {}),
      author: { displayName: author.name, initials: initialsOf(author.firstName, author.lastName) },
      categorySlug: categorySlug as CategorySlug,
      publishedAt: (review.publishedAt ?? review.createdAt).toISOString(),
    })),
    slots: await openSlotsOf(database, userId),
    workSamples: sampleRows.map(({ sample, file, categorySlug }) => ({
      id: sample.id,
      photo: { id: file.id, src: fileUrl(file), alt: file.alt, width: file.width, height: file.height },
      ...(categorySlug ? { categorySlug: categorySlug as CategorySlug } : {}),
      ...(sample.caption ? { caption: sample.caption } : {}),
    })),
  };
}

/** Where a stored file is served: bundled placeholders from /public, uploads through the files route. */
export function fileUrl(file: { id: string; storageKey: string }): string {
  return file.storageKey.startsWith('public/') ? `/${file.storageKey.slice('public/'.length)}` : `/api/files/${file.id}`;
}

/** Active helper handles, for generateStaticParams. */
export async function listActiveHelperHandles(database: Db = db): Promise<string[]> {
  const rows = await database
    .select({ handle: helperProfiles.handle })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .where(and(eq(helperProfiles.status, 'active'), eq(users.status, 'active')));
  return rows.map((r) => r.handle);
}

/** Helper cards for specific helpers (e.g. the people who made offers), whatever their profile status. */
export async function getHelperSummaries(userIds: string[], database: Db = db): Promise<Map<string, HelperSummary>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await database
    .select({ profile: helperProfiles, user: users, areaName: areas.name })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(inArray(helperProfiles.userId, ids));
  const serviceRows = await database
    .select({ service: helperServices, slug: categories.slug })
    .from(helperServices)
    .innerJoin(categories, eq(categories.id, helperServices.categoryId))
    .where(and(inArray(helperServices.userId, ids), eq(helperServices.status, 'active')))
    .orderBy(asc(categories.sortOrder));
  const services = new Map<string, ServiceSummary[]>();
  for (const { service, slug } of serviceRows) {
    const list = services.get(service.userId) ?? [];
    list.push({
      categorySlug: slug as CategorySlug,
      pricingType: service.pricingType as ServiceSummary['pricingType'],
      ...(service.fromPriceCents !== null ? { fromPriceCents: service.fromPriceCents } : {}),
      ...(service.hourlyRateCents !== null ? { hourlyRateCents: service.hourlyRateCents } : {}),
      ...(service.minHours !== null ? { minHours: service.minHours } : {}),
    });
    services.set(service.userId, list);
  }
  return new Map(rows.map(({ profile, user, areaName }) => [user.id, toHelperSummary(profile, user, areaName, services.get(user.id) ?? [])]));
}
