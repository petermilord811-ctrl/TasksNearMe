/**
 * Idempotent seed: Austin market, areas, categories, policy v1 (published) and v2 (draft),
 * feature flags. People and tasks are added by later phases (from src/fixtures).
 */
import { and, eq, sql } from 'drizzle-orm';
import { createDb } from '../../src/platform/db/connect';
import {
  areas,
  categories,
  featureFlags,
  marketCategories,
  marketPolicies,
  markets,
} from '../../src/modules/markets/schema';
import {
  DEFAULT_CANCELLATION,
  DEFAULT_FEES,
  DEFAULT_FLAGS,
  DEFAULT_TIMERS,
} from '../../src/modules/markets/policy-defaults';
import { staffRoles, users } from '../../src/modules/accounts/schema';
import { helperProfiles, helperServices } from '../../src/modules/profiles/schema';
import { AUSTIN, AUSTIN_AREAS, CATEGORIES } from './data/austin';
import { PEOPLE, displayNameOf } from './data/people';
import { CURRENT_TERMS_VERSION } from '../../src/modules/accounts/terms';
import { FAKE_PLACES } from '../../src/integrations/geocoding';
import { fuzzedPublicPoint, nearestArea } from '../../src/modules/markets/geo';
import { taskLocations, tasks } from '../../src/modules/tasks/schema';
import { createFieldCipher } from '../../src/platform/crypto/field-encryption';
import { marketDayKey, marketLocalToUtc } from '../../src/shared/format';
import { SEED_TASKS } from './data/tasks';
import { SEED_OFFERS } from './data/offers';
import { offers } from '../../src/modules/offers/schema';
import { HELPER_LANGUAGES, SEED_REVIEWS, SERVICE_DESCRIPTIONS, WORK_SAMPLES } from './data/profile-extras';
import { reviews } from '../../src/modules/reviews/schema';
import { helperWorkSamples } from '../../src/modules/profiles/schema';
import { files } from '../../src/modules/tasks/schema';

export async function seedDatabase(url: string): Promise<void> {
  const { db, pool } = createDb(url, { max: 2 });
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(markets)
        .values({ ...AUSTIN })
        .onConflictDoUpdate({ target: markets.id, set: { name: AUSTIN.name, status: AUSTIN.status } });

      for (const area of AUSTIN_AREAS) {
        await tx
          .insert(areas)
          .values({
            id: `area_${area.slug.replaceAll('-', '_')}`,
            marketId: AUSTIN.id,
            slug: area.slug,
            name: area.name,
            centerLat: area.lat,
            centerLng: area.lng,
          })
          .onConflictDoUpdate({ target: areas.id, set: { name: area.name, centerLat: area.lat, centerLng: area.lng } });
      }

      for (const { guidance, ...category } of CATEGORIES) {
        await tx.insert(categories).values(category).onConflictDoUpdate({ target: categories.id, set: category });
        await tx
          .insert(marketCategories)
          .values({ marketId: AUSTIN.id, categoryId: category.id, enabled: true, priceGuidance: guidance })
          .onConflictDoUpdate({
            target: [marketCategories.marketId, marketCategories.categoryId],
            set: { priceGuidance: guidance },
          });
      }

      await tx
        .insert(marketPolicies)
        .values([
          {
            id: 'pol_austin_v1',
            marketId: AUSTIN.id,
            version: 1,
            status: 'published',
            effectiveFrom: '2026-11-01T06:00:00.000Z',
            fees: DEFAULT_FEES,
            cancellation: DEFAULT_CANCELLATION,
            timers: DEFAULT_TIMERS,
            publishedBy: 'system',
            publishedAt: '2026-11-01T06:00:00.000Z',
          },
          {
            id: 'pol_austin_v2',
            marketId: AUSTIN.id,
            version: 2,
            status: 'draft',
            fees: DEFAULT_FEES,
            cancellation: { ...DEFAULT_CANCELLATION, lateFeeMinCents: 1200 },
            timers: DEFAULT_TIMERS,
          },
        ])
        .onConflictDoNothing();

      for (const [key, flag] of Object.entries(DEFAULT_FLAGS)) {
        await tx
          .insert(featureFlags)
          .values({ key, marketId: 'global', enabled: flag.enabled, description: flag.description })
          .onConflictDoNothing();
      }

      for (const person of PEOPLE) {
        const user = {
          id: person.id,
          email: person.email,
          name: displayNameOf(person),
          emailVerified: true,
          firstName: person.firstName,
          lastName: person.lastName,
          phone: person.phone ?? null,
          phoneVerifiedAt: person.phone ? new Date(person.createdAt) : null,
          // Seeded people finished sign-up (18+ and terms) when they joined.
          adultAttestedAt: new Date(person.createdAt),
          termsAcceptedAt: new Date(person.createdAt),
          termsVersion: CURRENT_TERMS_VERSION,
          mode: person.mode,
          createdAt: new Date(person.createdAt),
        };
        await tx.insert(users).values(user).onConflictDoUpdate({ target: users.id, set: { ...user, createdAt: undefined } });

        if (person.staffRole) {
          await tx.insert(staffRoles).values({ userId: person.id, role: person.staffRole, grantedBy: 'seed' }).onConflictDoNothing();
        }

        if (person.helper) {
          const { services, ...helper } = person.helper;
          const profile = {
            userId: person.id,
            handle: helper.handle,
            headline: helper.headline,
            bio: helper.bio,
            status: helper.status,
            areaId: helper.areaId,
            remoteOk: helper.remoteOk,
            tools: helper.tools,
            foundingNumber: helper.foundingNumber ?? null,
            idVerifiedAt: helper.idVerifiedAt ?? null,
            backgroundCheckedAt: helper.backgroundCheckedAt ?? null,
            payoutsReadyAt: helper.payoutsReadyAt ?? null,
            completedCount: helper.completedCount,
            ratingAverage: helper.ratingAverage ?? null,
            ratingCount: helper.ratingCount,
            responseTimeMinutes: helper.responseTimeMinutes ?? null,
          };
          await tx.insert(helperProfiles).values(profile).onConflictDoUpdate({ target: helperProfiles.userId, set: profile });

          for (const service of services) {
            const row = {
              id: `svc_${person.id.slice(4)}_${service.categoryId.slice(4)}`,
              userId: person.id,
              categoryId: service.categoryId,
              pricingType: service.pricingType,
              fromPriceCents: service.fromPriceCents ?? null,
              hourlyRateCents: service.hourlyRateCents ?? null,
              minHours: service.minHours ?? null,
            };
            await tx
              .insert(helperServices)
              .values(row)
              .onConflictDoUpdate({ target: [helperServices.userId, helperServices.categoryId], set: row });
          }
        }
      }

      await seedTasks(tx);
      await seedProfileExtras(tx);
      await seedOffers(tx);
    });
    await db.execute(sql`select 1`);
  } finally {
    await pool.end();
  }
}

