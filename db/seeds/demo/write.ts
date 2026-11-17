/**
 * Writes the demo marketplace (./plan.ts) on top of the base seed. Safe to run again: the demo markets, people,
 * addresses and tasks are updated in place (so anything a real person did that points at them stays valid), and
 * everything that happens on the demo tasks (offers, bookings, money, reviews, conversations, saved helpers, open
 * slots) is replaced, with times moved up to now. Only rows with demo ids are touched.
 *
 * The preview runs it on every deploy (scripts/preview/prepare-db.ts); locally, `npm run db:demo`.
 */
import { and, eq, inArray, like, notInArray, or, sql } from 'drizzle-orm';
import { createDb } from '../../../src/platform/db/connect';
import { createFieldCipher } from '../../../src/platform/crypto/field-encryption';
import { areas, marketCategories, marketPolicies, markets } from '../../../src/modules/markets/schema';
import { DEFAULT_CANCELLATION, DEFAULT_FEES, DEFAULT_TIMERS } from '../../../src/modules/markets/policy-defaults';
import { helperProfiles } from '../../../src/modules/profiles/schema';
import { taskLocations, tasks } from '../../../src/modules/tasks/schema';
import { offers } from '../../../src/modules/offers/schema';
import { bookingChangeRequests, bookingCompletionPhotos, bookingCompletions, bookingExpenses, bookingTerms, bookings, helperStrikes } from '../../../src/modules/bookings/schema';
import { payments, refunds } from '../../../src/modules/payments/schema';
import { earnings } from '../../../src/modules/earnings/schema';
import { reviews, savedHelpers } from '../../../src/modules/reviews/schema';
import { messages, threadParticipants, threads } from '../../../src/modules/messaging/schema';
import { availabilityPosts } from '../../../src/modules/availability/schema';
import { notificationDeliveries, notifications } from '../../../src/modules/notifications/schema';
import { communityPosts, communityReactions, communityReplies } from '../../../src/modules/community/schema';
import { devCardRef } from '../../../src/integrations/payments';
import { recomputeBadges } from '../../../src/modules/badges/service';
import { cacheTagInvalidations } from '../../../src/platform/cache/schema';
import { seedVerification, upsertPeople, type Tx } from '../seed';
import { AUSTIN, CATEGORIES } from '../data/austin';
import { DEMO_MARKETS, demoAreaId, demoMarketId, demoPolicyId } from './markets';
import { buildDemoPlan, DEMO_PREFIX, DEMO_TIME_ZONE, type DemoPlan, type DemoPolicies } from './plan';
import { buildDemoCommunity, buildDemoQuestions, type DemoCommunity, type DemoTaskQuestion } from './community';
import { taskQuestions } from '../../../src/modules/questions/schema';

/** `<table prefix>_demo_%` as a LIKE pattern (underscores escaped). */
const demoIds = (prefix: string) => `${prefix}\\_${DEMO_PREFIX.replace('_', '\\_')}%`;

/**
 * The demo markets beyond Austin, as the app needs them to show work: the market (pre-launch, Central time), its
 * neighborhoods, every category enabled with prices at the city's level, and a published policy with the default
 * fees. A market's status and a policy staff published later are left as they are.
 */
