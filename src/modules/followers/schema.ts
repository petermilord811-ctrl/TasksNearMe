import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';
import { bookings } from '../bookings/schema';

/**
 * Family followers (2026-11-24, owner's chat ideas): a booking's client lets an existing account follow it, read-only
 * (src/contracts/followers.ts). One row per time someone follows; `ended_at` closes it when the client removes them
 * (`ended_by` 'client') or they leave ('follower'). A booking that's canceled, or done more than 7 days ago, ends
 * following without a write (followers/domain.ts `followOpen`). At most 2 open rows a booking, checked with the booking
 * row locked. Followers are never thread participants: every check meant for the booking's two people stays theirs.
 */
export const bookingFollowers = pgTable(
  'booking_followers',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id),
    followerUserId: text('follower_user_id')
      .notNull()
      .references(() => users.id),
    addedByUserId: text('added_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endedBy: text('ended_by'), // client | follower
  },
  (t) => [
    uniqueIndex('booking_followers_open_idx').on(t.bookingId, t.followerUserId).where(sql`ended_at is null`),
    index('booking_followers_follower_idx').on(t.followerUserId, t.endedAt),
  ],
);
