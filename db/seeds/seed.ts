/**
 * Idempotent seed: Austin market, areas, categories, policy v1 (published) and v2 (draft); Gainesville's market
 * (paused until plan 8.1), areas, categories and policy;
 * feature flags. People and tasks are added by later phases (from src/fixtures).
 */
import { and, eq, inArray, isNotNull, like, or, sql } from 'drizzle-orm';
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
import { betaAccess, betaInviteCodes } from '../../src/modules/beta/schema';
import { helperProfiles, helperServices } from '../../src/modules/profiles/schema';
import { AUSTIN, AUSTIN_AREAS, AUSTIN_ZIP_PREFIXES, CATEGORIES } from './data/austin';
import { AUSTIN_COMMUNITY_PROMPTS, GAINESVILLE_COMMUNITY_PROMPTS } from './data/community-prompts';
import { GAINESVILLE, GAINESVILLE_AREAS, GAINESVILLE_POLICY_EFFECTIVE_FROM, GAINESVILLE_POLICY_ID, GAINESVILLE_ZIP_PREFIXES, gainesvilleAreaId } from './data/gainesville';
import { PEOPLE, displayNameOf, type SeedPerson } from './data/people';
import { CURRENT_TERMS_VERSION } from '../../src/modules/accounts/terms';
import { recomputeBadges } from '../../src/modules/badges/service';
import { FAKE_PLACES } from '../../src/integrations/geocoding';
import { fuzzedPublicPoint, nearestArea } from '../../src/modules/markets/geo';
import { taskLocations, tasks } from '../../src/modules/tasks/schema';
import { createFieldCipher } from '../../src/platform/crypto/field-encryption';
import { marketDayKey, marketLocalToUtc } from '../../src/shared/format';
import { SEED_TASKS } from './data/tasks';
import { SEED_OFFERS } from './data/offers';
import { offers } from '../../src/modules/offers/schema';
import { addressVerifications, backgroundChecks, identityVerifications, payoutAccounts } from '../../src/modules/verification/schema';
import { AGREEMENT_VERSIONS } from '../../src/modules/accounts/agreements';
import { agreements } from '../../src/modules/accounts/schema';
import { HELPER_LANGUAGES, SEED_REVIEWS, SERVICE_DESCRIPTIONS, WORK_SAMPLES } from './data/profile-extras';
import { reviews } from '../../src/modules/reviews/schema';
import { helperWorkSamples } from '../../src/modules/profiles/schema';
import { files } from '../../src/modules/tasks/schema';
import { bookingChangeRequests, bookingCompletionPhotos, bookingCompletions, bookingExpenses, bookingTerms, bookings, helperStrikes } from '../../src/modules/bookings/schema';
import { invites } from '../../src/modules/invites/schema';
import { rateLimits } from '../../src/platform/rate-limit/schema';
import { earnings, payouts } from '../../src/modules/earnings/schema';
import { savedHelpers } from '../../src/modules/reviews/schema';
import { blocks, messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { supportCaseEvents, supportCaseReads, supportCases } from '../../src/modules/support/schema';
import { notificationDeliveries, notificationPreferences, notifications, privacyRequests } from '../../src/modules/notifications/schema';
import { rebookProposals } from '../../src/modules/rebook/schema';
import { availabilityPosts } from '../../src/modules/availability/schema';
import { rewardGrants } from '../../src/modules/rewards/schema';
import { communityAnnouncementDismissals, communityAnnouncements, communityEdits, communityFollows, communityPosts, communityReactions, communityReplies } from '../../src/modules/community/schema';
import { taskQuestions } from '../../src/modules/questions/schema';
import { savedSearches } from '../../src/modules/searches/schema';
import { paymentMethods, payments, refunds } from '../../src/modules/payments/schema';
import { devCardRef } from '../../src/integrations/payments';
import { quoteBreakdown } from '../../src/modules/payments/fees';
import { backfillUsernames } from '../../src/modules/accounts/usernames';

/**
 * `testWorld`: the e2e and integration tests' world (the CLI seed, test:db's reset, the e2e reset, perf scratch
 * databases). Their cast lives in Austin, so Austin stays open there. Without it, the seed gives the owner's world:
 * Gainesville the first city, Austin a later one (paused). The preview's empty-database seed never sets it.
 */
export async function seedDatabase(url: string, options: { testWorld?: boolean } = {}): Promise<void> {
  const { db, pool } = createDb(url, { max: 2 });
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(markets)
        .values({ ...AUSTIN, zipPrefixes: AUSTIN_ZIP_PREFIXES, communityPrompts: AUSTIN_COMMUNITY_PROMPTS })
        .onConflictDoUpdate({ target: markets.id, set: { name: AUSTIN.name, status: AUSTIN.status, zipPrefixes: AUSTIN_ZIP_PREFIXES, communityPrompts: AUSTIN_COMMUNITY_PROMPTS } });

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

      // Gainesville, FL: the first city (owner, 2026-11-17), with Austin's categories, price guidance and fees to start.
      // Production gets the same rows from migration 0061.
      await tx
        .insert(markets)
        .values({ ...GAINESVILLE, zipPrefixes: GAINESVILLE_ZIP_PREFIXES, communityPrompts: GAINESVILLE_COMMUNITY_PROMPTS })
        .onConflictDoUpdate({ target: markets.id, set: { name: GAINESVILLE.name, timeZone: GAINESVILLE.timeZone, zipPrefixes: GAINESVILLE_ZIP_PREFIXES, communityPrompts: GAINESVILLE_COMMUNITY_PROMPTS } });
      for (const area of GAINESVILLE_AREAS) {
        const row = { id: gainesvilleAreaId(area.slug), marketId: GAINESVILLE.id, slug: area.slug, name: area.name, centerLat: area.lat, centerLng: area.lng };
        await tx.insert(areas).values(row).onConflictDoUpdate({ target: areas.id, set: { name: area.name, centerLat: area.lat, centerLng: area.lng } });
      }
      for (const { guidance, ...category } of CATEGORIES) {
        await tx
          .insert(marketCategories)
          .values({ marketId: GAINESVILLE.id, categoryId: category.id, enabled: true, priceGuidance: guidance })
          .onConflictDoNothing();
      }
      await tx
        .insert(marketPolicies)
        .values({
          id: GAINESVILLE_POLICY_ID,
          marketId: GAINESVILLE.id,
          version: 1,
          status: 'published',
          effectiveFrom: GAINESVILLE_POLICY_EFFECTIVE_FROM,
          fees: DEFAULT_FEES,
          cancellation: DEFAULT_CANCELLATION,
          timers: DEFAULT_TIMERS,
          publishedBy: 'system',
          publishedAt: GAINESVILLE_POLICY_EFFECTIVE_FROM,
        })
        .onConflictDoNothing();

      // The test world reopens Austin, where the e2e and integration cast lives (production's Austin is paused).
      if (options.testWorld) await tx.update(markets).set({ status: 'prelaunch' }).where(eq(markets.id, AUSTIN.id));

      for (const [key, flag] of Object.entries(DEFAULT_FLAGS)) {
        await tx
          .insert(featureFlags)
          .values({ key, marketId: 'global', enabled: flag.enabled, description: flag.description })
          .onConflictDoNothing();
      }

      await upsertPeople(tx, PEOPLE);
      // The test world's clients came in by invitation, as a market opening soon takes them (J-V8).
      if (options.testWorld) await seedTestWorldInvites(tx);

      await clearSeedBookings(tx);
      await seedTasks(tx);
      await seedProfileExtras(tx);
      await seedOffers(tx);
      await seedVerification(tx);
      await seedPaymentMethods(tx);
      await seedBookings(tx);
      await seedNotifications(tx);
      await seedSupport(tx);
      await seedRewards(tx);
      await seedAvailability(tx);
    });
    // Badges (completion plan 6.4) from the seeded bookings and reviews, stored without notifications.
    for (const person of PEOPLE) await recomputeBadges(db, person.id, new Date(), { announce: false });
    // Everyone has an @username (2026-11-22), from their first name.
    await backfillUsernames(db);
    await db.execute(sql`select 1`);
  } finally {
    await pool.end();
  }
}