export async function writeDemoMarkets(tx: Tx): Promise<void> {
  const effectiveFrom = '2026-11-01T06:00:00.000Z';
  for (const market of DEMO_MARKETS) {
    const id = demoMarketId(market);
    // The ZIP3 prefixes its neighborhoods sit in (national, cities open in turn): a ZIP there reads as this city.
    const zipPrefixes = [...new Set(market.areas.map((area) => area.zip.slice(0, 3)))];
    const place = { name: market.name, state: market.state, timeZone: DEMO_TIME_ZONE, centerLat: market.lat, centerLng: market.lng, serviceRadiusKm: market.serviceRadiusKm, zipPrefixes };
    await tx.insert(markets).values({ id, slug: market.slug, currency: 'USD', status: 'prelaunch', ...place }).onConflictDoUpdate({ target: markets.id, set: place });
    for (const area of market.areas) {
      const row = { id: demoAreaId(market, area), marketId: id, slug: area.slug, name: area.name, centerLat: area.lat, centerLng: area.lng };
      await tx.insert(areas).values(row).onConflictDoUpdate({ target: areas.id, set: row });
    }
    for (const category of CATEGORIES) {
      const step = category.guidance.unit === 'hour' ? 100 : 500;
      const scale = (cents: number) => Math.max(step, Math.round((cents * market.priceFactor) / step) * step);
      const priceGuidance = { ...category.guidance, lowCents: scale(category.guidance.lowCents), highCents: scale(category.guidance.highCents) };
      await tx
        .insert(marketCategories)
        .values({ marketId: id, categoryId: category.id, enabled: true, priceGuidance })
        .onConflictDoUpdate({ target: [marketCategories.marketId, marketCategories.categoryId], set: { priceGuidance } });
    }
    await tx
      .insert(marketPolicies)
      .values({ id: demoPolicyId(market), marketId: id, version: 1, status: 'published', effectiveFrom, fees: DEFAULT_FEES, cancellation: DEFAULT_CANCELLATION, timers: DEFAULT_TIMERS, publishedBy: 'system', publishedAt: effectiveFrom })
      .onConflictDoNothing();
  }
}

/** Each market's current published policy (Austin's from the base seed, the others from `writeDemoMarkets`). */
export async function loadDemoPolicies(tx: Tx): Promise<DemoPolicies> {
  const marketIds = [AUSTIN.id, ...DEMO_MARKETS.map(demoMarketId)];
  const rows = await tx.select().from(marketPolicies).where(and(inArray(marketPolicies.marketId, marketIds), eq(marketPolicies.status, 'published')));
  const policies: DemoPolicies = {};
  for (const row of rows.sort((a, b) => a.version - b.version)) policies[row.marketId] = { id: row.id, fees: row.fees };
  for (const marketId of marketIds) if (!policies[marketId]) throw new Error(`Demo data: no published policy for ${marketId} (Austin's comes from the base seed).`);
  return policies;
}

/** Everything on the demo tasks goes, before it's written again (bookings first: they point at offers). */
async function clearDemoActivity(tx: Tx, plan: DemoPlan): Promise<void> {
  const demoBookingIds = (await tx.select({ id: bookings.id }).from(bookings).where(like(bookings.id, demoIds('bkg')))).map((row) => row.id);
  if (demoBookingIds.length > 0) {
    const bookingThreads = (await tx.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'booking'), inArray(threads.linkedId, demoBookingIds)))).map((row) => row.id);
    if (bookingThreads.length > 0) {
      await tx.delete(messages).where(inArray(messages.threadId, bookingThreads));
      await tx.delete(threadParticipants).where(inArray(threadParticipants.threadId, bookingThreads));
      await tx.delete(threads).where(inArray(threads.id, bookingThreads));
    }
    await tx.delete(reviews).where(inArray(reviews.bookingId, demoBookingIds));
    await tx.delete(earnings).where(inArray(earnings.bookingId, demoBookingIds));
    await tx.delete(refunds).where(inArray(refunds.bookingId, demoBookingIds));
    await tx.delete(payments).where(inArray(payments.bookingId, demoBookingIds));
    await tx.delete(helperStrikes).where(inArray(helperStrikes.bookingId, demoBookingIds));
    await tx.delete(bookingCompletionPhotos).where(inArray(bookingCompletionPhotos.bookingId, demoBookingIds));
    await tx.delete(bookingExpenses).where(inArray(bookingExpenses.bookingId, demoBookingIds));
    await tx.delete(bookingCompletions).where(inArray(bookingCompletions.bookingId, demoBookingIds));
    await tx.delete(bookingChangeRequests).where(inArray(bookingChangeRequests.bookingId, demoBookingIds));
    await tx.delete(bookingTerms).where(inArray(bookingTerms.bookingId, demoBookingIds));
    await tx.delete(bookings).where(inArray(bookings.id, demoBookingIds));
  }
  const demoOfferIds = (await tx.select({ id: offers.id }).from(offers).where(like(offers.id, demoIds('off')))).map((row) => row.id);
  if (demoOfferIds.length > 0) {
    const offerThreads = (await tx.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'offer'), inArray(threads.linkedId, demoOfferIds)))).map((row) => row.id);
    if (offerThreads.length > 0) {
      await tx.delete(messages).where(inArray(messages.threadId, offerThreads));
      await tx.delete(threadParticipants).where(inArray(threadParticipants.threadId, offerThreads));
      await tx.delete(threads).where(inArray(threads.id, offerThreads));
    }
    await tx.delete(offers).where(inArray(offers.id, demoOfferIds));
  }
  await tx.delete(reviews).where(like(reviews.id, demoIds('rev')));
  await tx.delete(availabilityPosts).where(like(availabilityPosts.id, demoIds('avl')));
  const people = plan.people.map((person) => person.id);
  await tx.delete(savedHelpers).where(inArray(savedHelpers.userId, people));
  // Reminders and alerts the job runner sent demo people since the last run start over too.
  await tx.delete(notificationDeliveries).where(inArray(notificationDeliveries.userId, people));
  await tx.delete(notifications).where(inArray(notifications.userId, people));
}

