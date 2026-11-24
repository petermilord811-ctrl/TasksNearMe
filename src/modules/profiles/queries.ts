import { neighborsAnswersOf } from '@/modules/community/answers';
import { recommendedByCounts } from '@/modules/community/service';
import { sparksSummaryOf } from '@/modules/sparks/service';
import { responseTimeRange } from '@/shared/response-time';
import 'server-only';
import { openSlotsOf } from '@/modules/availability/slots';
import { and, asc, count, desc, eq, exists, gt, inArray, isNotNull, max, or, sql } from 'drizzle-orm';
import type {
  BadgeView,
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
import { maskContactDetails } from '@/modules/trust/contact-masking';
import { avatarPhoto, photoSrc } from '@/modules/files/photos';
import { files } from '@/modules/tasks/schema';
import { db } from '@/platform/db/client';
import type { Db } from '@/platform/db/connect';
import { helperProfiles, helperServices, helperWorkSamples } from './schema';
import { badgesFor } from '@/modules/badges/service';
import { marketTimeZone } from '@/modules/markets/time-zone';
import { rowScopeCondition, type RowScope } from '@/shared/sample-data';
import { deletedLabelFor, shownPerson } from '@/modules/accounts/shown-name';
import { usernamesOf } from '@/modules/accounts/usernames';
import { publicThanksOf } from '@/modules/thanks/views';

/**
 * Public helper cards. Only active helpers with active accounts appear. Last names, exact
 * locations, and contact details never leave this module: the area is a neighborhood name.
 * The public reads take `rows` (src/shared/sample-data.ts): `real` leaves the sample people out, for the public where
 * samples are hidden; signed-in readers keep `all`.
 */

export function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();
}

type ProfileRow = typeof helperProfiles.$inferSelect;
type UserRow = typeof users.$inferSelect;

/** `badges`: the helper's shown achievement badges, most notable first (cards show the top 3; completion plan 6.4). */
/** `deletedLabel`: the reader's "Deleted account" (shown-name.ts), for a helper whose account was deleted (J-PR15). */
export function toHelperSummary(profile: ProfileRow, user: UserRow, areaName: string, services: ServiceSummary[], badges: BadgeView[] = [], deletedLabel?: string): HelperSummary {
  const phoneVerified = user.phoneVerifiedAt !== null;
  return {
    id: user.id,
    ...shownPerson(user, deletedLabel),
    ...(user.avatarFileId ? { photo: avatarPhoto(user.avatarFileId, user.name) } : {}),
    memberSince: user.createdAt.toISOString(),
    phoneVerified,
    handle: profile.handle,
    headline: profile.headline,
    areaName,
    badges: {
      ...(profile.idVerifiedAt ? { idVerifiedAt: new Date(profile.idVerifiedAt).toISOString() } : {}),
      ...(profile.backgroundCheckedAt ? { backgroundCheckedAt: new Date(profile.backgroundCheckedAt).toISOString() } : {}),
      ...(profile.addressVerifiedAt ? { addressVerifiedAt: new Date(profile.addressVerifiedAt).toISOString() } : {}),
      phoneVerified,
    },
    ...(profile.ratingCount > 0 && profile.ratingAverage !== null
      ? { rating: { average: Math.round(profile.ratingAverage * 10) / 10, count: profile.ratingCount } }
      : {}),
    completedCount: profile.completedCount,
    ...(responseTimeRange(profile.responseTimeMinutes) ? { responseTime: responseTimeRange(profile.responseTimeMinutes) } : {}),
    services,
    ...(profile.foundingNumber !== null ? { foundingHelperNumber: profile.foundingNumber } : {}),
    ...(badges.length > 0 ? { topBadges: badges.slice(0, 3) } : {}),
  };
}

/** "Recommended by N neighbors" (completion plan 7.8): people who booked them and thanked or named them in the community. */
function withRecommended(summary: HelperSummary, counts: ReadonlyMap<string, number>): HelperSummary {
  const count = counts.get(summary.id) ?? 0;
  return count > 0 ? { ...summary, recommendedBy: count } : summary;
}

