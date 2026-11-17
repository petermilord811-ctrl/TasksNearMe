import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { markets } from '../markets/schema';

/** People outside our markets who asked to hear when we open near them (`/waitlist`). */
export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    zip: text('zip').notNull(),
    /** The city the person typed (optional), tidied (src/shared/us-zip.ts), and the ZIP's state. */
    city: text('city'),
    state: text('state'),
    interest: text('interest').notNull(), // need_help | give_help | both
    /** The language of the page they joined from: their email goes out in it (entries from before it was kept: English). */
    locale: text('locale').notNull().default('en'),
    /**
     * Telling them their city opened (completion plan 8.3), once per entry. When a market covering their ZIP goes live,
     * the status change queues them for it in the same transaction (`told_market_id`, `tell_status` `queued`); the job
     * runner sends the emails in batches: `sending` while one is in flight (until `tell_after`, then it's tried again),
     * then `sent` (at `told_at`), `skipped` (`tell_reason`: the address bounced or complained, or they unsubscribed), or
     * `failed` after the last retry. A failed send goes back to `queued` until then, due at `tell_after`.
     */
    toldMarketId: text('told_market_id').references(() => markets.id),
    tellStatus: text('tell_status'), // queued | sending | sent | skipped | failed
    tellReason: text('tell_reason'),
    tellAttempts: integer('tell_attempts').notNull().default(0),
    tellAfter: timestamp('tell_after', { withTimezone: true }),
    toldAt: timestamp('told_at', { withTimezone: true }),
    /** They turned these emails off with the link in one (no sign-in). Joining again with the address doesn't undo it. */
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('waitlist_entries_email_idx').on(t.email), index('waitlist_entries_tell_idx').on(t.tellStatus, t.tellAfter)],
);
