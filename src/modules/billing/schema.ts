import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';

/**
 * Subscription plans (completion plan 9.13; decisions.md 2026-11-18). Stripe Billing holds the subscription; these
 * rows mirror it from Stripe's events (never from the browser) and are what entitlements read.
 */

/** The person's Stripe customer for billing, made at their first checkout and kept for the next one. */
export const billingCustomers = pgTable('billing_customers', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** stripe | dev */
  provider: text('provider').notNull(),
  providerCustomerId: text('provider_customer_id').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One row per subscription, as Stripe last told us. */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** plus | pro (`PLAN_CODES`) */
    plan: text('plan').notNull(),
    /** month | year */
    interval: text('interval').notNull(),
    /** Stripe's subscription status: incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid, paused. */
    status: text('status').notNull(),
    /** stripe | dev */
    provider: text('provider').notNull(),
    providerSubscriptionId: text('provider_subscription_id').notNull(),
    /** The market whose policy priced it. */
    marketId: text('market_id').notNull(),
    priceCents: integer('price_cents').notNull(),
    /** The end of the period paid for. */
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    /** Cancelled: it ends at `currentPeriodEnd` and won't renew. */
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('subscriptions_provider_ref_idx').on(t.provider, t.providerSubscriptionId), index('subscriptions_user_idx').on(t.userId, t.plan)],
);

/** Metered AI use per person, feature and calendar month (in the person's market zone): the plan caps' counter. */
export const aiUsage = pgTable(
  'ai_usage',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** ai_search */
    feature: text('feature').notNull(),
    /** "2026-11" */
    period: text('period').notNull(),
    count: integer('count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.feature, t.period] })],
);
