/**
 * Writes the demo marketplace (./plan.ts) on top of the base seed. Safe to run again: people, addresses and tasks
 * are updated in place (so anything a real person did that points at them stays valid), and everything that
 * happens on the demo tasks (offers, bookings, money, reviews, conversations, saved helpers, open slots) is
 * replaced, with times moved up to now. Only rows with demo ids are touched.
 *
 * The preview runs it on every deploy (scripts/preview/prepare-db.ts); locally, `npm run db:demo`.
 */
import { and, eq, inArray, like, notInArray, or, sql } from 'drizzle-orm';
import { createDb } from '../../../src/platform/db/connect';
import { createFieldCipher } from '../../../src/platform/crypto/field-encryption';
import { marketPolicies } from '../../../src/modules/markets/schema';
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
import { devCardRef } from '../../../src/integrations/payments';
import { recomputeBadges } from '../../../src/modules/badges/service';
import { cacheTagInvalidations } from '../../../src/platform/cache/schema';
import { seedVerification, upsertPeople, type Tx } from '../seed';
import { AUSTIN } from '../data/austin';
import { buildDemoPlan, DEMO_PREFIX, type DemoPlan } from './plan';

/** `<table prefix>_demo_%` as a LIKE pattern (underscores escaped). */
const demoIds = (prefix: string) => `${prefix}\\_${DEMO_PREFIX.replace('_', '\\_')}%`;

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
    const row = { ...rest, marketId: AUSTIN.id, reopenedAt: null, hiddenAt: null, hiddenByUserId: null, hiddenReason: null };
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
    await tx.insert(bookings).values({ ...row, marketId: AUSTIN.id, policyVersionId: plan.policyId, termsVersion: 1 });
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
    await tx.insert(availabilityPosts).values(plan.availability.map((post) => ({ ...post, marketId: AUSTIN.id, status: 'active', updatedAt: post.createdAt })));
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

/** Builds the plan from the market's published fees and writes it in one transaction; then badges. */
export async function seedDemoData(url: string, now = new Date()): Promise<{ people: number; tasks: number; offers: number; bookings: number }> {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) throw new Error('FIELD_ENCRYPTION_KEY is not set (see .env.example).');
  const { db, pool } = createDb(url, { max: 2 });
  try {
    const [policy] = await db.select().from(marketPolicies).where(and(eq(marketPolicies.marketId, AUSTIN.id), eq(marketPolicies.status, 'published'))).limit(1);
    if (!policy) throw new Error('Demo data needs the base seed first: no published policy for Austin.');
    const plan = buildDemoPlan({ now, fees: policy.fees, policyId: policy.id });
    await db.transaction((tx) => writeDemoPlan(tx, plan, key));
    for (const person of plan.people) await recomputeBadges(db, person.id, now, { announce: false });
    // Cached pages (the board, the market and category pages, profiles, task pages) show the new data at once:
    // the same invalidation `updateTag` shares (cache-handlers/shared-tags.mjs), so it reaches every instance,
    // and on a deploy it also covers what the build prerendered.
    const tags = ['tasks', 'helpers', 'markets', 'sitemap', `market:${AUSTIN.slug}`, ...plan.tasks.map((task) => `task:${task.slug}`), ...plan.people.flatMap((person) => (person.helper ? [`helper:${person.helper.handle}`] : []))];
    const expiredAt = Date.now() + 1;
    await db
      .insert(cacheTagInvalidations)
      .values(tags.map((tag) => ({ tag, expiredAt, updatedAt: sql`clock_timestamp()` })))
      .onConflictDoUpdate({ target: cacheTagInvalidations.tag, set: { expiredAt: sql`greatest(coalesce(${cacheTagInvalidations.expiredAt}, 0), excluded.expired_at)`, updatedAt: sql`clock_timestamp()` } });
    return { people: plan.people.length, tasks: plan.tasks.length, offers: plan.offers.length, bookings: plan.bookings.length };
  } finally {
    await pool.end();
  }
}
