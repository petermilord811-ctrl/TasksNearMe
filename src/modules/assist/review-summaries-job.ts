import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { CATEGORY_SLUGS, type CategorySlug } from '@/contracts';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import { createReviewSummarizer, type ReviewSummarizer } from '@/integrations/ai/review-summarizer';
import { users } from '@/modules/accounts/schema';
import { categories } from '@/modules/markets/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { reviews } from '@/modules/reviews/schema';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import { expireCacheTags } from '@/platform/cache/expire';
import type { Db } from '@/platform/db/connect';
import { realRowsOnly, searchEngineRows, type RowScope } from '@/shared/sample-data';
import { aiDraftingFlag } from './availability';
import { dropUnbackedSummaries, REVIEW_SUMMARY_KIND, reviewSets, type StoredReviewSummary } from './review-summaries';
import { aiResults } from './schema';

/**
 * The job that keeps "What neighbors say" current (2026-11-24): every minute it finds helpers whose published client
 * reviews changed since their summary was made (or who have none yet), oldest first, and makes up to `PER_RUN` of them
 * with AI, in the background, so the runner's other jobs never wait on a model. A helper whose summary failed waits
 * half an hour before the next try. It also drops summaries no longer backed by enough reviews, and "Get ready"
 * checklists of bookings long past.
 */

/** Summaries made per run, one after another. */
export const PER_RUN = 3;
/** The newest reviews a summary reads. */
export const REVIEWS_READ = 30;
/** After a failure, a helper waits this long. */
const RETRY_AFTER_MS = 30 * 60_000;
/** Checklists are kept this long after they were made (bookings are done by then). */
const CHECKLIST_DAYS = 45;

/** Per process: who failed and until when, and whether a run is going (so two never overlap). */
const STATE = Symbol.for('tasksnearme.assist.reviewSummaries');
function processState(): { failedUntil: Map<string, number>; running: boolean } {
  const holder = globalThis as typeof globalThis & { [STATE]?: { failedUntil: Map<string, number>; running: boolean } };
  return (holder[STATE] ??= { failedUntil: new Map(), running: false });
}

export interface ReviewSummaryRun {
  made: string[];
  failed: string[];
  dropped: number;
}

/**
 * One run, awaited (tests call it directly). `rows`: the public's scope (`searchEngineRows()`), so the demo marketplace's
 * reviews never reach a real helper's summary where the public doesn't see them.
 */
export async function refreshReviewSummaries(
  db: Db,
  summarizer: ReviewSummarizer | null,
  now: Date,
  { rows = searchEngineRows(), limit = PER_RUN, state = processState() }: { rows?: RowScope; limit?: number; state?: { failedUntil: Map<string, number> } } = {},
): Promise<ReviewSummaryRun> {
  const run: ReviewSummaryRun = { made: [], failed: [], dropped: await dropUnbackedSummaries(db, rows) };
  await db.delete(aiResults).where(and(eq(aiResults.kind, 'booking_prep'), lt(aiResults.createdAt, new Date(now.getTime() - CHECKLIST_DAYS * 86_400_000))));
  if (!summarizer) return run;

  const sets = await reviewSets(db, rows);
  if (sets.size === 0) return run;
  const stored = await db
    .select({ subjectId: aiResults.subjectId, inputHash: aiResults.inputHash })
    .from(aiResults)
    .where(and(eq(aiResults.kind, REVIEW_SUMMARY_KIND), inArray(aiResults.subjectId, [...sets.keys()])));
  const current = new Map(stored.map((row) => [row.subjectId, row.inputHash]));
  const due = [...sets.entries()]
    .filter(([helperId, set]) => current.get(helperId) !== set.hash && (state.failedUntil.get(helperId) ?? 0) <= now.getTime())
    .map(([helperId]) => helperId);

  for (const helperId of due) {
    if (run.made.length + run.failed.length >= limit) break;
    // AI off for their market: no summary (the page shows none either).
    if (!(await aiDraftingFlag(db, helperId))) continue;
    const set = sets.get(helperId)!;
    try {
      await summarizeOne(db, summarizer, helperId, set, rows, now);
      state.failedUntil.delete(helperId);
      run.made.push(helperId);
    } catch (error) {
      state.failedUntil.set(helperId, now.getTime() + RETRY_AFTER_MS);
      run.failed.push(helperId);
      if (!(error instanceof AiUnavailableError) && !(error instanceof AiRefusedError)) console.error('[assist] a review summary failed', error instanceof Error ? error.message : error);
    }
  }
  return run;
}

async function summarizeOne(db: Db, summarizer: ReviewSummarizer, helperId: string, set: { count: number; hash: string }, rows: RowScope, now: Date): Promise<void> {
  const [helper] = await db
    .select({ firstName: users.firstName, handle: helperProfiles.handle })
    .from(users)
    .leftJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .where(eq(users.id, helperId))
    .limit(1);
  if (!helper) return;
  const found = await db
    .select({ rating: reviews.rating, tags: reviews.tags, body: reviews.body, categorySlug: categories.slug })
    .from(reviews)
    .innerJoin(categories, eq(categories.id, reviews.categoryId))
    .where(and(
      eq(reviews.subjectUserId, helperId),
      eq(reviews.direction, 'client_to_helper'),
      eq(reviews.status, 'published'),
      sql`${reviews.body} is not null and length(btrim(${reviews.body})) > 0`,
      ...(rows === 'real' ? [realRowsOnly(reviews.authorUserId)] : []),
    ))
    .orderBy(desc(reviews.publishedAt))
    .limit(REVIEWS_READ);
  const points = await summarizer.summarize({
    helperFirstName: helper.firstName,
    reviews: found
      .filter((review): review is typeof review & { body: string; categorySlug: CategorySlug } => Boolean(review.body) && (CATEGORY_SLUGS as readonly string[]).includes(review.categorySlug))
      .map((review) => ({ rating: review.rating, tags: review.tags, body: review.body, categorySlug: review.categorySlug })),
  });
  // A model's words: masked again before they're kept, whatever the summarizer did.
  const clean = (lines: string[]) => lines.map((line) => maskContactDetails(line).text);
  const content: StoredReviewSummary = { points: { en: clean(points.en), es: clean(points.es) }, reviewCount: set.count };
  await db
    .insert(aiResults)
    .values({ kind: REVIEW_SUMMARY_KIND, subjectId: helperId, variant: '', locale: '', inputHash: set.hash, content, model: summarizer.name, createdAt: now })
    .onConflictDoUpdate({ target: [aiResults.kind, aiResults.subjectId, aiResults.variant, aiResults.locale], set: { inputHash: set.hash, content, model: summarizer.name, createdAt: now } });
  // Their public profile is cached for minutes: the next visit reads it again.
  if (helper.handle) await expireCacheTags(db, [`helper:${helper.handle}`]);
}

/**
 * The job runner's entry (`assist.review_summaries`): starts a run in the background and returns at once; a run still
 * going makes this one a no-op. Summaries come from the free models (the stand-in in development and the e2e build).
 */
let processSummarizer: ReviewSummarizer | null | undefined;

export function startReviewSummaries(db: Db, now: Date, summarizer: ReviewSummarizer | null = (processSummarizer === undefined ? (processSummarizer = createReviewSummarizer()) : processSummarizer)): void {
  const state = processState();
  if (state.running) return;
  state.running = true;
  void refreshReviewSummaries(db, summarizer, now, { state })
    .catch((error: unknown) => console.error('[assist] review summaries failed', error instanceof Error ? error.message : error))
    .finally(() => {
      state.running = false;
    });
}