/** The helper offers the category (an active service in it). */
function offersCategory(categorySlug: CategorySlug | undefined) {
  return categorySlug
    ? exists(
        db
          .select({ one: sql`1` })
          .from(helperServices)
          .innerJoin(categories, eq(categories.id, helperServices.categoryId))
          .where(
            and(
              eq(helperServices.userId, helperProfiles.userId),
              eq(helperServices.status, 'active'),
              eq(categories.slug, categorySlug),
            ),
          ),
      )
    : undefined;
}

export async function listPublicHelpers(options: {
  marketId: string;
  categorySlug?: CategorySlug;
  limit: number;
  rows?: RowScope;
}): Promise<HelperSummary[]> {
  const rowScope = options.rows ?? 'all';

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
        offersCategory(options.categorySlug),
        rowScopeCondition(rowScope, users.id),
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

  const badges = await badgesFor(db, rows.map(({ user }) => user.id));
  const recommended = await recommendedByCounts(db, rows.map(({ user }) => user.id), rowScope);
  return rows.map(({ profile, user, areaName }) => withRecommended(toHelperSummary(profile, user, areaName, servicesByHelper.get(user.id) ?? [], badges.get(user.id)), recommended));
}

/**
 * How many helpers listPublicHelpers would show in the market (and category), not only the first few. `rows: 'real'`
 * leaves sample data out (src/shared/sample-data.ts), for counts shown as facts on public pages.
 */
export async function countPublicHelpers(
  options: { marketId: string; categorySlug?: CategorySlug; rows?: RowScope },
  database: Db = db,
): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(
      and(
        eq(helperProfiles.status, 'active'),
        eq(users.status, 'active'),
        eq(areas.marketId, options.marketId),
        offersCategory(options.categorySlug),
        rowScopeCondition(options.rows ?? 'all', users.id),
      ),
    );
  return row?.value ?? 0;
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

/**
 * `/helpers/[handle]`: the public profile of an active helper. Null for unknown or inactive helpers, and with
 * `rows: 'real'` for sample people (whose reviews by sample authors are left out too).
 */
