import { sql } from 'drizzle-orm';
import { doublePrecision, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';
import { bookings } from '../bookings/schema';
import { offers } from '../offers/schema';
import { tasks } from '../tasks/schema';

/**
 * Team up (2026-11-24, owner's chat ideas; blueprint 03 "Team jobs"): the lead helper of a confirmed booking invites one
 * partner for a two-person job, with a price for the partner's part. `status` (TEAM_STATUSES): `invited` → `accepted`
 * (the partner said yes) → `confirmed` (the client said yes); or `declined`, `withdrawn`, `canceled`, `refused`,
 * `expired`. Once confirmed, the partner's part is its own task (`partner_task_id`, a copy of the lead's task with the
 * same time and place, `tasks.team_part_of` set) with the partner's offer on it (`partner_offer_id`), which the client
 * books through the normal booking and payment flow: so the partner's booking is an ordinary booking with its own
 * money, states, completion and review, and the lead's task keeps its one live booking. Pricing: the partner's part
 * (fixed, or hourly with an estimate and a cap), in the lead's booking's payment mode.
 */
export const bookingTeams = pgTable(
  'booking_teams',
  {
    id: text('id').primaryKey(),
    leadBookingId: text('lead_booking_id')
      .notNull()
      .references(() => bookings.id),
    /** The lead's task. */
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    clientUserId: text('client_user_id')
      .notNull()
      .references(() => users.id),
    leadUserId: text('lead_user_id')
      .notNull()
      .references(() => users.id),
    partnerUserId: text('partner_user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull(),
    pricingType: text('pricing_type').notNull(), // fixed | hourly
    priceCents: integer('price_cents'),
    hourlyRateCents: integer('hourly_rate_cents'),
    estimatedHours: doublePrecision('estimated_hours'),
    hoursCap: doublePrecision('hours_cap'),
    /** The lead's note to the partner. */
    note: text('note'),
    /** The lead and partner's conversation (a direct one): where the invite's card shows. */
    teamThreadId: text('team_thread_id'),
    /** `confirmed`: the partner's part, and the partner's offer on it the client books. */
    partnerTaskId: text('partner_task_id').references(() => tasks.id),
    partnerOfferId: text('partner_offer_id').references(() => offers.id),
    /** The client kept the partner after the lead's booking was canceled. */
    clientKeptAt: timestamp('client_kept_at', { withTimezone: true }),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('booking_teams_lead_booking_idx').on(t.leadBookingId, t.createdAt),
    index('booking_teams_partner_idx').on(t.partnerUserId, t.status),
    // One invite in play per lead booking.
    uniqueIndex('booking_teams_open_idx').on(t.leadBookingId).where(sql`status in ('invited', 'accepted')`),
    uniqueIndex('booking_teams_partner_task_idx').on(t.partnerTaskId).where(sql`partner_task_id is not null`),
  ],
);
