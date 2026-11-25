import { z } from 'zod';
import type { FieldErrorCode, QueryHandler } from './actions';
import { CATEGORY_SLUGS, type Cents, type ISODateTime } from './common';
import { COMMUNITY_BODY_MAX, COMMUNITY_POST_KINDS, COMMUNITY_TITLE_MAX } from './community';
import type { AppLocale } from './locale';
import { TASK_DESCRIPTION_MAX, TASK_TITLE_MAX } from './posting';

/**
 * AI help across the app (2026-11-24, owner: "implement all ai feature to all possible features that can do what
 * something special with ai"; docs/automation/ai-plan-2026-11-24.md). Every request runs on the free models through the
 * load balancer, with people's words masked first; the answer is plain text the app tidies and masks again. Drafts land
 * in a field the person edits and sends themselves, said to be "with AI"; nothing is sent, saved or posted for them.
 * With AI off for the market (`ai_drafting`) or not set up here, the controls aren't offered.
 */

const code = (value: FieldErrorCode) => value;

/**
 * What an AI request answers, in `ActionResult`'s shape: `drafted` with the value, or why not. Words the app won't help
 * with (the prohibited-tasks list, or a model's refusal) are `validation_failed` with `prohibited` on the field.
 * `unavailable`: AI is off, not set up, or didn't answer (try again or write it yourself).
 */
export type AiAssistResult<T> =
  | { ok: true; code: 'drafted'; value: T }
  | { ok: false; code: 'validation_failed'; fieldErrors: Partial<Record<string, FieldErrorCode[]>> }
  | { ok: false; code: 'rate_limited'; retryAt?: ISODateTime }
  | { ok: false; code: 'unavailable' | 'not_found' | 'not_allowed' };

/** How an AI result reads on a screen: drafted, or which of the three messages to show. */
export type AiAssistOutcome = 'drafted' | 'unavailable' | 'rate_limited' | 'prohibited';

export function aiAssistOutcome(result: AiAssistResult<unknown>): AiAssistOutcome {
  if (result.ok) return 'drafted';
  if (result.code === 'rate_limited') return 'rate_limited';
  if (result.code === 'validation_failed' && Object.values(result.fieldErrors).some((codes) => codes?.includes('prohibited'))) return 'prohibited';
  return 'unavailable';
}

// ---- Reviews: "Write it with AI" on the review form, both directions ------------------------------------------------

export const REVIEW_DRAFT_NOTES_MAX = 600;

/** The stars, the chosen tags and what the reviewer typed so far (their words, kept). */
export const reviewDraftInputSchema = z.object({
  rating: z.number(code('required')).int(code('required')).min(1, code('required')).max(5, code('out_of_range')),
  tags: z.array(z.string()).max(5, code('too_long')),
  notes: z.string().trim().max(REVIEW_DRAFT_NOTES_MAX, code('too_long')),
});
export type ReviewDraftInput = z.input<typeof reviewDraftInputSchema>;

export interface ReviewDraft {
  /** The review's words, at most the form's 1,000 characters. */
  body: string;
}

// ---- Profiles: "What neighbors say" ---------------------------------------------------------------------------------

/** A summary needs at least this many published client reviews with words. */
export const REVIEW_SUMMARY_MIN_REVIEWS = 3;
export const REVIEW_SUMMARY_POINTS_MAX = 4;

/**
 * A few short points from a helper's published client reviews, made by the job runner whenever the reviews change
 * (never while the page loads), in both languages: the page shows its own. Only what reviewers wrote; no names.
 */
export interface ReviewSummaryView {
  points: Record<AppLocale, string[]>;
  /** The reviews it was made from. */
  reviewCount: number;
  updatedAt: ISODateTime;
}

// ---- Bookings: "Get ready" ------------------------------------------------------------------------------------------

export const BOOKING_CHECKLIST_ITEMS_MAX = 6;

/** A booking's checklist for one of its two people, in their language. */
export interface BookingChecklist {
  items: string[];
  madeAt: ISODateTime;
}

