import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';
import { bookings } from '../bookings/schema';

/**
 * Thank-you notes (2026-11-24, owner's list): after a booking completes, its client may send the helper a short note,
 * one per booking (`booking_id` is unique), editable for 24 hours and deletable at any time (the row goes). Apart from
 * reviews and ratings: nothing in rewards, Sparks or ranking reads this table (blueprint 05, principle 6).
 * - `hide_name`: the client's "Don't show my name": a shown note reads "A client in {area}".
 * - `shown_on_profile`: the helper's consent to show it on their public profile (newest 6), revocable; off at first.
 * - `hidden_at`: staff hid it from a report's case (with who and why, also in the audit log): off the profile, and
 *   the helper's card no longer shows its words.
 * The body is stored as written; every reader but its author gets it with contact details masked.
 */
export const thankYouNotes = pgTable(
  'thank_you_notes',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => users.id),
    helperUserId: text('helper_user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    hideName: boolean('hide_name').notNull().default(false),
    shownOnProfile: boolean('shown_on_profile').notNull().default(false),
    shownAt: timestamp('shown_at', { withTimezone: true }),
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    hiddenByUserId: text('hidden_by_user_id'),
    hiddenReason: text('hidden_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('thank_you_notes_booking_idx').on(t.bookingId), index('thank_you_notes_helper_idx').on(t.helperUserId, t.createdAt)],
);