export type Tx = Parameters<Parameters<ReturnType<typeof createDb>['db']['transaction']>[0]>[0];

/** A client invite code for Gainesville the specs' new accounts can use (J-V8): "Gainesville opens soon" lets them in. */
export const TEST_CLIENT_INVITE_CODE = 'SPECCLIENT';

/**
 * The test world's invitations (J-V8): every seeded person has a client invite in their home market, as the first
 * clients of a market opening soon do, and one client code opens Gainesville for new accounts made in the specs.
 */
async function seedTestWorldInvites(tx: Tx): Promise<void> {
  await tx
    .insert(betaInviteCodes)
    .values({ id: 'bic_spec_client_gnv', code: TEST_CLIENT_INVITE_CODE, marketId: GAINESVILLE.id, role: 'poster', label: 'Specs: new accounts', maxUses: 1_000_000, createdByUserId: 'usr_taylor' })
    .onConflictDoNothing();
  await tx
    .insert(betaAccess)
    .values(PEOPLE.map((person) => ({ userId: person.id, marketId: person.homeMarketId ?? AUSTIN.id, role: 'poster', grantedAt: new Date(person.createdAt) })))
    .onConflictDoNothing();
}

/**
 * Accounts, staff roles, helper profiles and services, as given (the demo data in db/seeds/demo uses it too).
 * People finished sign-up when they joined; a phone counts as verified from then.
 */
