import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';

/**
 * The three verification tracks (docs/blueprint/06 §1), stored separately. Providers keep the
 * documents and personal data; we keep statuses, timestamps, and pass flags only.
 */

/** Stripe Identity sessions. The latest row per user is the current one. */
export const identityVerifications = pgTable(
  'identity_verifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // dev | stripe_identity
    providerSessionId: text('provider_session_id').notNull(),
    status: text('status').notNull(), // not_started | processing | requires_input | verified | canceled
    failureReason: text('failure_reason'), // document_unreadable | selfie_mismatch | under_18 | other
    /** From the verified date of birth; the date itself is never stored. */
    isAdult: boolean('is_adult'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('identity_verifications_user_idx').on(t.userId, t.createdAt)],
);

/** Stripe Connect accounts for payouts. No bank or tax details here. */
export const payoutAccounts = pgTable('payout_accounts', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // dev | stripe
  providerAccountId: text('provider_account_id').notNull(),
  status: text('status').notNull(), // not_started | pending | requirements_due | active | restricted
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Background checks (Checkr). Report contents stay with the provider. */
export const backgroundChecks = pgTable(
  'background_checks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // dev | checkr
    providerRef: text('provider_ref').notNull(),
    status: text('status').notNull(), // invited | pending | clear | consider | suspended | canceled | expired
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Re-check every 12 months (blueprint 06 §1). */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('background_checks_user_idx').on(t.userId, t.createdAt)],
);
