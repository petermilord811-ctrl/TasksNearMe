import { and, asc, desc, eq, gt, lte, or, sql } from 'drizzle-orm';
import type { ActionResult, HelperSummary, ReviewDirection, ReviewInput, ReviewPageData, SavedHelpersPageData } from '@/contracts';
import { createReviewInputSchema } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { categories } from '@/modules/markets/schema';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { profilePhotoOf } from '@/modules/files/photos';
import { openReviewFeedbackCase } from '@/modules/support/service';
import { tasks } from '@/modules/tasks/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { isUniqueViolation } from '@/platform/db/errors';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { reviews, savedHelpers } from './schema';
import { deletedLabelFor, shownPerson } from '@/modules/accounts/shown-name';

/**
 * Reviews after a completed booking (blueprint 02 J8): two-way, double-blind. A review becomes visible
 * when both are in, or 14 days after completion; then the helper's rating is recomputed from published
 * client reviews. Low ratings are never hidden. Plus the client's saved helpers.
 */

const WINDOW_MS = 14 * 86_400_000;
const REVIEW_RATE_LIMIT = { limit: 10, windowSeconds: 600 };

/** Ratings on cards and profiles come from published client reviews (also after staff hide or show one). */
export async function recomputeRating(db: Pick<Db, 'execute'>, helperUserId: string): Promise<void> {
  await db.execute(sql`
    update helper_profiles hp set
      rating_count = coalesce(s.count, 0),
      rating_average = s.average
    from (select count(*)::int as count, avg(rating)::float8 as average
          from reviews where status = 'published' and direction = 'client_to_helper' and subject_user_id = ${helperUserId}) s
    where hp.user_id = ${helperUserId}`);
}

/** Publishes the booking's reviews (both in, or the window ended). Returns the helper whose rating changed, if any. */
async function publish(db: Db, bookingId: string, now: Date): Promise<string | null> {
  const published = await db
    .update(reviews)
    .set({ status: 'published', publishedAt: now })
    .where(and(eq(reviews.bookingId, bookingId), eq(reviews.status, 'submitted')))
    .returning({ author: reviews.authorUserId, subject: reviews.subjectUserId, direction: reviews.direction });
  if (published.length === 0) return null;
  // Who wrote each review published now and who it's about: only its subject hears it's out (sweep RV1).
  const named = published.map((row) => ({ authorUserId: row.author, subjectUserId: row.subject }));
  await db.insert(outboxEvents).values({ id: newId('evt'), type: 'reviews.published', aggregateType: 'booking', aggregateId: bookingId, payload: { bookingId, reviews: named } });
  const helper = published.find((row) => row.direction === 'client_to_helper')?.subject ?? null;
  if (helper) await recomputeRating(db, helper);
  return helper;
}

/** Reviews whose window ended are published (lazily, until the job runner exists). */
export async function publishDueReviews(db: Db, now: Date): Promise<void> {
  const due = await db
    .selectDistinct({ bookingId: reviews.bookingId })
    .from(reviews)
    .innerJoin(bookings, eq(bookings.id, reviews.bookingId))
    .where(and(eq(reviews.status, 'submitted'), lte(bookings.completedAt, new Date(now.getTime() - WINDOW_MS))));
  for (const { bookingId } of due) if (bookingId) await publish(db, bookingId, now);
}

/** The reminder goes out this many days before the review window closes (sweep RV4). */
export const REVIEW_REMINDER_DAYS = 3;
/** A booking completed longer ago than this when prompts began isn't asked about: no backlog of old prompts. */
const PROMPT_LOOKBACK_MS = 2 * 86_400_000;
/** Someone who reviewed the same person this recently isn't asked again (weekly visits aren't a weekly prompt). */
const RECENT_REVIEW_MS = 30 * 86_400_000;
const DAY_MS = 86_400_000;

/** Who on a completed booking still has a review to write: none across a block, nor anyone who reviewed the other person lately. */
async function stillToReview(db: Db, booking: { id: string; posterUserId: string; helperUserId: string }, now: Date): Promise<string[]> {
  if (await isBlockedBetween(db, booking.posterUserId, booking.helperUserId)) return [];
  const out: string[] = [];
  for (const [author, subject] of [[booking.posterUserId, booking.helperUserId], [booking.helperUserId, booking.posterUserId]] as const) {
    const [written] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.authorUserId, author), eq(reviews.subjectUserId, subject), or(eq(reviews.bookingId, booking.id), gt(reviews.createdAt, new Date(now.getTime() - RECENT_REVIEW_MS)))))
      .limit(1);
    if (!written) out.push(author);
  }
  return out;
}

/**
 * Prompts to review (a job; sweep RV4, blueprint 02 J8: "Both are prompted after completion"). A booking just completed
 * (approved, or approved on its own) asks both people; `REVIEW_REMINDER_DAYS` before its 14 days end, whoever hasn't
 * reviewed yet is reminded once. Each goes out once per booking (a fixed event id), through the outbox to the bell and
 * email, in the person's language. Returns the events made.
 */
