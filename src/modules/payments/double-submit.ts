import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';

/** How long the same staff money form sent again counts as the same request (money review #10). */
export const DOUBLE_SUBMIT_MS = 2 * 60_000;

/**
 * Idempotency keys for a staff money action, from what was asked and when (money review #10): the same form sent twice
 * (a double click, a resend after a slow answer) gets the same key, so the money moves once. A fresh key each time let a
 * double submit refund or reverse twice. Both the key for this two-minute window and the one before are checked, so a
 * pair that straddles a boundary is caught too.
 */
export function submissionKeys(prefix: string, parts: readonly unknown[], now: Date): { current: string; previous: string } {
  const window = Math.floor(now.getTime() / DOUBLE_SUBMIT_MS);
  const key = (at: number) => `${prefix}:${createHash('sha256').update(JSON.stringify([...parts, at])).digest('hex').slice(0, 20)}`;
  return { current: key(window), previous: key(window - 1) };
}

/**
 * Runs `work` holding a lock on `name` for as long as it takes (the provider call included): a second request for the
 * same name waits, then finds the first one's rows. The transaction only holds the lock; `work` writes through `db`.
 */
export async function serialized<T>(db: Db, name: string, work: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${name}))`);
    return work();
  });
}
