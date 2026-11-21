import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '../accounts/schema';

/**
 * Sparks (owner, 2026-11-21; decisions.md). Earned Sparks are counted from what people did (community posts,
 * reactions, bookings, reviews), so nothing is stored for them; bought ones are these rows. A purchase counts once
 * Stripe says it's paid (its webhook, or the checkout read back on the return), never on the browser's word.
 */
export const sparkPurchases = pgTable(
  'spark_purchases',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** small | medium | large (`SPARK_PACKS`) */
    pack: text('pack').notNull(),
    points: integer('points').notNull(),
    amountCents: integer('amount_cents').notNull(),
    /** stripe | dev */
    provider: text('provider').notNull(),
    /** The Checkout Session; null until it's made. */
    providerSessionId: text('provider_session_id'),
    /** pending | paid | refunded */
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
  },
  (t) => [
    index('spark_purchases_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('spark_purchases_session_idx').on(t.provider, t.providerSessionId).where(sql`provider_session_id is not null`),
  ],
);
