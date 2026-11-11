import { and, eq, or } from 'drizzle-orm';
import { blocks } from '@/modules/messaging/schema';
import type { Db } from '@/platform/db/connect';

/**
 * Blocking (blueprint 08: blocked people can't message, offer or invite each other). A block works in
 * both directions; only the person who blocked can lift it.
 */

export async function isBlockedBetween(db: Db, a: string, b: string): Promise<boolean> {
  const [row] = await db
    .select({ blockerId: blocks.blockerId })
    .from(blocks)
    .where(or(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)), and(eq(blocks.blockerId, b), eq(blocks.blockedId, a))))
    .limit(1);
  return Boolean(row);
}

/** Everyone the person blocked or was blocked by. */
export async function blockedPeopleOf(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select()
    .from(blocks)
    .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
  return [...new Set(rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId)))];
}

/** The person blocked the other themselves (what the Block or Unblock menu item shows). */
export async function hasBlocked(db: Db, blockerId: string, blockedId: string): Promise<boolean> {
  const [row] = await db
    .select({ blockerId: blocks.blockerId })
    .from(blocks)
    .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)))
    .limit(1);
  return Boolean(row);
}

export async function setBlocked(db: Db, blockerId: string, blockedId: string, blocked: boolean, now: Date): Promise<void> {
  if (blockerId === blockedId) return;
  if (blocked) await db.insert(blocks).values({ blockerId, blockedId, createdAt: now }).onConflictDoNothing();
  else await db.delete(blocks).where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)));
}
