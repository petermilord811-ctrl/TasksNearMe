import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { CategorySlug, ISODateTime } from './common';
import type { HelperSummary, PersonSummary } from './people';
import { HELPER_REVIEW_TAGS } from './profiles';

/**
 * Reviews after a completed booking (blueprint 02 J8): two-way and double-blind. Each review becomes
 * visible when both people have submitted, or 14 days after completion. 1–5 stars, tags, optional text.
 * Plus the client's saved helpers.
 */

const code = (value: FieldErrorCode) => value;

/** Tags a helper can give a client. */
export const CLIENT_REVIEW_TAGS = ['clear_instructions', 'ready_on_time', 'easy_access', 'friendly', 'respectful', 'quick_to_reply'] as const;
export type ClientReviewTag = (typeof CLIENT_REVIEW_TAGS)[number];

export type ReviewDirection = 'client_to_helper' | 'helper_to_client';

/** The form's tags by direction: the client reviews the helper; the helper reviews the client. */
export function reviewTagsFor(direction: ReviewDirection): readonly string[] {
  return direction === 'client_to_helper' ? HELPER_REVIEW_TAGS : CLIENT_REVIEW_TAGS;
}

export function createReviewInputSchema(direction: ReviewDirection) {
  const tags = reviewTagsFor(direction) as readonly [string, ...string[]];
  return z.object({
    rating: z.number(code('required')).int(code('required')).min(1, code('required')).max(5, code('out_of_range')),
    tags: z.array(z.enum(tags, code('invalid'))).max(5, code('too_long')),
    body: z.string(code('required')).trim().max(1000, code('too_long')),
  });
}
export type ReviewInput = z.input<ReturnType<typeof createReviewInputSchema>>;

/** Why the review form can't be used. */
export const REVIEW_UNAVAILABLE_REASONS = [
  /** The booking isn't completed. */
  'not_completed',
  /** The 14-day window ended. */
  'window_closed',
] as const;
export type ReviewUnavailableReason = (typeof REVIEW_UNAVAILABLE_REASONS)[number];

/** `/app/bookings/[bookingId]/review`. */
export interface ReviewPageData {
  booking: { id: string; title: string; categorySlug: CategorySlug; start: ISODateTime };
  direction: ReviewDirection;
  /** Who is being reviewed. */
  subject: PersonSummary;
  /** Already sent: shown read-only with when it becomes visible. */
  mine?: { rating: number; tags: string[]; body?: string; submittedAt: ISODateTime; publishedAt?: ISODateTime };
  /** Both reviews become visible at the latest then (14 days after completion). */
  publishesBy: ISODateTime;
  unavailable?: ReviewUnavailableReason;
}

/**
 * - `onSubmit`: ok `submitted` with `redirectTo` (the booking). Errors: `validation_failed` (`rating`, `tags`, `body`),
 *   `not_allowed` (already reviewed, or the window ended), `rate_limited`, `unknown`.
 */
export interface ReviewHandlers {
  onSubmit: ActionHandler<ReviewInput>;
}

/** `/app/saved`: the client's saved helpers, most recently saved first. */
export interface SavedHelpersPageData {
  helpers: HelperSummary[];
}

/**
 * - `onToggleSaved`: save or remove a helper. ok `updated`. Errors: `not_found`, `unknown`.
 */
export interface SavedHelperHandlers {
  onToggleSaved: ActionHandler<{ helperId: string; saved: boolean }>;
}
