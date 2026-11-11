import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/** Fixed-window counters for DB-backed rate limits (blueprint 06 §3). Old windows are pruned by a job. */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
