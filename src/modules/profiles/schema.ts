import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';
import { areas, categories } from '../markets/schema';
import { files } from '../tasks/schema';
import { createdAt, updatedAt } from '../../platform/db/columns';

/**
 * Helper profiles and services (docs/blueprint/08 §3, profiles).
 * Badge dates and stats are cached here and kept current by the verification, booking and review
 * modules (events), so profile reads stay cheap.
 */
export const helperProfiles = pgTable('helper_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  handle: text('handle').notNull().unique(),
  headline: text('headline').notNull().default(''),
  bio: text('bio').notNull().default(''),
  status: text('status').notNull().default('draft'), // draft | active | paused | suspended
  areaId: text('area_id').references(() => areas.id),
  serviceRadiusKm: integer('service_radius_km').notNull().default(8),
  remoteOk: boolean('remote_ok').notNull().default(false),
  tools: jsonb('tools').$type<string[]>().notNull().default([]),
  languages: jsonb('languages').$type<string[]>().notNull().default(['en']),
  foundingNumber: integer('founding_number'),
  idVerifiedAt: timestamp('id_verified_at', { withTimezone: true, mode: 'string' }),
  backgroundCheckedAt: timestamp('background_checked_at', { withTimezone: true, mode: 'string' }),
  /** "Address verified": when the current proof of the home address was approved. */
  addressVerifiedAt: timestamp('address_verified_at', { withTimezone: true, mode: 'string' }),
  payoutsReadyAt: timestamp('payouts_ready_at', { withTimezone: true, mode: 'string' }),
  completedCount: integer('completed_count').notNull().default(0),
  ratingAverage: doublePrecision('rating_average'),
  ratingCount: integer('rating_count').notNull().default(0),
  responseTimeMinutes: integer('response_time_minutes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const helperServices = pgTable(
  'helper_services',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    pricingType: text('pricing_type').notNull(), // fixed | hourly
    fromPriceCents: integer('from_price_cents'),
    hourlyRateCents: integer('hourly_rate_cents'),
    minHours: integer('min_hours'),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('active'),
  },
  (t) => [uniqueIndex('helper_services_user_category_idx').on(t.userId, t.categoryId)],
);

/** Photos of past work on a helper's profile, in display order. */
export const helperWorkSamples = pgTable(
  'helper_work_samples',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id),
    categoryId: text('category_id').references(() => categories.id),
    caption: text('caption'),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('helper_work_samples_user_idx').on(t.userId, t.position)],
);
