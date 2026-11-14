import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../accounts/schema';
import { markets } from '../markets/schema';

/**
 * Saved searches and their alerts (completion plan 7.10): a board or find-work filter set with a name, and
 * whether new matching tasks are sent at once, in a daily digest, or not at all. `params` is the board URL's
 * query (the same keys `parseTaskBoardQuery` reads), so a saved search opens as the page it was saved from.
 */
export const savedSearches = pgTable(
  'saved_searches',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    name: text('name').notNull(),
    source: text('source').notNull(), // board | find_work
    params: jsonb('params').$type<Record<string, string>>().notNull().default({}),
    alert: text('alert').notNull().default('off'), // off | instant | daily
    lastAlertAt: timestamp('last_alert_at', { withTimezone: true }),
    lastDigestAt: timestamp('last_digest_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('saved_searches_user_idx').on(t.userId, t.createdAt), index('saved_searches_alert_idx').on(t.marketId, t.alert)],
);