export async function writeDemoPlan(tx: Tx, plan: DemoPlan, encryptionKey: string): Promise<void> {
  const cipher = createFieldCipher(encryptionKey);
  await clearDemoActivity(tx, plan);

  await upsertPeople(tx, plan.people);
  await seedVerification(tx, plan.people);
  for (const stat of plan.helperStats) {
    await tx.update(helperProfiles).set({ completedCount: stat.completedCount }).where(eq(helperProfiles.userId, stat.userId));
  }

  for (const location of plan.locations) {
    const row = { id: location.id, ownerUserId: location.ownerUserId, addressEnc: cipher.encrypt(JSON.stringify(location.address)), zip: location.zip, areaId: location.areaId, deletedAt: null };
    await tx.insert(taskLocations).values(row).onConflictDoUpdate({ target: taskLocations.id, set: row });
  }

  for (const task of plan.tasks) {
    const { categorySlug: _slug, ...rest } = task;
    const row = { ...rest, reopenedAt: null, hiddenAt: null, hiddenByUserId: null, hiddenReason: null };
    await tx.insert(tasks).values(row).onConflictDoUpdate({ target: tasks.id, set: row });
  }
  // Demo tasks an earlier version of the plan had and this one doesn't: closed, so nothing stays open forever.
  await tx
    .update(tasks)
    .set({ status: 'expired', offerCount: 0 })
    .where(and(like(tasks.id, demoIds('tsk')), notInArray(tasks.id, plan.tasks.map((task) => task.id)), or(eq(tasks.status, 'open'), eq(tasks.status, 'assigned'))));

  for (let i = 0; i < plan.offers.length; i += 200) await tx.insert(offers).values(plan.offers.slice(i, i + 200));

  for (const booking of plan.bookings) {
    const { terms, payment, completion, earning, refund, reviews: bookingReviews, chat, ...row } = booking;
    await tx.insert(bookings).values({ ...row, termsVersion: 1 });
    await tx.insert(bookingTerms).values({ id: `btm_${booking.id.slice(4)}_1`, bookingId: booking.id, version: 1, ...terms, startAt: booking.startAt, createdAt: booking.confirmedAt });
    const paymentId = `pay_${booking.id.slice(4)}`;
    await tx.insert(payments).values({
      id: paymentId,
      bookingId: booking.id,
      purpose: 'booking_funding',
      payerUserId: booking.posterUserId,
      amountCents: payment.amountCents,
      status: payment.status,
      provider: 'dev',
      providerRef: `devpi_${booking.id.slice(4)}`,
      methodRef: devCardRef('success'),
      methodBrand: payment.brand,
      methodLast4: payment.last4,
      methodExpMonth: payment.expMonth,
      methodExpYear: payment.expYear,
      idempotencyKey: `demo:${booking.id}`,
      createdAt: booking.confirmedAt,
      updatedAt: refund?.at ?? booking.confirmedAt,
    });
    if (completion) await tx.insert(bookingCompletions).values({ bookingId: booking.id, ...completion });
    if (earning) {
      await tx.insert(earnings).values({
        id: `ern_${booking.id.slice(4)}`,
        bookingId: booking.id,
        helperUserId: booking.helperUserId,
        kind: 'earnings',
        amountCents: earning.amountCents,
        status: 'transferred',
        transferRef: `devtr_${booking.id.slice(4)}`,
        transferredAt: earning.at,
        createdAt: earning.at,
        updatedAt: earning.at,
      });
    }
    if (refund) {
      await tx.insert(refunds).values({
        id: `ref_${booking.id.slice(4)}`,
        paymentId,
        bookingId: booking.id,
        amountCents: refund.amountCents,
        reason: 'unused_cap',
        status: 'succeeded',
        providerRef: `devre_${booking.id.slice(4)}`,
        idempotencyKey: `refund:${booking.id}:completion`,
        createdAt: refund.at,
      });
    }
    if (bookingReviews.length > 0) await tx.insert(reviews).values(bookingReviews.map((review) => ({ ...review, bookingId: booking.id })));
    if (chat.length > 0) {
      const threadId = `thr_${booking.id.slice(4)}`;
      const last = chat[chat.length - 1]!.at;
      await tx.insert(threads).values({ id: threadId, kind: 'booking', linkedId: booking.id, taskId: booking.taskId, createdAt: booking.confirmedAt, lastMessageAt: last });
      await tx.insert(threadParticipants).values([
        { threadId, userId: booking.posterUserId, lastReadAt: last },
        { threadId, userId: booking.helperUserId, lastReadAt: last },
      ]);
      await tx.insert(messages).values(chat.map((message, index) => ({ id: `msg_${booking.id.slice(4)}_${index + 1}`, threadId, senderUserId: message.senderUserId, kind: 'text', body: message.body, createdAt: message.at })));
    }
  }

  if (plan.savedHelpers.length > 0) await tx.insert(savedHelpers).values(plan.savedHelpers).onConflictDoNothing();
  if (plan.availability.length > 0) {
    await tx.insert(availabilityPosts).values(plan.availability.map((post) => ({ ...post, status: 'active', updatedAt: post.createdAt })));
  }

  // Ratings on cards and profiles come from published reviews (as in the base seed).
  const helperIds = plan.helperStats.map((stat) => stat.userId);
  await tx.execute(sql`
    update helper_profiles hp set
      rating_count = coalesce(s.count, 0),
      rating_average = s.average
    from (select u.id as user_id, r.count, r.average
          from users u
          left join (select subject_user_id, count(*)::int as count, avg(rating)::float8 as average
                     from reviews where status = 'published' and direction = 'client_to_helper'
                     group by subject_user_id) r on r.subject_user_id = u.id
          where u.id in (${sql.join(helperIds.map((id) => sql`${id}`), sql`, `)})) s
    where s.user_id = hp.user_id`);
}