export async function upsertPeople(tx: Tx, people: readonly SeedPerson[]): Promise<void> {
  for (const person of people) {
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
      ...(person.locale ? { locale: person.locale } : {}),
      // Explicit, never the column's default: the cast is Austin's.
      homeMarketId: person.homeMarketId ?? AUSTIN.id,
      // Neighbors (plan 10): no chosen neighborhood and no digest yet, each reseed (e2e choose and receive them).
      homeAreaId: null,
      communityDigestAt: null,
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
        ...(helper.serviceRadiusKm !== undefined ? { serviceRadiusKm: helper.serviceRadiusKm } : {}),
        remoteOk: helper.remoteOk,
        tools: helper.tools,
        ...(helper.languages ? { languages: helper.languages } : {}),
        foundingNumber: helper.foundingNumber ?? null,
        idVerifiedAt: helper.idVerifiedAt ?? null,
        backgroundCheckedAt: helper.backgroundCheckedAt ?? null,
        addressVerifiedAt: helper.homeAddress?.verifiedAt ?? null,
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
          ...(service.description !== undefined ? { description: service.description } : {}),
        };
        await tx
          .insert(helperServices)
          .values(row)
          .onConflictDoUpdate({ target: [helperServices.userId, helperServices.categoryId], set: row });
      }
    }
  }
}

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
  const areaRows = await tx.select().from(areas);

  for (const seed of SEED_TASKS) {
    // Each task on its own market's clock: Austin's cast, or Gainesville's few.
    const market = seed.market === 'gainesville' ? GAINESVILLE : AUSTIN;
    const date = addDays(marketDayKey(now, market.timeZone), seed.daysFromToday);
    const windowStart = new Date(marketLocalToUtc(date, seed.start ?? '00:00', market.timeZone));
    const windowEnd = new Date(marketLocalToUtc(date, seed.end ?? '23:59', market.timeZone));
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
      marketId: market.id,
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
      // A reseed brings a task back as seeded: visible (a test that hid it and failed must not leave it hidden).
      hiddenAt: null,
      hiddenByUserId: null,
      hiddenReason: null,
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

/**
 * Bookings on the seeded tasks are removed before the tasks are reset to open, so the seed always
 * leaves them bookable (with their payments and terms).
 */
async function clearSeedBookings(tx: Tx): Promise<void> {
  const people = PEOPLE.map((person) => person.id);
  // Accepting a rebooking proposal copies its task (and books the copy): those go too, before the proposals
  // that point at them, so repeated e2e runs don't pile up bookings.
  const copied = (
    await tx
      .select({ taskId: rebookProposals.taskId })
      .from(rebookProposals)
      .where(and(or(inArray(rebookProposals.posterUserId, people), inArray(rebookProposals.helperUserId, people)), isNotNull(rebookProposals.taskId)))
  ).flatMap((row) => (row.taskId ? [row.taskId] : []));
  // Tasks an e2e run writes for itself (ids start with `tsk_e2e_`, tests/e2e/support/scenarios.ts) go with
  // their offers and everything on their bookings.
  const scratch = (await tx.select({ id: tasks.id }).from(tasks).where(like(tasks.id, String.raw`tsk\_e2e\_%`))).map((row) => row.id);
  const dropCopies = async () => {
    if (scratch.length > 0) {
      const scratchOffers = (await tx.select({ id: offers.id }).from(offers).where(inArray(offers.taskId, scratch))).map((row) => row.id);
      if (scratchOffers.length > 0) {
        const offerThreads = (await tx.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'offer'), inArray(threads.linkedId, scratchOffers)))).map((row) => row.id);
        if (offerThreads.length > 0) {
          await tx.delete(messages).where(inArray(messages.threadId, offerThreads));
          await tx.delete(threadParticipants).where(inArray(threadParticipants.threadId, offerThreads));
          await tx.delete(threads).where(inArray(threads.id, offerThreads));
        }
        await tx.delete(offers).where(inArray(offers.id, scratchOffers));
      }
    }
    const drop = [...copied, ...scratch];
    if (drop.length > 0) await tx.delete(tasks).where(inArray(tasks.id, drop));
  };
  const taskIds = [...SEED_TASKS.map((task) => task.id), ...copied, ...scratch];
  await tx.delete(savedHelpers).where(inArray(savedHelpers.userId, people));
  // Notifications, preferences and privacy requests start over too (the e2e changes them).
  await tx.delete(notificationDeliveries).where(inArray(notificationDeliveries.userId, people));
  await tx.delete(notifications).where(inArray(notifications.userId, people));
  await tx.delete(notificationPreferences).where(inArray(notificationPreferences.userId, people));
  await tx.delete(privacyRequests).where(inArray(privacyRequests.userId, people));
  // Rewards are derived from bookings again after the reset.
  await tx.delete(rewardGrants).where(inArray(rewardGrants.helperUserId, people));
  await tx.delete(invites).where(inArray(invites.posterUserId, people));
  // After the invites that hold them.
  await tx.delete(availabilityPosts).where(inArray(availabilityPosts.helperUserId, people));
  await tx.delete(rebookProposals).where(or(inArray(rebookProposals.posterUserId, people), inArray(rebookProposals.helperUserId, people)));
  // Rate-limit counters start over too (the seed is for development and tests only): repeated e2e runs on
  // one day would otherwise hit the daily limits (reports are 10 a day).
  await tx.delete(rateLimits);
  await tx.delete(blocks).where(or(inArray(blocks.blockerId, people), inArray(blocks.blockedId, people)));
  // Questions on the seeded tasks and the seeded people's community posts start over too (completion plan
  // 7.7–7.10; the e2e asks, answers and posts). Demo people's posts (db/seeds/demo) are left alone.
  await tx.delete(taskQuestions).where(or(inArray(taskQuestions.taskId, taskIds), inArray(taskQuestions.askerUserId, people)));
  const seededPosts = tx.select({ id: communityPosts.id }).from(communityPosts).where(inArray(communityPosts.authorUserId, people));
  const seededReplies = tx.select({ id: communityReplies.id }).from(communityReplies).where(or(inArray(communityReplies.authorUserId, people), inArray(communityReplies.postId, seededPosts)));
  await tx.delete(communityReactions).where(or(inArray(communityReactions.userId, people), inArray(communityReactions.targetId, seededPosts), inArray(communityReactions.targetId, seededReplies)));
  // Plan 10: the people's follows, edit history and announcements start over too (photos go with their posts).
  await tx.delete(communityFollows).where(inArray(communityFollows.userId, people));
  await tx.delete(communityEdits).where(inArray(communityEdits.editorUserId, people));
  await tx.delete(communityAnnouncementDismissals).where(inArray(communityAnnouncementDismissals.userId, people));
  await tx.delete(communityAnnouncements).where(inArray(communityAnnouncements.createdByUserId, people));
  await tx.delete(communityReplies).where(or(inArray(communityReplies.authorUserId, people), inArray(communityReplies.postId, seededPosts)));
  await tx.delete(communityPosts).where(inArray(communityPosts.authorUserId, people));
  await tx.delete(savedSearches).where(inArray(savedSearches.userId, people));
  const peopleCases = (await tx.select({ id: supportCases.id }).from(supportCases).where(inArray(supportCases.openedByUserId, people))).map((row) => row.id);
  if (peopleCases.length > 0) {
    await tx.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, peopleCases));
    await tx.delete(supportCaseReads).where(inArray(supportCaseReads.caseId, peopleCases));
    await tx.delete(supportCases).where(inArray(supportCases.id, peopleCases));
  }
  // Conversations on the seeded offers start empty each time.
  const offerThreads = await tx
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.kind, 'offer'), inArray(threads.linkedId, SEED_OFFERS.map((offer) => offer.id))));
  if (offerThreads.length > 0) {
    const offerThreadIds = offerThreads.map((row) => row.id);
    await tx.delete(messages).where(inArray(messages.threadId, offerThreadIds));
    await tx.delete(threadParticipants).where(inArray(threadParticipants.threadId, offerThreadIds));
    await tx.delete(threads).where(inArray(threads.id, offerThreadIds));
  }
  const rows = await tx.select({ id: bookings.id }).from(bookings).where(inArray(bookings.taskId, taskIds));
  if (rows.length === 0) return dropCopies();
  const ids = rows.map((row) => row.id);
  const bookingThreads = await tx
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.kind, 'booking'), inArray(threads.linkedId, ids.length > 0 ? ids : ['-'])));
  const threadIds = bookingThreads.map((row) => row.id);
  if (threadIds.length > 0) {
    await tx.delete(messages).where(inArray(messages.threadId, threadIds));
    await tx.delete(threadParticipants).where(inArray(threadParticipants.threadId, threadIds));
    await tx.delete(threads).where(inArray(threads.id, threadIds));
  }
  // Everything that points at the seeded bookings goes too: the bookings come back with the same ids.
  await tx.delete(reviews).where(inArray(reviews.bookingId, ids));
  const paidOut = await tx.select({ payoutId: earnings.payoutId }).from(earnings).where(inArray(earnings.bookingId, ids));
  await tx.delete(earnings).where(inArray(earnings.bookingId, ids));
  const payoutIds = paidOut.flatMap((row) => (row.payoutId ? [row.payoutId] : []));
  if (payoutIds.length > 0) await tx.delete(payouts).where(inArray(payouts.id, payoutIds));
  await tx.delete(refunds).where(inArray(refunds.bookingId, ids));
  await tx.delete(helperStrikes).where(inArray(helperStrikes.bookingId, ids));
  const bookingCases = (await tx.select({ id: supportCases.id }).from(supportCases).where(inArray(supportCases.bookingId, ids))).map((row) => row.id);
  if (bookingCases.length > 0) {
    await tx.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, bookingCases));
    await tx.delete(supportCaseReads).where(inArray(supportCaseReads.caseId, bookingCases));
  }
  await tx.delete(supportCases).where(inArray(supportCases.bookingId, ids));
  await tx.delete(bookingCompletionPhotos).where(inArray(bookingCompletionPhotos.bookingId, ids));
  await tx.delete(bookingExpenses).where(inArray(bookingExpenses.bookingId, ids));
  await tx.delete(bookingCompletions).where(inArray(bookingCompletions.bookingId, ids));
  await tx.delete(bookingChangeRequests).where(inArray(bookingChangeRequests.bookingId, ids));
  await tx.delete(payments).where(inArray(payments.bookingId, ids));
  await tx.delete(bookingTerms).where(inArray(bookingTerms.bookingId, ids));
  await tx.delete(bookings).where(inArray(bookings.id, ids));
  await dropCopies();
}

