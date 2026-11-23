import { and, eq, inArray, sql } from 'drizzle-orm';
import { usernames, users } from '@/modules/accounts/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { mentionedUsernames, type Mentions } from '@/modules/trust/message-segments';
import type { Db } from '@/platform/db/connect';

/** Accounts that are someone to point at: as New message's suggestions (`searchPeople`). */
const MENTIONABLE_STATUSES = ['active', 'restricted'];

/**
 * The people several texts name by @username (2026-11-23): one query for a whole conversation or list. An "@name" that's
 * nobody's username, or a deleted, banned or suspended account's, isn't in it (it stays a handle: hidden before a booking).
 */
export async function mentionsOf(db: Pick<Db, 'select'>, texts: readonly string[], viewerId: string): Promise<Mentions> {
  const wanted = [...new Set(texts.flatMap((text) => (text ? mentionedUsernames(text) : [])))].filter((name) => name.length <= 20);
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.name, username: usernames.username, handle: helperProfiles.handle, profileStatus: helperProfiles.status })
    .from(usernames)
    .innerJoin(users, eq(users.id, usernames.userId))
    .leftJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .where(and(inArray(sql`lower(${usernames.username})`, wanted), inArray(users.status, MENTIONABLE_STATUSES)));
  return new Map(
    rows.map((row) => [
      row.username.toLowerCase(),
      { userId: row.id, name: row.name, ...(row.handle && row.profileStatus === 'active' ? { helperHandle: row.handle } : {}), ...(row.id === viewerId ? { self: true } : {}) },
    ]),
  );
}
