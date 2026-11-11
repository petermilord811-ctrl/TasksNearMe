import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';

/**
 * Gift-card reward grants (blueprint 05; 08 §3 rewards). Derived from booking facts by
 * `syncRewards`, so they can be recomputed at any time. The partial unique indexes enforce the
 * stacking rules: one live welcome reward per helper, one live repeat reward per helper and client,
 * and at most one live booking-level reward per booking. A voided grant frees the slot again.
 */
export const rewardGrants = pgTable(
  'reward_grants',
  {
    id: text('id').primaryKey(),
    helperUserId: text('helper_user_id')
      .notNull()
      .references(() => users.id),
    program: text('program').notNull(), // welcome | acceptance | repeat | completion
    /** The rules version it was earned under. */
    programVersion: integer('program_version').notNull().default(1),
    amountCents: integer('amount_cents').notNull(),
    status: text('status').notNull(), // REWARD_STATUSES
    bookingId: text('booking_id'),
    /** Repeat rewards: the client. */
    posterUserId: text('poster_user_id').references(() => users.id),
    holdUntil: timestamp('hold_until', { withTimezone: true }),
    redeemableAt: timestamp('redeemable_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    providerOrderId: text('provider_order_id'),
    deliveryUrl: text('delivery_url'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reward_grants_helper_idx').on(t.helperUserId, t.createdAt),
    uniqueIndex('reward_grants_welcome_idx').on(t.helperUserId).where(sql`program = 'welcome' and status <> 'voided'`),
    uniqueIndex('reward_grants_repeat_idx').on(t.helperUserId, t.posterUserId).where(sql`program = 'repeat' and status <> 'voided'`),
    uniqueIndex('reward_grants_booking_level_idx').on(t.bookingId).where(sql`program in ('welcome', 'acceptance', 'completion') and status <> 'voided'`),
  ],
);
