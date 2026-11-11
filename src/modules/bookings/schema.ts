import { sql } from 'drizzle-orm';
import { doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PriceBreakdown } from '@/contracts';
import { users } from '../accounts/schema';
import { offers } from '../offers/schema';
import { files, tasks } from '../tasks/schema';

/**
 * Bookings (docs/blueprint/03 §4). A booking starts `pending_funding` when the poster pays and becomes
 * `confirmed` once the payment succeeds; unpaid after 30 minutes it's `canceled (funding_failed)`.
 * The agreed terms live in versioned `booking_terms` rows (changes add versions).
 */
export const bookings = pgTable(
  'bookings',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    /** The booked offer (direct invites have none). */
    offerId: text('offer_id').references(() => offers.id),
    posterUserId: text('poster_user_id')
      .notNull()
      .references(() => users.id),
    helperUserId: text('helper_user_id')
      .notNull()
      .references(() => users.id),
    marketId: text('market_id').notNull(),
    /** The market policy version the booking was made under (fees, cancellation, timers). */
    policyVersionId: text('policy_version_id').notNull(),
    /** pending_funding | confirmed | in_progress | completion_submitted | disputed | completed | canceled */
    status: text('status').notNull(),
    cancelReason: text('cancel_reason'),
    completedVia: text('completed_via'),
    /** The current `booking_terms` version. */
    termsVersion: integer('terms_version').notNull().default(1),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    /** While `pending_funding`: unpaid after this, the booking is canceled and the offer is open again. */
    fundingExpiresAt: timestamp('funding_expires_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    /** Day-of updates from the helper. */
    onMyWayAt: timestamp('on_my_way_at', { withTimezone: true }),
    lateByMinutes: integer('late_by_minutes'),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }),
    /** `completion_submitted`: approved automatically at this time. */
    completionSubmittedAt: timestamp('completion_submitted_at', { withTimezone: true }),
    approvalDueAt: timestamp('approval_due_at', { withTimezone: true }),
    /** The helper couldn't get in; the client must answer by `poster_response_due_at`. */
    cantAccessAt: timestamp('cant_access_at', { withTimezone: true }),
    posterResponseDueAt: timestamp('poster_response_due_at', { withTimezone: true }),
    /** Who canceled, and their reason and note (`cancel_reason` keeps the policy outcome). */
    canceledBy: text('canceled_by'),
    cancelChoice: text('cancel_choice'),
    cancelNote: text('cancel_note'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bookings_poster_idx').on(t.posterUserId, t.status),
    index('bookings_helper_idx').on(t.helperUserId, t.status),
    // At most one live booking per task.
    uniqueIndex('bookings_live_task_idx').on(t.taskId).where(sql`status <> 'canceled'`),
  ],
);

/** The agreed terms, one row per version. The breakdown is frozen at the version's fees. */
export const bookingTerms = pgTable(
  'booking_terms',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id),
    version: integer('version').notNull(),
    pricingType: text('pricing_type').notNull(), // fixed | hourly
    priceCents: integer('price_cents'),
    hourlyRateCents: integer('hourly_rate_cents'),
    estimatedHours: doublePrecision('estimated_hours'),
    hoursCap: doublePrecision('hours_cap'),
    expenseAllowanceCents: integer('expense_allowance_cents').notNull().default(0),
    breakdown: jsonb('breakdown').$type<PriceBreakdown>().notNull(),
    scopeText: text('scope_text').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('booking_terms_version_idx').on(t.bookingId, t.version)],
);

/** The helper's submitted work (blueprint 02 J6): one row per booking, frozen at submission. */
export const bookingCompletions = pgTable('booking_completions', {
  bookingId: text('booking_id')
    .primaryKey()
    .references(() => bookings.id),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  note: text('note').notNull().default(''),
  /** Hourly bookings. */
  hoursWorked: doublePrecision('hours_worked'),
  /** The final numbers with these hours and expenses. */
  finalBreakdown: jsonb('final_breakdown').$type<PriceBreakdown>().notNull(),
});

/** Photos of the finished work (files of kind `evidence`, owned by the helper). */
export const bookingCompletionPhotos = pgTable(
  'booking_completion_photos',
  {
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id),
    position: integer('position').notNull(),
  },
  (t) => [primaryKey({ columns: [t.bookingId, t.fileId] })],
);

/** Receipts against the expense allowance (files of kind `receipt`). */
export const bookingExpenses = pgTable(
  'booking_expenses',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id),
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    receiptFileId: text('receipt_file_id')
      .notNull()
      .references(() => files.id),
    status: text('status').notNull().default('submitted'), // submitted | approved | rejected
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('booking_expenses_booking_idx').on(t.bookingId)],
);

/** Late cancellations and no-shows count against the helper (blueprint 03 §4: "strike if < 24 h"). */
export const helperStrikes = pgTable(
  'helper_strikes',
  {
    id: text('id').primaryKey(),
    helperUserId: text('helper_user_id')
      .notNull()
      .references(() => users.id),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id),
    reason: text('reason').notNull(), // late_cancellation | no_show
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('helper_strikes_helper_idx').on(t.helperUserId, t.createdAt)],
);

/**
 * Change requests (blueprint 03 §5): new terms one person proposes and the other accepts. At most one open
 * request per booking. The proposed terms are stored in full; applying one writes a new `booking_terms` version.
 */
export const bookingChangeRequests = pgTable(
  'booking_change_requests',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id),
    proposedByUserId: text('proposed_by_user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull(), // CHANGE_STATUSES
    types: jsonb('types').$type<string[]>().notNull(),
    /** The terms version it changes (a stale request can't apply). */
    fromVersion: integer('from_version').notNull(),
    pricingType: text('pricing_type').notNull(), // fixed | hourly
    priceCents: integer('price_cents'),
    hourlyRateCents: integer('hourly_rate_cents'),
    estimatedHours: doublePrecision('estimated_hours'),
    hoursCap: doublePrecision('hours_cap'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    scopeText: text('scope_text').notNull(),
    expenseAllowanceCents: integer('expense_allowance_cents').notNull().default(0),
    message: text('message').notNull(),
    beforeBreakdown: jsonb('before_breakdown').$type<PriceBreakdown>().notNull(),
    afterBreakdown: jsonb('after_breakdown').$type<PriceBreakdown>().notNull(),
    /** The client's total after minus before (positive: they pay more). */
    differenceCents: integer('difference_cents').notNull(),
    /** The payment for the difference, when the total went up. */
    paymentId: text('payment_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('booking_change_requests_open_idx').on(t.bookingId).where(sql`status in ('proposed', 'accepted_pending_funding')`),
    index('booking_change_requests_booking_idx').on(t.bookingId, t.createdAt),
  ],
);