export async function sendReviewPrompts(db: Db, now: Date): Promise<number> {
  const steps = [
    { type: 'reviews.prompt', prefix: 'evt_review_prompt_', from: new Date(now.getTime() - PROMPT_LOOKBACK_MS), to: now },
    { type: 'reviews.reminder', prefix: 'evt_review_reminder_', from: new Date(now.getTime() - WINDOW_MS), to: new Date(now.getTime() - WINDOW_MS + REVIEW_REMINDER_DAYS * DAY_MS) },
  ] as const;
  let made = 0;
  for (const step of steps) {
    const due = await db
      .select({ id: bookings.id, posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId, completedAt: bookings.completedAt })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, 'completed'),
          gt(bookings.completedAt, step.from),
          lte(bookings.completedAt, step.to),
          sql`not exists (select 1 from ${outboxEvents} where ${outboxEvents.id} = ${step.prefix} || ${bookings.id})`,
        ),
      )
      .orderBy(asc(bookings.completedAt))
      .limit(200);
    for (const booking of due) {
      const userIds = await stillToReview(db, booking, now);
      // Whole days left in the window (at least 1), for "3 days left to review".
      const days = Math.max(1, Math.ceil((booking.completedAt!.getTime() + WINDOW_MS - now.getTime()) / DAY_MS));
      const inserted = await db
        .insert(outboxEvents)
        .values({ id: `${step.prefix}${booking.id}`, type: step.type, aggregateType: 'booking', aggregateId: booking.id, payload: { bookingId: booking.id, userIds, ...(step.type === 'reviews.reminder' ? { days } : {}) } })
        .onConflictDoNothing()
        .returning({ id: outboxEvents.id });
      made += inserted.length;
    }
  }
  return made;
}

async function bookingFor(db: Db, userId: string, bookingId: string) {
  const [row] = await db
    .select({ booking: bookings, title: tasks.title, categorySlug: categories.slug, categoryId: tasks.categoryId })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  const direction: ReviewDirection | null =
    row.booking.posterUserId === userId ? 'client_to_helper' : row.booking.helperUserId === userId ? 'helper_to_client' : null;
  return direction ? { ...row, direction } : null;
}

/** `/app/bookings/[bookingId]/review` for either person on the booking (null for anyone else). */
export async function getReviewPage(db: Db, userId: string, bookingId: string, now: Date): Promise<ReviewPageData | null> {
  await publishDueReviews(db, now);
  const found = await bookingFor(db, userId, String(bookingId));
  if (!found) return null;
  const subjectId = found.direction === 'client_to_helper' ? found.booking.helperUserId : found.booking.posterUserId;
  const [[subject], [mine], [theirs]] = await Promise.all([
    db.select().from(users).where(eq(users.id, subjectId)).limit(1),
    db.select().from(reviews).where(and(eq(reviews.bookingId, found.booking.id), eq(reviews.authorUserId, userId))).limit(1),
    db.select().from(reviews).where(and(eq(reviews.bookingId, found.booking.id), eq(reviews.authorUserId, subjectId))).limit(1),
  ]);
  if (!subject) return null;
  const completedAt = found.booking.completedAt;
  const publishesBy = new Date((completedAt ?? now).getTime() + WINDOW_MS);
  const unavailable = found.booking.status !== 'completed' ? 'not_completed' : !mine && now >= publishesBy ? 'window_closed' : undefined;
  // Theirs, readable once published (both are in, or the window ended: blueprint 02 J8) and not hidden (sweep RV2).
  const readable = theirs?.status === 'published' && theirs.publishedAt ? theirs : null;
  return {
    booking: { id: found.booking.id, title: found.title, categorySlug: found.categorySlug as ReviewPageData['booking']['categorySlug'], start: found.booking.startAt.toISOString() },
    direction: found.direction,
    subject: {
      id: subject.id,
      // The person under review whose account was deleted: the reader's "Deleted account" (J-PR15).
      ...shownPerson(subject, await deletedLabelFor([subject])),
      ...profilePhotoOf(subject),
      memberSince: subject.createdAt.toISOString(),
      phoneVerified: subject.phoneVerifiedAt !== null,
    },
    ...(mine
      ? {
          mine: {
            rating: mine.rating,
            tags: mine.tags,
            ...(mine.body ? { body: mine.body } : {}),
            submittedAt: mine.createdAt.toISOString(),
            ...(mine.publishedAt ? { publishedAt: mine.publishedAt.toISOString() } : {}),
          },
        }
      : {}),
    publishesBy: publishesBy.toISOString(),
    ...(unavailable ? { unavailable } : {}),
    ...(readable
      ? {
          theirs: {
            rating: readable.rating,
            tags: readable.tags,
            ...(readable.body ? { body: maskContactDetails(readable.body).text } : {}),
            publishedAt: readable.publishedAt!.toISOString(),
          },
        }
      : {}),
    ...(found.booking.status === 'completed' && completedAt && now >= publishesBy && !theirs ? { theirsMissing: true as const } : {}),
  };
}