/**
 * "Get ready" on a booking that hasn't happened yet (pending payment, scheduled, confirmed, in progress): present when AI
 * is on for the viewer. `checklist` once they made one; `stale` when the booking changed since (its scope, time or
 * details), so the screen offers a fresh one beside the old.
 */
export interface BookingPrepView {
  checklist?: BookingChecklist;
  stale?: true;
}

/** "Make my checklist" (bound to the booking by the page). Saves the checklist for this person; sends nothing. */
export interface BookingPrepHandlers {
  onPrepare: QueryHandler<Record<string, never>, AiAssistResult<BookingChecklist>>;
}

// ---- Posting: "Check my price with AI" ------------------------------------------------------------------------------

/** What the budget step knows so far. The app reads the market's own prices; nothing here is trusted for money. */
export const priceCheckInputSchema = z.object({
  categorySlug: z.enum(CATEGORY_SLUGS, code('required')),
  title: z.string().trim().max(TASK_TITLE_MAX, code('too_long')),
  description: z.string(code('required')).trim().min(10, code('too_short')).max(TASK_DESCRIPTION_MAX, code('too_long')),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  budget: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('fixed'), priceCents: z.number().int().optional() }),
      z.object({ type: z.literal('hourly'), rateCents: z.number().int().optional(), estimatedHours: z.number().optional() }),
    ])
    .optional(),
});
export type PriceCheckInput = z.input<typeof priceCheckInputSchema>;

/** Where a budget sits against the range. */
export const PRICE_VERDICTS = ['below', 'within', 'above'] as const;
export type PriceVerdict = (typeof PRICE_VERDICTS)[number];

/**
 * A fair price for this task. AI sizes the job (how many items or hours, and whether it's light or heavy work) and says
 * why; the range is the market's published price guide at that size, never a number a model wrote. `recent`: completed
 * bookings in this service and city in the last six months, when there are enough to say.
 */
export interface PriceCheck {
  unit: 'item' | 'hour' | 'task';
  /** The size AI read: items or hours (1 for a task). */
  units: number;
  lowCents: Cents;
  highCents: Cents;
  /** The budget typed so far against the range; absent without one. */
  verdict?: PriceVerdict;
  /** The total the verdict compared (a fixed price, or the rate times the hours). */
  budgetCents?: Cents;
  /** One to three short reasons, in the person's language. */
  reasons: string[];
  recent?: { count: number; lowCents: Cents; highCents: Cents };
}

// ---- Neighbors: "Make it clearer" and "Draft an answer" ------------------------------------------------------------

export const communityPolishInputSchema = z.object({
  kind: z.enum(COMMUNITY_POST_KINDS, code('required')),
  title: z.string().trim().max(COMMUNITY_TITLE_MAX, code('too_long')).optional(),
  body: z.string().trim().max(COMMUNITY_BODY_MAX, code('too_long')),
  categorySlug: z.enum(CATEGORY_SLUGS).optional(),
});
export type CommunityPolishInput = z.input<typeof communityPolishInputSchema>;

/** The post's title (not for a general post, which has none) and words, clearer. */
export interface CommunityPolish {
  title?: string;
  body: string;
}

export const COMMUNITY_ANSWER_NOTES_MAX = 300;

export const communityAnswerDraftInputSchema = z.object({
  /** What the helper typed in the reply so far: kept as their own words. */
  notes: z.string().trim().max(COMMUNITY_ANSWER_NOTES_MAX, code('too_long')),
});
export type CommunityAnswerDraftInput = z.input<typeof communityAnswerDraftInputSchema>;

export interface CommunityAnswerDraft {
  body: string;
}

// ---- Staff: "Summarize with AI" on a case ---------------------------------------------------------------------------

/** What happened and where it stands, from what the case page shows (never the restricted conversation). English. */
export interface AdminCaseSummary {
  points: string[];
  /** What's still open: who's waiting on whom, what's undecided. */
  open: string[];
}
