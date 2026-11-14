import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * The double-entry ledger (blueprint 04 §7, 08 §3 `ledger_journals` and `ledger_entries`): a money movement is
 * a journal whose entries balance (debits = credits, checked by a deferred trigger at commit, migration 0051).
 * Corrections are new journals, never edits. Accounts are named as in blueprint 08 (`cash:stripe_platform`,
 * `expense:chargeback_losses`, …).
 *
 * It starts with chargebacks (T-18): a lost chargeback is the platform's loss. Charges, refunds, transfers and
 * payouts still live in their own tables (`payments`, `refunds`, `earnings`, `payouts`) until the rest of
 * B-036 journals them too.
 */
export const ledgerJournals = pgTable(
  'ledger_journals',
  {
    id: text('id').primaryKey(),
    /** chargeback_loss */
    kind: text('kind').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    /** What it records (plain columns, no foreign keys, so the ledger depends on nothing). */
    paymentId: text('payment_id'),
    bookingId: text('booking_id'),
    /** The provider's id for the movement (a Stripe dispute `dp_…`). */
    providerRef: text('provider_ref'),
    memo: text('memo').notNull().default(''),
    /** One journal per movement: a replayed webhook finds it already written. */
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ledger_journals_idempotency_idx').on(t.idempotencyKey), index('ledger_journals_booking_idx').on(t.bookingId), index('ledger_journals_kind_idx').on(t.kind, t.occurredAt)],
);

/** One side of a journal: an amount debited or credited to an account, in integer cents. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: text('id').primaryKey(),
    journalId: text('journal_id')
      .notNull()
      .references(() => ledgerJournals.id),
    account: text('account').notNull(),
    debitCents: integer('debit_cents').notNull().default(0),
    creditCents: integer('credit_cents').notNull().default(0),
  },
  (t) => [
    index('ledger_entries_journal_idx').on(t.journalId),
    index('ledger_entries_account_idx').on(t.account),
    check('ledger_entries_one_side', sql`(${t.debitCents} > 0 and ${t.creditCents} = 0) or (${t.creditCents} > 0 and ${t.debitCents} = 0)`),
  ],
);
