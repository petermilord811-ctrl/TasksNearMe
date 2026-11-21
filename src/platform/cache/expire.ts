import { sql } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { cacheTagInvalidations } from './schema';

/**
 * Expires `'use cache'` tags from outside a request (a job, where `updateTag` can't run): the same row `updateTag`
 * writes through the shared handler (cache-handlers/shared-tags.mjs), which every web instance reads before it serves
 * again. Used when an account is deleted, so its public profile and the lists it was in don't outlive it.
 */
export async function expireCacheTags(db: Pick<Db, 'insert'>, tags: readonly string[], now: number = Date.now()): Promise<void> {
  const unique = [...new Set(tags)];
  if (unique.length === 0) return;
  const expired = Math.ceil(now);
  await db
    .insert(cacheTagInvalidations)
    .values(unique.map((tag) => ({ tag, expiredAt: expired, updatedAt: sql`clock_timestamp()` })))
    .onConflictDoUpdate({ target: cacheTagInvalidations.tag, set: { expiredAt: expired, updatedAt: sql`clock_timestamp()` } });
}
