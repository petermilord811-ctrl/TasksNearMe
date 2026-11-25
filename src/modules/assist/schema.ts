import { index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * What AI made that the app shows again (2026-11-24, docs/automation/ai-plan-2026-11-24.md), so a page never waits for
 * a model and a model isn't asked twice for the same thing:
 * - `review_summary`: a helper's "What neighbors say" (`subject_id` the helper's user id; `content` the points in both
 *   languages), made by the job runner when their published client reviews change.
 * - `booking_prep`: one person's "Get ready" checklist for a booking (`subject_id` the booking; `variant` poster or
 *   helper; `locale` en or es), made when they ask.
 * `input_hash` is a hash of what it was made from: when the source changes, the row is stale (made again by the job, or
 * offered again on the page). Nothing here is a source of truth; rows can be deleted at any time.
 */
export const aiResults = pgTable(
  'ai_results',
  {
    kind: text('kind').notNull(), // review_summary | booking_prep
    subjectId: text('subject_id').notNull(),
    variant: text('variant').notNull().default(''),
    locale: text('locale').notNull().default(''),
    inputHash: text('input_hash').notNull(),
    content: jsonb('content').$type<unknown>().notNull(),
    /** Which model answered ("gemini:…", "stand-in"), for staff questions about a result. */
    model: text('model').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.subjectId, t.variant, t.locale] }), index('ai_results_created_idx').on(t.kind, t.createdAt)],
);