/**
 * Bookings on seeded tasks: Ben's bookshelf anchoring with Jordan, confirmed ($80; $88.00 charged), and Ruth's bookcase
 * with Jordan, in progress since an hour ago ($70; $77.00 charged).
 */
async function seedBookings(tx: Tx): Promise<void> {
  const [policy] = await tx.select().from(marketPolicies).where(and(eq(marketPolicies.marketId, AUSTIN.id), eq(marketPolicies.status, 'published')));
  if (!policy) throw new Error('Seed booking: no published policy');
  const now = new Date();
  const seedOne = async (input: { id: string; taskId: string; offerId: string; priceCents: number; status: 'confirmed' | 'in_progress' }) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, input.taskId));
    const [offer] = await tx.select().from(offers).where(eq(offers.id, input.offerId));
    if (!task || !offer) throw new Error(`Seed booking ${input.id}: the task or offer is missing`);
    const breakdown = quoteBreakdown(policy.fees, { type: 'fixed', priceCents: input.priceCents });
    const bookedAt = new Date(offer.createdAt.getTime() + 2 * 3_600_000);
    const started = input.status === 'in_progress';
    await tx.update(offers).set({ status: 'accepted', closedAt: bookedAt }).where(eq(offers.id, offer.id));
    await tx.update(tasks).set({ status: 'assigned', offerCount: 0 }).where(eq(tasks.id, task.id));
    await tx.insert(bookings).values({
      id: input.id,
      taskId: task.id,
      offerId: offer.id,
      posterUserId: task.posterUserId,
      helperUserId: offer.helperUserId,
      marketId: task.marketId,
      policyVersionId: policy.id,
      status: input.status,
      startAt: offer.proposedStart,
      confirmedAt: bookedAt,
      ...(started ? { onMyWayAt: new Date(now.getTime() - 90 * 60_000), arrivedAt: new Date(now.getTime() - 60 * 60_000) } : {}),
      createdAt: bookedAt,
      updatedAt: bookedAt,
    });
    await tx.insert(bookingTerms).values({
      id: `btm_${input.id.slice(4)}_1`,
      bookingId: input.id,
      version: 1,
      pricingType: 'fixed',
      priceCents: input.priceCents,
      breakdown,
      scopeText: task.description,
      startAt: offer.proposedStart,
      createdAt: bookedAt,
    });
    await tx.insert(payments).values({
      id: `pay_${input.id.slice(4)}`,
      bookingId: input.id,
      purpose: 'booking_funding',
      payerUserId: task.posterUserId,
      amountCents: breakdown.posterTotalCents,
      status: 'succeeded',
      provider: 'dev',
      providerRef: `devpi_seed_${input.id.slice(4)}`,
      methodRef: devCardRef('success'),
      methodBrand: 'visa',
      methodLast4: '4242',
      methodExpMonth: 12,
      methodExpYear: 2030,
      idempotencyKey: `seed:${input.id}`,
      createdAt: bookedAt,
      updatedAt: bookedAt,
    });
  };
  await seedOne({ id: 'bkg_tv', taskId: 'tsk_tv', offerId: 'off_tv_jordan', priceCents: 8000, status: 'confirmed' });
  await seedOne({ id: 'bkg_bookcase', taskId: 'tsk_bookcase', offerId: 'off_bookcase_jordan', priceCents: 7000, status: 'in_progress' });

  // Ana's dresser: Jordan sent the work an hour ago, Ana reported a problem (a dispute case waits for support).
  await seedOne({ id: 'bkg_dresser', taskId: 'tsk_dresser', offerId: 'off_dresser_jordan', priceCents: 6000, status: 'in_progress' });
  const [dresserTerms] = await tx.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_dresser'));
  const sent = new Date(Date.now() - 60 * 60_000);
  await tx.insert(bookingCompletions).values({
    bookingId: 'bkg_dresser',
    submittedAt: sent,
    note: 'All six drawers fitted.',
    finalBreakdown: dresserTerms!.breakdown,
    // The furniture checklist as Jordan ticked it (blueprint 01, P2): staff see it on the dispute.
    checklist: { all_parts_used: true, level_and_stable: true, anchored_if_asked: false, packaging_cleared: true },
  });
  await tx.update(bookings).set({ status: 'disputed', completionSubmittedAt: sent }).where(eq(bookings.id, 'bkg_dresser'));
  await tx.insert(supportCases).values({
    id: 'case_seed_dresser',
    type: 'dispute',
    status: 'open',
    priority: 'high',
    bookingId: 'bkg_dresser',
    openedByUserId: 'usr_ana',
    reason: 'not_done',
    description: 'Two of the drawers still stick and one runner is missing.',
    createdAt: new Date(Date.now() - 30 * 60_000),
    updatedAt: new Date(Date.now() - 30 * 60_000),
  });

  // Maya's wardrobe with Sam, three weeks ago: done, approved and paid out ($90; Sam earned $81.00). Past
  // the review window, so it only shows up in the lists and in Sam's My clients.
  await seedOne({ id: 'bkg_wardrobe', taskId: 'tsk_wardrobe', offerId: 'off_wardrobe_sam', priceCents: 9000, status: 'confirmed' });
  const [wardrobe] = await tx.select().from(bookings).where(eq(bookings.id, 'bkg_wardrobe'));
  const [wardrobeTerms] = await tx.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_wardrobe'));
  if (!wardrobe || !wardrobeTerms) throw new Error('Seed booking bkg_wardrobe: missing after insert');
  const wardrobeArrived = wardrobe.startAt;
  const wardrobeSent = new Date(wardrobeArrived.getTime() + 2 * 3_600_000);
  const wardrobeDone = new Date(wardrobeSent.getTime() + 3 * 3_600_000);
  await tx.insert(bookingCompletions).values({ bookingId: 'bkg_wardrobe', submittedAt: wardrobeSent, note: 'Wardrobe up, doors aligned, both shelves in.', finalBreakdown: wardrobeTerms.breakdown });
  await tx
    .update(bookings)
    .set({
      status: 'completed',
      onMyWayAt: new Date(wardrobeArrived.getTime() - 20 * 60_000),
      arrivedAt: wardrobeArrived,
      completionSubmittedAt: wardrobeSent,
      completedVia: 'poster',
      completedAt: wardrobeDone,
      updatedAt: wardrobeDone,
    })
    .where(eq(bookings.id, 'bkg_wardrobe'));
  await tx.update(tasks).set({ status: 'completed', updatedAt: wardrobeDone }).where(eq(tasks.id, 'tsk_wardrobe'));
  await tx.insert(earnings).values({
    id: 'ern_seed_wardrobe',
    bookingId: 'bkg_wardrobe',
    helperUserId: 'usr_sam',
    kind: 'earnings',
    amountCents: wardrobeTerms.breakdown.helperEarningsCents,
    status: 'transferred',
    transferRef: 'devtr_seed_wardrobe',
    transferredAt: wardrobeDone,
    createdAt: wardrobeDone,
    updatedAt: wardrobeDone,
  });
}