export async function getHelperProfile(handle: string, database: Db = db, rows: RowScope = 'all'): Promise<HelperProfilePageData | null> {
  const [row] = await database
    .select({ profile: helperProfiles, user: users, areaName: areas.name, marketId: areas.marketId })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(and(eq(helperProfiles.handle, handle), eq(helperProfiles.status, 'active'), eq(users.status, 'active'), rowScopeCondition(rows, users.id)))
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
      .where(and(eq(reviews.subjectUserId, userId), eq(reviews.direction, 'client_to_helper'), eq(reviews.status, 'published'), rowScopeCondition(rows, reviews.authorUserId)))
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
  // A review whose author deleted their account stays, under the reader's "Deleted account" (J-PR15).
  const reviewerDeletedLabel = await deletedLabelFor(reviewRows.map(({ author }) => author));

  const services: HelperServiceDetail[] = serviceRows.map(({ service, slug }) => ({
    categorySlug: slug as CategorySlug,
    pricingType: service.pricingType as ServiceSummary['pricingType'],
    ...(service.fromPriceCents !== null ? { fromPriceCents: service.fromPriceCents } : {}),
    ...(service.hourlyRateCents !== null ? { hourlyRateCents: service.hourlyRateCents } : {}),
    ...(service.minHours !== null ? { minHours: service.minHours } : {}),
    description: service.description,
  }));
  const tagSet = new Set<string>(HELPER_REVIEW_TAGS);

  const achievements = (await badgesFor(database, [row.user.id])).get(row.user.id) ?? [];
  const recommended = await recommendedByCounts(database, [row.user.id], rows);
  // Their market's clock: open slots and review dates (completion plan 8.1). Their area says which market.
  const timeZone = await marketTimeZone(database, row.marketId);
  // Their Sparks (2026-11-21), with the bought part: a community score shown on the profile, never a booking signal.
  const sparks = await sparksSummaryOf(database, userId);
  // Their @username (2026-11-22), under the name.
  const username = (await usernamesOf(database, [userId])).get(userId);
  // Thank-you notes they chose to show (2026-11-24), apart from the reviews and the rating.
  const thanks = await publicThanksOf(database, userId, rows);
  // Their answers neighbors marked Helpful (2026-11-24): credit on the profile only, never a ranking or reward signal.
  const neighborsAnswers = await neighborsAnswersOf(database, userId, rows);
  return {
    timeZone,
    ...(sparks ? { sparks } : {}),
    acceptsMessages: row.user.directMessages !== 'nobody',
    ...(username ? { username } : {}),
    ...(thanks.length > 0 ? { thanks } : {}),
    ...(neighborsAnswers ? { neighborsAnswers } : {}),
    helper: withRecommended(toHelperSummary(
      row.profile,
      row.user,
      row.areaName,
      services.map(({ description: _description, ...summary }) => summary),
      achievements,
    ), recommended),
    ...(achievements.length > 0 ? { achievements } : {}),
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
      // Public and indexed: contact details are masked, as in tasks, questions and posts (sweep RV5). Staff read it as written.
      ...(review.body ? { body: maskContactDetails(review.body).text } : {}),
      author: shownPerson(author, reviewerDeletedLabel),
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

/** Where a stored image is served: bundled placeholders from /public, uploads through the files route (at most 1280 px). */
export function fileUrl(file: { id: string; storageKey: string; width: number; height: number }): string {
  return file.storageKey.startsWith('public/') ? `/${file.storageKey.slice('public/'.length)}` : photoSrc(file);
}

/** Active helper handles, for generateStaticParams (`rows` as in getHelperProfile). */
export async function listActiveHelperHandles(database: Db = db, rows: RowScope = 'all'): Promise<string[]> {
  const found = await database
    .select({ handle: helperProfiles.handle })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .where(and(eq(helperProfiles.status, 'active'), eq(users.status, 'active'), rowScopeCondition(rows, users.id)));
  return found.map((r) => r.handle);
}

/**
 * The sitemap's helpers: those whose public profile shows (getHelperProfile's conditions, area included) and has
 * earned a place in search, with a completed task or a published review (src/modules/seo/indexable.ts); with when
 * the page last changed: the profile itself or its newest published review, whichever is later. `rows` as in
 * getHelperProfile (search engines read the public's, src/shared/sample-data.ts `searchEngineRows`).
 */
export async function listPublicProfileDates(database: Db = db, rows: RowScope = 'all'): Promise<{ handle: string; updatedAt: Date }[]> {
  const latestReview = database
    .select({ subjectUserId: reviews.subjectUserId, publishedAt: max(reviews.publishedAt).as('latest_published_at') })
    .from(reviews)
    .where(and(eq(reviews.direction, 'client_to_helper'), eq(reviews.status, 'published'), rowScopeCondition(rows, reviews.authorUserId)))
    .groupBy(reviews.subjectUserId)
    .as('latest_review');
  const found = await database
    .select({ handle: helperProfiles.handle, profileUpdatedAt: helperProfiles.updatedAt, reviewedAt: latestReview.publishedAt })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
    .leftJoin(latestReview, eq(latestReview.subjectUserId, helperProfiles.userId))
    .where(
      and(
        eq(helperProfiles.status, 'active'),
        eq(users.status, 'active'),
        or(gt(helperProfiles.completedCount, 0), gt(helperProfiles.ratingCount, 0)),
        rowScopeCondition(rows, users.id),
      ),
    )
    .orderBy(asc(helperProfiles.handle));
  return found.map(({ handle, profileUpdatedAt, reviewedAt }) => {
    // The profile's time comes back as Postgres text (a mode: 'string' column), the review's as a Date.
    const changed = new Date(profileUpdatedAt);
    const reviewed = reviewedAt ? new Date(reviewedAt) : null;
    return { handle, updatedAt: reviewed && reviewed > changed ? reviewed : changed };
  });
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
  const badges = await badgesFor(database, rows.map(({ user }) => user.id));
  const recommended = await recommendedByCounts(database, rows.map(({ user }) => user.id));
  // A helper on a past booking or an old offer whose account was deleted shows as the reader's "Deleted account" (J-PR15).
  const deletedLabel = await deletedLabelFor(rows.map(({ user }) => user));
  return new Map(rows.map(({ profile, user, areaName }) => [user.id, withRecommended(toHelperSummary(profile, user, areaName, services.get(user.id) ?? [], badges.get(user.id), deletedLabel), recommended)]));
}