/**
 * The demo community (completion plan 7.11), replaced on every run: the old demo posts go (their replies with
 * them, and every reaction on either, including real people's), then the new ones are written.
 */
export async function writeDemoCommunity(tx: Tx, community: DemoCommunity): Promise<void> {
  const oldPosts = tx.select({ id: communityPosts.id }).from(communityPosts).where(like(communityPosts.id, demoIds('cpo')));
  const oldReplies = tx.select({ id: communityReplies.id }).from(communityReplies).where(inArray(communityReplies.postId, oldPosts));
  await tx.delete(communityReactions).where(or(inArray(communityReactions.targetId, oldPosts), inArray(communityReactions.targetId, oldReplies)));
  await tx.delete(communityReplies).where(inArray(communityReplies.postId, oldPosts));
  await tx.delete(communityPosts).where(like(communityPosts.id, demoIds('cpo')));
  for (let i = 0; i < community.posts.length; i += 200) {
    await tx.insert(communityPosts).values(community.posts.slice(i, i + 200).map((post) => ({ ...post, status: 'visible', updatedAt: post.lastActivityAt })));
  }
  for (let i = 0; i < community.replies.length; i += 300) {
    await tx.insert(communityReplies).values(community.replies.slice(i, i + 300).map((reply) => ({ ...reply, status: 'visible', updatedAt: reply.createdAt })));
  }
  for (let i = 0; i < community.reactions.length; i += 500) {
    await tx.insert(communityReactions).values(community.reactions.slice(i, i + 500)).onConflictDoNothing();
  }
}

