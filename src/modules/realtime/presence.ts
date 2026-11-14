import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { PresenceState } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import type { Db } from '@/platform/db/connect';

/**
 * Presence (completion plan 7.1; decisions.md 2026-11-14): coarse on purpose. "Active now" within 5 minutes of
 * the live connection's last heartbeat, "Active today" within 24 hours, nothing after that, and nothing at all
 * for people who turned "Show when I'm active" off. Shown only to people who share a conversation or a booking
 * with them, never on public pages.
 */
export const ACTIVE_NOW_MS = 5 * 60_000;
export const ACTIVE_TODAY_MS = 24 * 3_600_000;
/** The heartbeat writes at most once a minute per person, whatever the number of open tabs. */
export const HEARTBEAT_MS = 60_000;

export function presenceOf(lastActiveAt: Date | null | undefined, showActivity: boolean, now: Date): PresenceState | undefined {
  if (!showActivity || !lastActiveAt) return undefined;
  const ago = now.getTime() - lastActiveAt.getTime();
  if (ago < -60_000) return undefined;
  if (ago <= ACTIVE_NOW_MS) return 'now';
  if (ago <= ACTIVE_TODAY_MS) return 'today';
  return undefined;
}

/** Records that they have the app open (one write a minute at most, skipped when nothing changed). */
export async function touchActivity(db: Pick<Db, 'update'>, userId: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - HEARTBEAT_MS);
  await db
    .update(users)
    .set({ lastActiveAt: now })
    .where(and(eq(users.id, userId), or(isNull(users.lastActiveAt), lt(users.lastActiveAt, cutoff))));
}
