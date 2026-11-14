import { lt } from 'drizzle-orm';
import type { Db } from '../db/connect';
import { cacheTagInvalidations } from './schema';

/**
 * How long a tag invalidation stays shared. Production drops a cached entry once past its `revalidate` (an hour
 * at most for the profiles in use: 'hours', 'minutes' and the default), so an older row can't matter there; the
 * dev server keeps entries until they expire, which a week covers in practice.
 */
export const TAG_ROW_DAYS = 7;

/** Deletes tag rows nobody can need any more (the job runner, every minute; an indexed delete). */
export async function pruneCacheTags(db: Db, now: Date): Promise<number> {
  const before = new Date(now.getTime() - TAG_ROW_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db.delete(cacheTagInvalidations).where(lt(cacheTagInvalidations.updatedAt, before)).returning({ tag: cacheTagInvalidations.tag });
  return deleted.length;
}
