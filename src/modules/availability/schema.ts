import { doublePrecision, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';
import { categories, markets } from '../markets/schema';

/**
 * A helper's open slot (UI-029; blueprint 02 J3 step 4): one category, a start and end, and the helper's
 * price. `status` (AVAILABILITY_STATUSES): `active` → `held` while a request for it waits (the invite's
 * `slot_id`) → `booked` when the helper accepts, or back to `active` when the request closes; `expired` at
 * the start; `canceled` by the helper.
 */
export const availabilityPosts = pgTable(
  'availability_posts',
  {
    id: text('id').primaryKey(),
    helperUserId: text('helper_user_id')
      .notNull()
      .references(() => users.id),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    pricingType: text('pricing_type').notNull(),
    priceCents: integer('price_cents'),
    hourlyRateCents: integer('hourly_rate_cents'),
    estimatedHours: doublePrecision('estimated_hours'),
    hoursCap: doublePrecision('hours_cap'),
    status: text('status').notNull(),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('availability_posts_helper_idx').on(t.helperUserId, t.startAt), index('availability_posts_status_idx').on(t.status, t.startAt)],
);
