import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';

/**
 * Support cases (docs/blueprint/03 §9). Started with disputes: a client reporting a problem opens one.
 * `booking_id` is a plain column so support doesn't depend on bookings.
 */
export const supportCases = pgTable(
  'support_cases',
  {
    id: text('id').primaryKey(),
    /** dispute | no_show | cancellation_review | report_user | report_content | safety | payment_issue | reward_issue | account */
    type: text('type').notNull(),
    /** open | waiting_on_user | waiting_on_other_party | resolved | closed */
    status: text('status').notNull(),
    priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
    bookingId: text('booking_id'),
    openedByUserId: text('opened_by_user_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason'),
    description: text('description').notNull().default(''),
    /** Photos sent with the case (files of kind `evidence`). */
    fileIds: jsonb('file_ids').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('support_cases_booking_idx').on(t.bookingId), index('support_cases_status_idx').on(t.status, t.createdAt)],
);
