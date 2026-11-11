import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/** People outside our markets who asked to hear when we open near them (`/waitlist`). */
export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    zip: text('zip').notNull(),
    interest: text('interest').notNull(), // need_help | give_help | both
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('waitlist_entries_email_idx').on(t.email)],
);
