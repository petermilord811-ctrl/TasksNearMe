import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';

/**
 * Poster payments (docs/blueprint/04 §1 and §4, 03 §6.1). Card data stays with the provider; we keep
 * the provider's references, the brand and last four digits, statuses, and amounts in integer cents.
 */

/** Saved cards. `provider_ref` is the provider's payment method id (development: the test card). */
export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(), // dev | stripe
    providerRef: text('provider_ref').notNull(),
    brand: text('brand').notNull(),
    last4: text('last4').notNull(),
    expMonth: integer('exp_month').notNull(),
    expYear: integer('exp_year').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    detachedAt: timestamp('detached_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payment_methods_user_idx').on(t.userId)],
);

/**
 * One row per funding attempt (a booking, a change, an invite authorization). `booking_id` is a plain
 * column (no foreign key) so the payments module doesn't depend on bookings.
 */
export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id'),
    purpose: text('purpose').notNull(), // booking_funding | invite_authorization | change_funding
    payerUserId: text('payer_user_id')
      .notNull()
      .references(() => users.id),
    amountCents: integer('amount_cents').notNull(),
    /** requires_confirmation | processing | authorized | succeeded | failed | canceled | partially_refunded | refunded */
    status: text('status').notNull(),
    provider: text('provider').notNull(),
    /** The provider's payment intent id, once there is one. */
    providerRef: text('provider_ref'),
    /** A saved card, when the poster paid with one. */
    paymentMethodId: text('payment_method_id'),
    /** The provider's reference for the card used (kept to save a new card once the payment succeeds). */
    methodRef: text('method_ref'),
    methodBrand: text('method_brand'),
    methodLast4: text('method_last4'),
    methodExpMonth: integer('method_exp_month'),
    methodExpYear: integer('method_exp_year'),
    /** Save the new card for next time once this payment succeeds. */
    saveMethod: boolean('save_method').notNull().default(false),
    /** payment_declined | insufficient_funds */
    failureCode: text('failure_code'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_booking_idx').on(t.bookingId, t.createdAt),
    index('payments_payer_idx').on(t.payerUserId, t.createdAt),
    uniqueIndex('payments_idempotency_idx').on(t.idempotencyKey),
  ],
);

/** Money back to the poster (blueprint 04 §6), one row per refund. */
export const refunds = pgTable(
  'refunds',
  {
    id: text('id').primaryKey(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id),
    bookingId: text('booking_id'),
    amountCents: integer('amount_cents').notNull(),
    /** cancellation | unused_cap | unused_allowance | change_decrease | dispute_settlement | goodwill */
    reason: text('reason').notNull(),
    status: text('status').notNull(), // pending | succeeded | failed
    providerRef: text('provider_ref'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('refunds_booking_idx').on(t.bookingId), uniqueIndex('refunds_idempotency_idx').on(t.idempotencyKey)],
);
