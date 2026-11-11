import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';
import { categories } from '../markets/schema';

/**
 * Two-way, double-blind reviews (docs/blueprint/02 J7, 08 §3). Each becomes visible when both are
 * submitted or after 14 days. `booking_id` references bookings once that module exists; seeded
 * reviews (development data) have none.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id'),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => users.id),
    subjectUserId: text('subject_user_id')
      .notNull()
      .references(() => users.id),
    direction: text('direction').notNull(), // client_to_helper | helper_to_client
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    rating: integer('rating').notNull(), // 1-5
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    body: text('body'),
    status: text('status').notNull(), // submitted | published | hidden
    publishedAt: timestamp('published_at', { withTimezone: true }),
    hiddenReason: text('hidden_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reviews_subject_idx').on(t.subjectUserId, t.status, t.publishedAt),
    // One review per author per booking (NULL booking ids don't collide).
    uniqueIndex('reviews_booking_author_idx').on(t.bookingId, t.authorUserId),
  ],
);

/** Helpers a client saved to book again (blueprint 02 J8). */
export const savedHelpers = pgTable(
  'saved_helpers',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    helperUserId: text('helper_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.helperUserId] })],
);