type Tx = Parameters<Parameters<ReturnType<typeof createDb>['db']['transaction']>[0]>[0];

function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Open tasks relative to today (market time), with encrypted exact addresses like real posts. */
async function seedTasks(tx: Tx): Promise<void> {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) throw new Error('FIELD_ENCRYPTION_KEY is not set (see .env.example).');
  const cipher = createFieldCipher(key);
  const now = new Date();
  const today = marketDayKey(now);
  const areaRows = await tx.select().from(areas);

  for (const seed of SEED_TASKS) {
    const date = addDays(today, seed.daysFromToday);
    const windowStart = new Date(marketLocalToUtc(date, seed.start ?? '00:00'));
    const windowEnd = new Date(marketLocalToUtc(date, seed.end ?? '23:59'));
    const place = seed.placeId ? FAKE_PLACES.find((p) => p.placeId === seed.placeId) : undefined;
    if (seed.placeId && !place) throw new Error(`Unknown seed place ${seed.placeId}`);
    const area = place ? nearestArea(areaRows, place) : null;
    const locationId = place ? `loc_${seed.id.slice(4)}` : null;

    if (place && area && locationId) {
      const location = {
        id: locationId,
        ownerUserId: seed.posterId,
        addressEnc: cipher.encrypt(
          JSON.stringify({
            line1: place.line1,
            ...(seed.unit ? { line2: seed.unit } : {}),
            city: place.city,
            state: place.state,
            zip: place.zip,
            ...(seed.accessNotes ? { accessNotes: seed.accessNotes } : {}),
          }),
        ),
        zip: place.zip,
        areaId: area.id,
      };
      await tx.insert(taskLocations).values(location).onConflictDoUpdate({ target: taskLocations.id, set: location });
    }

    const point = area ? fuzzedPublicPoint({ lat: area.centerLat, lng: area.centerLng }, seed.id) : null;
    const publishedAt = new Date(now.getTime() - seed.postedHoursAgo * 3_600_000);
    const row = {
      id: seed.id,
      slug: seed.slug,
      posterUserId: seed.posterId,
      marketId: AUSTIN.id,
      categoryId: seed.categoryId,
      title: seed.title,
      description: seed.description,
      details: seed.details,
      mode: place ? 'local' : 'remote',
      status: 'open',
      pricingType: seed.budget.type,
      budgetCents: seed.budget.type === 'fixed' ? seed.budget.priceCents : null,
      hourlyRateCents: seed.budget.type === 'hourly' ? seed.budget.rateCents : null,
      estimatedHours: seed.budget.type === 'hourly' ? seed.budget.estimatedHours : null,
      hoursCap: seed.budget.type === 'hourly' ? seed.budget.hoursCap : null,
      windowStart,
      windowEnd,
      flexible: !seed.start,
      locationId,
      publicAreaId: area?.id ?? null,
      publicLat: point?.lat ?? null,
      publicLng: point?.lng ?? null,
      offerCount: seed.offerCount,
      publishedAt,
      expiresAt: windowEnd,
      createdAt: publishedAt,
      updatedAt: now,
    };
    await tx.insert(tasks).values(row).onConflictDoUpdate({ target: tasks.id, set: row });
  }
}