/** Maya's saved cards (development provider): the Visa is her default. Both pay successfully. */
/**
 * A few notifications that match the seeded bookings: Ruth hears that Jordan arrived (unread), Ben and
 * Jordan heard that the bookshelf booking was confirmed (read).
 */
async function seedNotifications(tx: Tx): Promise<void> {
  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000);
  // Ben booked the bookshelf anchoring from Jordan's offer, so only the helper heard "booked you" (booking_confirmed);
  // both hear the start reminder, with the booking's clock time (messages pass J-M5, J-M6).
  const [tv] = await tx.select({ startAt: bookings.startAt }).from(bookings).where(eq(bookings.id, 'bkg_tv'));
  if (!tv) throw new Error('Seed notifications: bkg_tv is missing');
  await tx.insert(notifications).values([
    { id: 'ntf_seed_ruth_arrived', userId: 'usr_ruth', type: 'helper_arrived', title: 'Assemble a bookcase', actorName: 'Jordan T.', target: { kind: 'booking', bookingId: 'bkg_bookcase' }, sourceEventId: 'seed:ruth_arrived', createdAt: at(50) },
    { id: 'ntf_seed_ruth_on_way', userId: 'usr_ruth', type: 'helper_on_the_way', title: 'Assemble a bookcase', actorName: 'Jordan T.', target: { kind: 'booking', bookingId: 'bkg_bookcase' }, sourceEventId: 'seed:ruth_on_way', createdAt: at(75), readAt: at(70) },
    { id: 'ntf_seed_ben_tv', userId: 'usr_ben', type: 'booking_reminder', title: 'Anchor a tall bookshelf to the wall', actorName: 'Jordan T.', target: { kind: 'booking', bookingId: 'bkg_tv' }, params: { at: tv.startAt.toISOString(), timeZone: AUSTIN.timeZone }, sourceEventId: 'seed:ben_tv', createdAt: at(24 * 60), readAt: at(23 * 60) },
    { id: 'ntf_seed_jordan_tv', userId: 'usr_jordan', type: 'booking_confirmed', title: 'Anchor a tall bookshelf to the wall', actorName: 'Ben W.', target: { kind: 'booking', bookingId: 'bkg_tv' }, sourceEventId: 'seed:jordan_tv', createdAt: at(24 * 60), readAt: at(23 * 60) },
  ]);
}

