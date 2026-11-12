import { boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';
import { areas, categories, markets } from '../markets/schema';

/**
 * Tasks (docs/blueprint/08 §3). The exact address lives in `task_locations`, encrypted; tasks
 * carry only the public area and a fuzzed public point. Photos are files linked by position.
 */

/** Uploaded files. Only re-encoded, metadata-free copies are stored. */
export const files = pgTable(
  'files',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(), // task_photo | work_sample | evidence | receipt
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    alt: text('alt').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('files_owner_idx').on(t.ownerUserId, t.createdAt)],
);

/** Exact addresses, encrypted (platform/crypto). Visible only to the booked helper, the poster, and staff. */
export const taskLocations = pgTable('task_locations', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id),
  /** Encrypted JSON: { line1, line2?, city, state, zip, accessNotes? }. */
  addressEnc: text('address_enc').notNull(),
  zip: text('zip').notNull(),
  areaId: text('area_id')
    .notNull()
    .references(() => areas.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    posterUserId: text('poster_user_id')
      .notNull()
      .references(() => users.id),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    title: text('title').notNull(),
    description: text('description').notNull(),
    details: jsonb('details').$type<Record<string, string | number | boolean>>().notNull().default({}),
    mode: text('mode').notNull(), // local | remote
    status: text('status').notNull(), // draft | open | assigned | completed | canceled | expired
    pricingType: text('pricing_type').notNull(), // fixed | hourly
    budgetCents: integer('budget_cents'),
    hourlyRateCents: integer('hourly_rate_cents'),
    estimatedHours: doublePrecision('estimated_hours'),
    hoursCap: doublePrecision('hours_cap'),
    expenseAllowanceCents: integer('expense_allowance_cents').notNull().default(0),
    expenseAllowanceNote: text('expense_allowance_note'),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    flexible: boolean('flexible').notNull().default(false),
    locationId: text('location_id').references(() => taskLocations.id),
    publicAreaId: text('public_area_id').references(() => areas.id),
    publicLat: doublePrecision('public_lat'),
    publicLng: doublePrecision('public_lng'),
    helpersNeeded: integer('helpers_needed').notNull().default(1),
    offerCount: integer('offer_count').notNull().default(0),
    aiGenerationId: text('ai_generation_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /**
     * Find a replacement reopened the task after its helper canceled: offers from before this belong to the
     * canceled booking, so the poster's list and the helpers' "my offer" only count offers made since.
     */
    reopenedAt: timestamp('reopened_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    /**
     * Hidden by staff (UI-033): off the board, the feeds, the public page and offers; the poster still sees
     * it. The reason (and every change) is in the audit log too.
     */
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    hiddenByUserId: text('hidden_by_user_id').references(() => users.id),
    hiddenReason: text('hidden_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_market_status_window_idx').on(t.marketId, t.status, t.windowStart),
    index('tasks_poster_idx').on(t.posterUserId, t.createdAt),
  ],
);

export const taskPhotos = pgTable(
  'task_photos',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id),
    position: integer('position').notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.fileId] })],
);
