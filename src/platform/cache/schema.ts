import { bigint, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * When each `'use cache'` tag was last invalidated, shared by every web instance (cache-handlers/shared-tags.mjs):
 * `stale_at` (served while it refreshes) and `expired_at` (not served after), in epoch milliseconds like Next's
 * own tag manifest. Each instance reads the rows changed since it last looked. The job runner deletes rows a week
 * old (src/platform/cache/prune.ts).
 */
export const cacheTagInvalidations = pgTable(
  'cache_tag_invalidations',
  {
    tag: text('tag').primaryKey(),
    staleAt: bigint('stale_at', { mode: 'number' }),
    expiredAt: bigint('expired_at', { mode: 'number' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cache_tag_invalidations_updated_idx').on(t.updatedAt)],
);
