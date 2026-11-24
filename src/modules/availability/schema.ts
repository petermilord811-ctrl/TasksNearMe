import { doublePrecision, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';
import { areas, categories, markets } from '../markets/schema';

/**
 * A neighborhood day (2026-11-24, blueprint 02 J3 step 5): a helper's visits on one date in one neighborhood,
 * published together. Each visit is an availability post (`availability_posts.day_id`), requested and booked like
 * any slot, so money and the booking state machine don't change. `price_cents` is the helper's usual price per visit;
 * `neighbor_price_cents` the lower one they chose for this day (never set on their behalf), which the visits carry.
 * `status`: `open`, or `canceled` once the helper canceled the visits still open (booked ones follow the normal rules).
 */
export const neighborhoodDays = pgTable(
  'neighborhood_days',
  {
    id: text('id').primaryKey(),
    helperUserId: text('helper_user_id')
      .notNull()
      .references(() => users.id),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    areaId: text('area_id')
      .notNull()
      .references(() => areas.id),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    /** The market-time date, `YYYY-MM-DD`. */
    day: text('day').notNull(),
    priceCents: integer('price_cents').notNull(),
    neighborPriceCents: integer('neighbor_price_cents'),
    status: text('status').notNull(),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('neighborhood_days_helper_idx').on(t.helperUserId, t.day), index('neighborhood_days_area_idx').on(t.areaId, t.day)],
);

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
    /** A visit of a neighborhood day; null for a slot of its own. */
    dayId: text('day_id').references(() => neighborhoodDays.id),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('availability_posts_day_idx').on(t.dayId), index('availability_posts_helper_idx').on(t.helperUserId, t.startAt), index('availability_posts_status_idx').on(t.status, t.startAt)],
);
