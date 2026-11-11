/**
 * Idempotent seed: Austin market, areas, categories, policy v1 (published) and v2 (draft),
 * feature flags. People and tasks are added by later phases (from src/fixtures).
 */
import { and, eq, inArray, or, sql } from 'drizzle-orm';
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
import { backgroundChecks, identityVerifications, payoutAccounts } from '../../src/modules/verification/schema';
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
import { notificationPreferences, notifications, privacyRequests } from '../../src/modules/notifications/schema';
import { rewardGrants } from '../../src/modules/rewards/schema';
import { paymentMethods, payments, refunds } from '../../src/modules/payments/schema';
import { devCardRef } from '../../src/integrations/payments';
import { quoteBreakdown } from '../../src/modules/payments/fees';

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

      await clearSeedBookings(tx);
      await seedTasks(tx);
      await seedProfileExtras(tx);
      await seedOffers(tx);
      await seedVerification(tx);
      await seedPaymentMethods(tx);
      await seedBookings(tx);
      await seedNotifications(tx);
      await seedSupport(tx);
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

/**
 * Bookings on the seeded tasks are removed before the tasks are reset to open, so the seed always
 * leaves them bookable (with their payments and terms).
 */
async function clearSeedBookings(tx: Tx): Promise<void> {
  const taskIds = SEED_TASKS.map((task) => task.id);
  const people = PEOPLE.map((person) => person.id);
  await tx.delete(savedHelpers).where(inArray(savedHelpers.userId, people));
  // Notifications, preferences and privacy requests start over too (the e2e changes them).
  await tx.delete(notifications).where(inArray(notifications.userId, people));
  await tx.delete(notificationPreferences).where(inArray(notificationPreferences.userId, people));
  await tx.delete(privacyRequests).where(inArray(privacyRequests.userId, people));
  // Rewards are derived from bookings again after the reset.
  await tx.delete(rewardGrants).where(inArray(rewardGrants.helperUserId, people));
  await tx.delete(invites).where(inArray(invites.posterUserId, people));
  // Rate-limit counters start over too (the seed is for development and tests only): repeated e2e runs on
  // one day would otherwise hit the daily limits (reports are 10 a day).
  await tx.delete(rateLimits);
  await tx.delete(blocks).where(or(inArray(blocks.blockerId, people), inArray(blocks.blockedId, people)));
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
  if (rows.length === 0) return;
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
}

/**
 * Bookings on seeded tasks: Ben's TV with Jordan, confirmed ($80; $88.00 charged), and Ruth's bookcase
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
}

/** Maya's saved cards (development provider): the Visa is her default. Both pay successfully. */
/**
 * A few notifications that match the seeded bookings: Ruth hears that Jordan arrived (unread), Ben and
 * Jordan heard that the TV booking was confirmed (read).
 */
async function seedNotifications(tx: Tx): Promise<void> {
  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000);
  await tx.insert(notifications).values([
    { id: 'ntf_seed_ruth_arrived', userId: 'usr_ruth', type: 'helper_arrived', title: 'Assemble a bookcase', actorName: 'Jordan T.', target: { kind: 'booking', bookingId: 'bkg_bookcase' }, sourceEventId: 'seed:ruth_arrived', createdAt: at(50) },
    { id: 'ntf_seed_ruth_on_way', userId: 'usr_ruth', type: 'helper_on_the_way', title: 'Assemble a bookcase', actorName: 'Jordan T.', target: { kind: 'booking', bookingId: 'bkg_bookcase' }, sourceEventId: 'seed:ruth_on_way', createdAt: at(75), readAt: at(70) },
    { id: 'ntf_seed_ben_tv', userId: 'usr_ben', type: 'booking_confirmed', title: 'Mount a TV on the wall', target: { kind: 'booking', bookingId: 'bkg_tv' }, sourceEventId: 'seed:ben_tv', createdAt: at(24 * 60), readAt: at(23 * 60) },
    { id: 'ntf_seed_jordan_tv', userId: 'usr_jordan', type: 'booking_confirmed', title: 'Mount a TV on the wall', actorName: 'Ben W.', target: { kind: 'booking', bookingId: 'bkg_tv' }, sourceEventId: 'seed:jordan_tv', createdAt: at(24 * 60), readAt: at(23 * 60) },
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
async function seedVerification(tx: Tx): Promise<void> {
  for (const person of PEOPLE) {
    const helper = person.helper;
    if (!helper) continue;
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