/** Sends a review; when both are in, both become visible at once. Returns the helper whose rating changed. */
export async function submitReview(db: Db, userId: string, bookingId: string, input: ReviewInput, now: Date): Promise<{ result: ActionResult; ratedHelperId: string | null }> {
  const limited = await consumeRateLimit(db, `reviews:${userId}`, REVIEW_RATE_LIMIT, now);
  if (!limited.ok) return { result: { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() }, ratedHelperId: null };
  const found = await bookingFor(db, userId, String(bookingId));
  if (!found) return { result: { ok: false, code: 'not_found' }, ratedHelperId: null };
  const completedAt = found.booking.completedAt;
  if (found.booking.status !== 'completed' || !completedAt || now.getTime() >= completedAt.getTime() + WINDOW_MS) {
    return { result: { ok: false, code: 'not_allowed' }, ratedHelperId: null };
  }
  const parsed = createReviewInputSchema(found.direction).safeParse(input);
  if (!parsed.success) return { result: validationFailed(parsed.error), ratedHelperId: null };
  const subject = found.direction === 'client_to_helper' ? found.booking.helperUserId : found.booking.posterUserId;
  try {
    await db.insert(reviews).values({
      id: newId('rev'),
      bookingId: found.booking.id,
      authorUserId: userId,
      subjectUserId: subject,
      direction: found.direction,
      categoryId: found.categoryId,
      rating: parsed.data.rating,
      tags: parsed.data.tags,
      body: parsed.data.body || null,
      status: 'submitted',
      createdAt: now,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { result: { ok: false, code: 'not_allowed' }, ratedHelperId: null };
    throw error;
  }
  // Private feedback goes to support only (never to the other person).
  const feedback = parsed.data.privateFeedback?.trim();
  if (feedback) {
    const [person] = await db.select({ name: users.name }).from(users).where(eq(users.id, subject)).limit(1);
    await openReviewFeedbackCase(db, { userId, taskId: found.booking.taskId, taskTitle: found.title, rating: parsed.data.rating, subjectName: person?.name || 'the other person', feedback }, now);
  }
  const both = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.bookingId, found.booking.id));
  const rated = both.length >= 2 ? await publish(db, found.booking.id, now) : null;
  return { result: { ok: true, code: 'submitted', redirectTo: `/app/bookings/${encodeURIComponent(found.booking.id)}` }, ratedHelperId: rated };
}

/** The other person's review of the viewer on a booking, once it can be read (published, not hidden): the booking page (sweep RV2). */
export async function theirReviewOf(db: Db, userId: string, bookingId: string) {
  const [theirs] = await db
    .select({ rating: reviews.rating, publishedAt: reviews.publishedAt })
    .from(reviews)
    .where(and(eq(reviews.bookingId, bookingId), eq(reviews.subjectUserId, userId), eq(reviews.status, 'published')))
    .limit(1);
  return theirs?.publishedAt ? { rating: theirs.rating, publishedAt: theirs.publishedAt.toISOString() } : null;
}

/** The viewer's review on a booking, for the booking page. */
export async function myReviewOf(db: Db, userId: string, bookingId: string) {
  const [mine] = await db.select().from(reviews).where(and(eq(reviews.bookingId, bookingId), eq(reviews.authorUserId, userId))).limit(1);
  return mine
    ? { rating: mine.rating, submittedAt: mine.createdAt.toISOString(), ...(mine.publishedAt ? { publishedAt: mine.publishedAt.toISOString() } : {}) }
    : null;
}

// ---- Saved helpers ------------------------------------------------------------------------------------

export async function isHelperSaved(db: Db, userId: string, helperUserId: string): Promise<boolean> {
  const [row] = await db.select({ userId: savedHelpers.userId }).from(savedHelpers).where(and(eq(savedHelpers.userId, userId), eq(savedHelpers.helperUserId, helperUserId))).limit(1);
  return Boolean(row);
}

export async function setHelperSaved(db: Db, userId: string, helperUserId: string, saved: boolean, now: Date): Promise<ActionResult> {
  if (saved) {
    const summaries = await getHelperSummaries([helperUserId], db);
    if (!summaries.has(helperUserId) || helperUserId === userId) return { ok: false, code: 'not_found' };
    await db.insert(savedHelpers).values({ userId, helperUserId, createdAt: now }).onConflictDoNothing();
  } else {
    await db.delete(savedHelpers).where(and(eq(savedHelpers.userId, userId), eq(savedHelpers.helperUserId, helperUserId)));
  }
  return { ok: true, code: 'updated' };
}

/** `/app/saved`, most recently saved first. */
export async function getSavedHelpers(db: Db, userId: string): Promise<SavedHelpersPageData> {
  const rows = await db.select().from(savedHelpers).where(eq(savedHelpers.userId, userId)).orderBy(desc(savedHelpers.createdAt));
  const summaries = await getHelperSummaries(rows.map((row) => row.helperUserId), db);
  return { helpers: rows.flatMap((row) => (summaries.has(row.helperUserId) ? [summaries.get(row.helperUserId) as HelperSummary] : [])) };
}
