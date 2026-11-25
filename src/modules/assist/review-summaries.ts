import { and, eq, inArray, sql } from 'drizzle-orm';
import { APP_LOCALES, REVIEW_SUMMARY_MIN_REVIEWS, type AppLocale, type ReviewSummaryView } from '@/contracts';
import type { Db } from '@/platform/db/connect';
import { GENERATED_ID_PATTERN, type RowScope } from '@/shared/sample-data';
import { aiDraftingFlag } from './availability';
import { aiResults } from './schema';

/**
 * "What neighbors say" (2026-11-24): which helpers have a summary to show and whether it's current. A summary is made
 * from a helper's published client reviews with words (at least `REVIEW_SUMMARY_MIN_REVIEWS`), by the job runner
 * (`review-summaries-job.ts`), with the public's rows (the demo marketplace's reviews left out where the public doesn't
 * see them). It's shown only while it still matches those reviews: a review hidden or published since makes it stale
 * until the job makes it again, a minute or so later, so a hidden review's words never linger.
 */

export const REVIEW_SUMMARY_KIND = 'review_summary';

/** The stored points, as the job writes them. */
export type StoredReviewSummary = { points: Record<AppLocale, string[]>; reviewCount: number };

/**
 * The reviews a summary is made from, per helper: how many, and a hash of what they say (each review's id, stars, tags
 * and words), for helpers with enough of them. `rows` is the public's scope.
 */
export async function reviewSets(db: Pick<Db, 'execute'>, rows: RowScope, helperIds?: readonly string[]): Promise<Map<string, { count: number; hash: string }>> {
  if (helperIds && helperIds.length === 0) return new Map();
  const result = await db.execute(sql`
    select subject_user_id as "helperId", count(*)::int as "count",
           md5(string_agg(id || ':' || rating || ':' || tags::text || ':' || md5(body), ',' order by id)) as "hash"
    from reviews
    where status = 'published' and direction = 'client_to_helper' and body is not null and length(btrim(body)) > 0
      ${rows === 'real' ? sql`and author_user_id ~ ${GENERATED_ID_PATTERN}` : sql``}
      ${helperIds ? sql`and subject_user_id in (${sql.join(helperIds.map((id) => sql`${id}`), sql`, `)})` : sql``}
    group by subject_user_id
    having count(*) >= ${REVIEW_SUMMARY_MIN_REVIEWS}`);
  return new Map((result.rows as { helperId: string; count: number; hash: string }[]).map((row) => [row.helperId, { count: row.count, hash: row.hash }]));
}

function isStored(content: unknown): content is StoredReviewSummary {
  const value = content as Partial<StoredReviewSummary> | null;
  return Boolean(value && typeof value.reviewCount === 'number' && value.points && APP_LOCALES.every((locale) => Array.isArray(value.points?.[locale]) && value.points[locale].every((point) => typeof point === 'string')));
}

/** A helper's summary for their public profile: current, with AI on for their market; absent otherwise. */
export async function reviewSummaryOf(db: Db, helperId: string, rows: RowScope): Promise<ReviewSummaryView | undefined> {
  const [stored] = await db
    .select({ inputHash: aiResults.inputHash, content: aiResults.content, createdAt: aiResults.createdAt })
    .from(aiResults)
    .where(and(eq(aiResults.kind, REVIEW_SUMMARY_KIND), eq(aiResults.subjectId, helperId), eq(aiResults.variant, ''), eq(aiResults.locale, '')))
    .limit(1);
  if (!stored || !isStored(stored.content)) return undefined;
  const current = (await reviewSets(db, rows, [helperId])).get(helperId);
  if (!current || current.hash !== stored.inputHash) return undefined;
  if (!(await aiDraftingFlag(db, helperId))) return undefined;
  return { points: stored.content.points, reviewCount: stored.content.reviewCount, updatedAt: stored.createdAt.toISOString() };
}

/** Summaries of helpers who no longer have enough reviews with words (hidden, or their account gone): removed. */
export async function dropUnbackedSummaries(db: Db, rows: RowScope): Promise<number> {
  const backed = await reviewSets(db, rows);
  const stored = await db.select({ subjectId: aiResults.subjectId }).from(aiResults).where(eq(aiResults.kind, REVIEW_SUMMARY_KIND));
  const gone = stored.map((row) => row.subjectId).filter((id) => !backed.has(id));
  if (gone.length === 0) return 0;
  await db.delete(aiResults).where(and(eq(aiResults.kind, REVIEW_SUMMARY_KIND), inArray(aiResults.subjectId, gone)));
  return gone.length;
}