/** Maya asked about a payment; support (Alex) answered and waits on her (the support e2e reads it). */
async function seedSupport(tx: Tx): Promise<void> {
  const now = Date.now();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);
  await tx.insert(supportCases).values({
    id: 'case_seed_maya_payment',
    type: 'payment_issue',
    status: 'awaiting_poster',
    openedByUserId: 'usr_maya',
    topic: 'payment',
    description: 'I see a pending charge on my card for a booking I canceled. When does it go away?',
    createdAt: at(30),
    updatedAt: at(6),
  });
  await tx.insert(supportCaseEvents).values([
    { id: 'cev_seed_maya_1', caseId: 'case_seed_maya_payment', kind: 'message', authorUserId: 'usr_alex', partyUserId: 'usr_maya', body: 'Thanks, Maya. We are looking into it. Which booking was this for?', createdAt: at(6) },
    { id: 'cev_seed_maya_2', caseId: 'case_seed_maya_payment', kind: 'status', status: 'awaiting_poster', createdAt: new Date(at(6).getTime() + 1) },
  ]);
  // Maya last looked before support answered: the reply shows as new.
  await tx.insert(supportCaseReads).values({ caseId: 'case_seed_maya_payment', userId: 'usr_maya', readAt: at(30) });
}

/** Jordan's open Saturday-style yard slot, 10 days out (the availability e2e requests it for Ben's leaves). */
async function seedAvailability(tx: Tx): Promise<void> {
  const date = addDays(marketDayKey(new Date(), AUSTIN.timeZone), 10);
  await tx.insert(availabilityPosts).values({
    id: 'avl_seed_yard',
    helperUserId: 'usr_jordan',
    marketId: 'mkt_austin',
    categoryId: 'cat_yard_cleanup',
    startAt: new Date(marketLocalToUtc(date, '09:00', AUSTIN.timeZone)),
    endAt: new Date(marketLocalToUtc(date, '13:00', AUSTIN.timeZone)),
    pricingType: 'hourly',
    hourlyRateCents: 3000,
    estimatedHours: 3,
    hoursCap: 4,
    status: 'active',
  });
}

