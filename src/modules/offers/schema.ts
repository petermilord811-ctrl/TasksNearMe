import { sql } from 'drizzle-orm';
import { doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';
import { tasks } from '../tasks/schema';

/**
 * Offers from helpers on open tasks (docs/blueprint/03 §3). One active offer per helper per task;
 * editing bumps `revision`. `poster_seen_at` drives the poster's "new" badges.
 */
export const offers = pgTable(
  'offers',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    helperUserId: text('helper_user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull(), // pending | stale | accepted | declined | withdrawn | expired
    pricingType: text('pricing_type').notNull(), // fixed | hourly
    priceCents: integer('price_cents'),
    hourlyRateCents: integer('hourly_rate_cents'),
    estimatedHours: doublePrecision('estimated_hours'),
    hoursCap: doublePrecision('hours_cap'),
    proposedStart: timestamp('proposed_start', { withTimezone: true }).notNull(),
    /** As written by the helper; masked when shown before a booking. */
    message: text('message').notNull().default(''),
    brings: jsonb('brings').$type<string[]>().notNull().default([]),
    /**
     * How the helper is paid (owner, 2026-11-23: no service fees): `direct`, by the client after the task, outside
     * TasksNearMe; `held`, upfront, held by TasksNearMe until the client says the task is done (the client pays the hold
     * fee). Offers sent before this choice existed were all held.
     */
    paymentMode: text('payment_mode').notNull().default('held'), // direct | held
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revision: integer('revision').notNull().default(1),
    posterSeenAt: timestamp('poster_seen_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('offers_task_idx').on(t.taskId, t.status),
    index('offers_helper_idx').on(t.helperUserId, t.status),
    // One active offer per helper per task.
    uniqueIndex('offers_active_helper_task_idx')
      .on(t.taskId, t.helperUserId)
      .where(sql`status in ('pending', 'stale')`),
  ],
);
