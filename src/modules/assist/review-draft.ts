import { reviewDraftInputSchema, reviewTagsFor, type AiAssistResult, type AppLocale, type ReviewDraft } from '@/contracts';
import type { ReviewWriter } from '@/integrations/ai/review-writer';
import { getReviewPage } from '@/modules/reviews/service';
import { findProhibitedPhrase, maskContactDetails } from '@/modules/trust/contact-masking';
import { GLOBAL_PROHIBITED_PHRASES } from '@/modules/trust/prohibited';
import type { Db } from '@/platform/db/connect';
import { aiDraftingFlag } from './availability';
import { asAiResult, invalidInput, NOT_FOUND, overLimit, prohibitedOn, UNAVAILABLE } from './ai-run';

/**
 * "Write it with AI" on the review form (2026-11-24; src/contracts/ai-assist.ts): the booking, the person reviewed and
 * the direction come from the database (the review page as this person sees it), never from the browser; the stars,
 * tags and their own words from the form. Only while they can still review it. Saves nothing.
 */

/** Drafts per person an hour (each one is a model call on a free allowance). */
export const REVIEW_DRAFT_RULE = { limit: 20, windowSeconds: 60 * 60 };
/** The review form's limit. */
const REVIEW_BODY_MAX = 1_000;

const clean = (text: string) => maskContactDetails(text).text;

export async function draftReview(
  { db, writer, now }: { db: Db; writer: ReviewWriter | null; now: Date },
  userId: string,
  bookingId: string,
  input: unknown,
  locale: AppLocale,
): Promise<AiAssistResult<ReviewDraft>> {
  if (!writer || !(await aiDraftingFlag(db, userId))) return UNAVAILABLE;
  const parsed = reviewDraftInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const page = await getReviewPage(db, userId, String(bookingId), now);
  if (!page) return NOT_FOUND;
  // Sent already, or the window closed: there's nothing to write.
  if (page.mine || page.unavailable) return { ok: false, code: 'not_allowed' };
  const { rating, notes } = parsed.data;
  if (findProhibitedPhrase(notes, GLOBAL_PROHIBITED_PHRASES)) return prohibitedOn('body');
  const allowed = new Set(reviewTagsFor(page.direction));
  const tags = parsed.data.tags.filter((tag) => allowed.has(tag));
  const limited = await overLimit(db, `assist:review:${userId}`, REVIEW_DRAFT_RULE, now);
  if (limited) return limited;
  return asAiResult('assist-review', 'body', async () => {
    const body = await writer.draft({
      direction: page.direction,
      // "Jordan K." → "Jordan"; nobody for a deleted account.
      subjectFirstName: page.subject.deleted ? '' : (page.subject.displayName.split(/\s+/)[0] ?? ''),
      task: { title: page.booking.title, categorySlug: page.booking.categorySlug },
      rating,
      tags,
      notes: clean(notes),
      locale,
    });
    return { body: clean(body).slice(0, REVIEW_BODY_MAX).trim() };
  });
}