/** Demo questions on the demo tasks (completion plan 7.11), replaced on every run (demo ids only). */
export async function writeDemoQuestions(tx: Tx, questions: DemoTaskQuestion[]): Promise<void> {
  await tx.delete(taskQuestions).where(like(taskQuestions.id, demoIds('tqn')));
  for (let i = 0; i < questions.length; i += 300) {
    await tx.insert(taskQuestions).values(questions.slice(i, i + 300).map((question) => ({ ...question, status: 'visible', updatedAt: question.answeredAt ?? question.createdAt })));
  }
}

/** Writes the markets, builds the plan from their published fees and writes it, in one transaction; then badges. */
export async function seedDemoData(url: string, now = new Date()): Promise<{ markets: number; people: number; tasks: number; offers: number; bookings: number }> {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) throw new Error('FIELD_ENCRYPTION_KEY is not set (see .env.example).');
  const { db, pool } = createDb(url, { max: 2 });
  try {
    const plan = await db.transaction(async (tx) => {
      await writeDemoMarkets(tx);
      const built = buildDemoPlan({ now, policies: await loadDemoPolicies(tx) });
      await writeDemoPlan(tx, built, key);
      await writeDemoCommunity(tx, buildDemoCommunity(built, now));
      await writeDemoQuestions(tx, buildDemoQuestions(built, now));
      return built;
    });
    for (const person of plan.people) await recomputeBadges(db, person.id, now, { announce: false });
    // Cached pages (the board, the market and category pages, profiles, task pages) show the new data at once:
    // the same invalidation `updateTag` shares (cache-handlers/shared-tags.mjs), so it reaches every instance,
    // and on a deploy it also covers what the build prerendered.
    const tags = [
      'tasks',
      'helpers',
      'markets',
      'sitemap',
      ...[AUSTIN.slug, ...DEMO_MARKETS.map((market) => market.slug)].map((slug) => `market:${slug}`),
      ...plan.tasks.map((task) => `task:${task.slug}`),
      ...plan.people.flatMap((person) => (person.helper ? [`helper:${person.helper.handle}`] : [])),
    ];
    const expiredAt = Date.now() + 1;
    for (let i = 0; i < tags.length; i += 500) {
      await db
        .insert(cacheTagInvalidations)
        .values(tags.slice(i, i + 500).map((tag) => ({ tag, expiredAt, updatedAt: sql`clock_timestamp()` })))
        .onConflictDoUpdate({ target: cacheTagInvalidations.tag, set: { expiredAt: sql`greatest(coalesce(${cacheTagInvalidations.expiredAt}, 0), excluded.expired_at)`, updatedAt: sql`clock_timestamp()` } });
    }
    return { markets: DEMO_MARKETS.length + 1, people: plan.people.length, tasks: plan.tasks.length, offers: plan.offers.length, bookings: plan.bookings.length };
  } finally {
    await pool.end();
  }
}
