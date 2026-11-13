import { sql } from 'drizzle-orm';
import { doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PriceBreakdown } from '@/contracts';
import { users } from '../accounts/schema';
import { bookings } from '../bookings/schema';
import { tasks } from '../tasks/schema';

/**
 * Rebooking proposals (UI-032; blueprint 02 J8): a helper offers a past client the same task again. The
 * client accepts by paying: a new task (a copy of the past one at the same place, a `draft` until paid) and
 * a booking confirmed like a paid offer. `status` (REBOOK_PROPOSAL_STATUSES): `sent` → `accepted`,
 * `declined`, `expired`, or `withdrawn`. One waiting proposal per helper and client.
 */
export const rebookProposals = pgTable(
  'rebook_proposals',
  {
    id: text('id').primaryKey(),
    helperUserId: text('helper_user_id')
      .notNull()
      .references(() => users.id),
    posterUserId: text('poster_user_id')
      .notNull()
      .references(() => users.id),
    /** The completed booking it repeats (category, title, place). */
    fromBookingId: text('from_booking_id')
      .notNull()
      .references(() => bookings.id),
    status: text('status').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    pricingType: text('pricing_type').notNull(),
    priceCents: integer('price_cents'),
    hourlyRateCents: integer('hourly_rate_cents'),
    estimatedHours: doublePrecision('estimated_hours'),
    hoursCap: doublePrecision('hours_cap'),
    message: text('message'),
    /** Regular visits (SERIES_CADENCES): accepting starts a series from this first visit. Null: just once. */
    cadence: text('cadence'),
    /** The market's numbers when it was sent. */
    breakdown: jsonb('breakdown').$type<PriceBreakdown>().notNull(),
    /** Set on the first accept attempt: the new task (a draft until paid) and its booking. */
    taskId: text('task_id').references(() => tasks.id),
    bookingId: text('booking_id').references(() => bookings.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('rebook_proposals_open_idx').on(t.helperUserId, t.posterUserId).where(sql`status = 'sent'`),
    index('rebook_proposals_poster_idx').on(t.posterUserId, t.createdAt),
    index('rebook_proposals_helper_idx').on(t.helperUserId, t.createdAt),
  ],
);