/** Sam's welcome reward waits for a lead's review (the admin e2e approves it). */
async function seedRewards(tx: Tx): Promise<void> {
  const now = Date.now();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);
  await tx.insert(rewardGrants).values({ id: 'rwd_seed_sam_review', helperUserId: 'usr_sam', program: 'welcome', amountCents: 5000, status: 'in_review', holdUntil: at(20), createdAt: at(24 * 15), updatedAt: at(20) });
}

async function seedPaymentMethods(tx: Tx): Promise<void> {
  const cards = [
    { id: 'pm_maya_visa', userId: 'usr_maya', brand: 'visa', last4: '1881', expMonth: 8, expYear: 2028, isDefault: true },
    { id: 'pm_maya_mc', userId: 'usr_maya', brand: 'mastercard', last4: '4444', expMonth: 3, expYear: 2027, isDefault: false },
  ];
  for (const card of cards) {
    const row = { ...card, provider: 'dev', providerRef: devCardRef('success'), detachedAt: null, createdAt: new Date('2026-10-20T15:00:00.000Z') };
    await tx.insert(paymentMethods).values(row).onConflictDoUpdate({ target: paymentMethods.id, set: row });
  }
}

/**
 * Verification rows that match the seeded helpers' badges, so recomputing a profile keeps them
 * where the seed put them (dev provider; nothing personal is stored).
 */
