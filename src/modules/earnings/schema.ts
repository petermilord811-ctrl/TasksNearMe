import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';

/**
 * Money to helpers (docs/blueprint/04 §5): one row per transfer (earnings, an expense reimbursement,
 * a late-cancellation compensation), grouped into bank payouts. `booking_id` is a plain column so
 * earnings don't depend on bookings.
 */
export const earnings = pgTable(
  'earnings',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id').notNull(),
    helperUserId: text('helper_user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(), // earnings | reimbursement | cancellation_compensation
    amountCents: integer('amount_cents').notNull(),
    /** scheduled | transferred | paid_out | reversed | partially_reversed | failed */
    status: text('status').notNull(),
    /** The provider's transfer id. */
    transferRef: text('transfer_ref'),
    transferredAt: timestamp('transferred_at', { withTimezone: true }),
    payoutId: text('payout_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('earnings_helper_idx').on(t.helperUserId, t.createdAt), uniqueIndex('earnings_booking_kind_idx').on(t.bookingId, t.kind)],
);

/** Bank payouts from the helper's payout account (development: simulated two days after transfer). */
export const payouts = pgTable(
  'payouts',
  {
    id: text('id').primaryKey(),
    helperUserId: text('helper_user_id')
      .notNull()
      .references(() => users.id),
    amountCents: integer('amount_cents').notNull(),
    status: text('status').notNull(), // pending | in_transit | paid | failed | canceled
    /** Market calendar day, "2026-12-01". */
    arrivalDate: text('arrival_date').notNull(),
    bankLast4: text('bank_last4').notNull(),
    /** standard (the provider's schedule) | instant (the helper asked; minutes, for a fee). */
    method: text('method').notNull().default('standard'),
    /** What an instant payout cost the helper. */
    feeCents: integer('fee_cents').notNull().default(0),
    providerRef: text('provider_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payouts_helper_idx').on(t.helperUserId, t.createdAt)],
);

/**
 * Taking back part or all of a helper's transfer (blueprint 08 `transfer_reversals`; completion plan 5.13):
 * finance only, always with the support case that justifies it. `failed`: Stripe couldn't take it back (the
 * helper's balance was already paid out); the money is then recovered by hand.
 */
export const transferReversals = pgTable(
  'transfer_reversals',
  {
    id: text('id').primaryKey(),
    earningsId: text('earnings_id')
      .notNull()
      .references(() => earnings.id),
    bookingId: text('booking_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    reason: text('reason').notNull(),
    caseId: text('case_id').notNull(),
    /** succeeded | failed */
    status: text('status').notNull(),
    stripeReversalId: text('stripe_reversal_id'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('transfer_reversals_idempotency_idx').on(t.idempotencyKey), index('transfer_reversals_earnings_idx').on(t.earningsId)],
);