/** Service descriptions, languages, work samples, and reviews; ratings recomputed from reviews. */
async function seedProfileExtras(tx: Tx): Promise<void> {
  for (const [key, description] of Object.entries(SERVICE_DESCRIPTIONS)) {
    const [userId, categoryId] = key.split(':') as [string, string];
    await tx
      .update(helperServices)
      .set({ description })
      .where(and(eq(helperServices.userId, userId), eq(helperServices.categoryId, categoryId)));
  }
  for (const [userId, languages] of Object.entries(HELPER_LANGUAGES)) {
    await tx.update(helperProfiles).set({ languages }).where(eq(helperProfiles.userId, userId));
  }

  for (const [position, sample] of WORK_SAMPLES.entries()) {
    const file = {
      id: sample.fileId,
      ownerUserId: sample.userId,
      kind: 'work_sample',
      storageKey: `public/${sample.src}`,
      contentType: 'image/svg+xml',
      width: 800,
      height: 600,
      bytes: 1000,
      alt: sample.alt,
    };
    await tx.insert(files).values(file).onConflictDoUpdate({ target: files.id, set: file });
    const row = {
      id: sample.id,
      userId: sample.userId,
      fileId: sample.fileId,
      categoryId: sample.categoryId,
      caption: sample.caption,
      position,
    };
    await tx.insert(helperWorkSamples).values(row).onConflictDoUpdate({ target: helperWorkSamples.id, set: row });
  }

  for (const review of SEED_REVIEWS) {
    const row = {
      ...review,
      tags: [...review.tags],
      direction: 'client_to_helper',
      status: 'published',
      publishedAt: new Date(review.publishedAt),
      createdAt: new Date(review.publishedAt),
    };
    await tx.insert(reviews).values(row).onConflictDoUpdate({ target: reviews.id, set: row });
  }

  // Ratings shown on cards and profiles come from published reviews.
  await tx.execute(sql`
    update helper_profiles hp set
      rating_count = coalesce(r.count, 0),
      rating_average = r.average
    from (select u.id as user_id, s.count, s.average
          from users u
          left join (select subject_user_id, count(*)::int as count, avg(rating)::float8 as average
                     from reviews where status = 'published' and direction = 'client_to_helper'
                     group by subject_user_id) s on s.subject_user_id = u.id) r
    where r.user_id = hp.user_id`);
}

/** Offers on the seeded tasks, relative to each task's window; offer counts follow the offers in play. */
async function seedOffers(tx: Tx): Promise<void> {
  const now = new Date();
  for (const seed of SEED_OFFERS) {
    const [task] = await tx.select({ windowStart: tasks.windowStart }).from(tasks).where(eq(tasks.id, seed.taskId));
    if (!task) throw new Error(`Seed offer ${seed.id} points at unknown task ${seed.taskId}`);
    const submittedAt = new Date(now.getTime() - seed.submittedHoursAgo * 3_600_000);
    const expiresAt = new Date(Math.min(task.windowStart.getTime(), submittedAt.getTime() + 72 * 3_600_000));
    const row = {
      id: seed.id,
      taskId: seed.taskId,
      helperUserId: seed.helperUserId,
      status: 'pending',
      pricingType: seed.pricing.type,
      priceCents: seed.pricing.type === 'fixed' ? seed.pricing.priceCents : null,
      hourlyRateCents: seed.pricing.type === 'hourly' ? seed.pricing.rateCents : null,
      estimatedHours: seed.pricing.type === 'hourly' ? seed.pricing.estimatedHours : null,
      hoursCap: seed.pricing.type === 'hourly' ? seed.pricing.hoursCap : null,
      proposedStart: new Date(task.windowStart.getTime() + seed.startOffsetMinutes * 60_000),
      message: seed.message,
      brings: seed.brings,
      expiresAt,
      revision: seed.revision,
      posterSeenAt: seed.seenByPoster ? submittedAt : null,
      closedAt: null,
      createdAt: submittedAt,
      updatedAt: submittedAt,
    };
    await tx.insert(offers).values(row).onConflictDoUpdate({ target: offers.id, set: row });
  }
  await tx.execute(sql`
    update tasks t set offer_count = coalesce(
      (select count(*)::int from offers o where o.task_id = t.id and o.status in ('pending', 'stale')), 0)`);
}