export async function seedVerification(tx: Tx, people: readonly SeedPerson[] = PEOPLE): Promise<void> {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) throw new Error('FIELD_ENCRYPTION_KEY is not set (see .env.example).');
  const cipher = createFieldCipher(key);
  for (const person of people) {
    const helper = person.helper;
    if (!helper) continue;
    const agree = async (doc: keyof typeof AGREEMENT_VERSIONS, at: Date) => {
      const row = { id: `agr_seed_${doc}_${person.id.slice(4)}`, userId: person.id, doc, version: AGREEMENT_VERSIONS[doc], acceptedAt: at, ip: null, userAgent: null };
      await tx.insert(agreements).values(row).onConflictDoUpdate({ target: agreements.id, set: row });
    };
    // Helpers who finished onboarding accepted the agreement and the notices along the way.
    if (helper.status === 'active') await agree('helper_agreement', new Date(person.createdAt));
    if (helper.idVerifiedAt) await agree('biometric_consent', new Date(new Date(helper.idVerifiedAt).getTime() - 5 * 60_000));
    if (helper.backgroundCheckedAt) await agree('bg_check_disclosure', new Date(new Date(helper.backgroundCheckedAt).getTime() - 3 * 86_400_000));
    if (helper.homeAddress) {
      const at = new Date(helper.homeAddress.verifiedAt);
      const sent = new Date(at.getTime() - 20 * 3_600_000);
      const row = {
        id: `adr_seed_${person.id.slice(4)}`,
        userId: person.id,
        status: 'verified',
        addressCiphertext: cipher.encrypt(JSON.stringify({ line1: helper.homeAddress.line1, city: 'Austin', state: 'TX', zip: helper.homeAddress.zip })),
        areaId: helper.areaId,
        documentType: 'utility_bill',
        // The document itself was deleted after the review (nothing to keep in a seed).
        documentFileId: null,
        documentDeletedAt: at,
        submittedAt: sent,
        decidedAt: at,
        decidedByUserId: 'usr_taylor',
        rejectionReason: null,
        autoCheck: null,
        requestedByUserId: null,
        createdAt: sent,
        updatedAt: at,
      };
      await tx.insert(addressVerifications).values(row).onConflictDoUpdate({ target: addressVerifications.id, set: row });
    }
    if (helper.idVerifiedAt) {
      const at = new Date(helper.idVerifiedAt);
      const row = {
        id: `idv_seed_${person.id.slice(4)}`,
        userId: person.id,
        provider: 'dev',
        providerSessionId: `vs_seed_${person.id.slice(4)}`,
        status: 'verified',
        failureReason: null,
        isAdult: true,
        nameMatches: true,
        verifiedAt: at,
        createdAt: at,
        updatedAt: at,
      };
      await tx.insert(identityVerifications).values(row).onConflictDoUpdate({ target: identityVerifications.id, set: row });
    }
    if (helper.payoutsReadyAt) {
      const at = new Date(helper.payoutsReadyAt);
      const row = {
        userId: person.id,
        provider: 'dev',
        providerAccountId: `acct_seed_${person.id.slice(4)}`,
        status: 'active',
        activatedAt: at,
        createdAt: at,
        updatedAt: at,
      };
      await tx.insert(payoutAccounts).values(row).onConflictDoUpdate({ target: payoutAccounts.userId, set: row });
    }
    if (helper.backgroundCheckedAt) {
      const at = new Date(helper.backgroundCheckedAt);
      const row = {
        id: `bgc_seed_${person.id.slice(4)}`,
        userId: person.id,
        provider: 'dev',
        providerRef: `chk_seed_${person.id.slice(4)}`,
        status: 'clear',
        completedAt: at,
        expiresAt: new Date(at.getTime() + 365 * 86_400_000),
        createdAt: at,
        updatedAt: at,
      };
      await tx.insert(backgroundChecks).values(row).onConflictDoUpdate({ target: backgroundChecks.id, set: row });
    }
  }
}
