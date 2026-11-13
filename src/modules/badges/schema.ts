import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';

/**
 * Achievement badges (completion plan 6.4). One row per person, badge and scope (the category for
 * `category_pro`, '' otherwise), holding the tier reached now. Rows are recomputed from bookings, reviews and
 * verification (src/modules/badges/service.ts); `tier_earned_at` is when the current tier was first reached.
 * Staff can revoke one with a reason: a revoked badge isn't shown or recomputed until staff restore it.
 */
export const userBadges = pgTable(
  'user_badges',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull(), // BADGE_CODES
    scope: text('scope').notNull().default(''),
    /** 0 once nothing counts for it any more (a refund, say); the row stays so a later rise is announced again. */
    tier: integer('tier').notNull(),
    tierEarnedAt: timestamp('tier_earned_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: text('revoked_by_user_id').references(() => users.id),
    revokedReason: text('revoked_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_badges_person_badge_idx').on(t.userId, t.code, t.scope), index('user_badges_user_idx').on(t.userId)],
);
