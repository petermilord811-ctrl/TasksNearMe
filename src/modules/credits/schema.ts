import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';

/**
 * Credits for clients (blueprint 01 P2, 05 §3 "poster credits"): platform-funded money back on a booking.
 * A credit is used when a booking is completed: up to what the platform earned on it, refunded to the
 * card the client paid with, so the helper is always paid in full. Unused credit expires.
 */
export const posterCredits = pgTable(
  'poster_credits',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** welcome | goodwill */
    kind: text('kind').notNull(),
    amountCents: integer('amount_cents').notNull(),
    remainingCents: integer('remaining_cents').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Staff who gave a goodwill credit. */
    grantedByUserId: text('granted_by_user_id').references(() => users.id),
    note: text('note').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('poster_credits_user_idx').on(t.userId, t.expiresAt), uniqueIndex('poster_credits_one_welcome_idx').on(t.userId).where(sql`kind = 'welcome'`)],
);

/** What each credit paid toward which booking (one row per credit and booking), with the refund that carried it. */
export const creditRedemptions = pgTable(
  'credit_redemptions',
  {
    id: text('id').primaryKey(),
    creditId: text('credit_id')
      .notNull()
      .references(() => posterCredits.id, { onDelete: 'cascade' }),
    bookingId: text('booking_id').notNull(),
    refundId: text('refund_id'),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('credit_redemptions_credit_booking_idx').on(t.creditId, t.bookingId), index('credit_redemptions_booking_idx').on(t.bookingId)],
);
