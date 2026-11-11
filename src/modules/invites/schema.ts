import { sql } from 'drizzle-orm';
import { doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PriceBreakdown } from '@/contracts';
import { users } from '../accounts/schema';
import { availabilityPosts } from '../availability/schema';
import { tasks } from '../tasks/schema';

/**
 * Direct invites (blueprint 03 §3): a client asks one helper to do one of their open tasks; the card is
 * authorized (a payment row of purpose `invite_authorization`) and captured when the helper accepts. One
 * open invite per task and helper.
 */
export const invites = pgTable(
  'invites',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    posterUserId: text('poster_user_id')
      .notNull()
      .references(() => users.id),
    helperUserId: text('helper_user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull(), // INVITE_STATUSES
    /** Where it came from: a profile or saved helper (`profile`), or Book again (`rebook`). */
    source: text('source').notNull().default('profile'),
    pricingType: text('pricing_type').notNull(),
    priceCents: integer('price_cents'),
    hourlyRateCents: integer('hourly_rate_cents'),
    estimatedHours: doublePrecision('estimated_hours'),
    hoursCap: doublePrecision('hours_cap'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    message: text('message'),
    breakdown: jsonb('breakdown').$type<PriceBreakdown>().notNull(),
    /** The helper's counter (`countered`). */
    counterPricingType: text('counter_pricing_type'),
    counterPriceCents: integer('counter_price_cents'),
    counterHourlyRateCents: integer('counter_hourly_rate_cents'),
    counterEstimatedHours: doublePrecision('counter_estimated_hours'),
    counterHoursCap: doublePrecision('counter_hours_cap'),
    counterStartAt: timestamp('counter_start_at', { withTimezone: true }),
    counterMessage: text('counter_message'),
    counterBreakdown: jsonb('counter_breakdown').$type<PriceBreakdown>(),
    /** The authorization (a `payments` row). */
    paymentId: text('payment_id'),
    /** Accepted: the booking. */
    bookingId: text('booking_id'),
    /** Requested from one of the helper's open slots (UI-029): the slot is held while this waits. */
    slotId: text('slot_id').references(() => availabilityPosts.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invites_open_idx').on(t.taskId, t.helperUserId).where(sql`status in ('authorizing', 'sent', 'countered')`),
    // One waiting request per slot.
    uniqueIndex('invites_open_slot_idx').on(t.slotId).where(sql`status in ('authorizing', 'sent', 'countered')`),
    index('invites_helper_idx').on(t.helperUserId, t.createdAt),
    index('invites_task_idx').on(t.taskId, t.createdAt),
  ],
);
