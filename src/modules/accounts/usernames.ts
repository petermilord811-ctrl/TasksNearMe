import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { normalizeUsername, USERNAME_CHANGE_DAYS, USERNAME_PATTERN, usernameInputSchema, type ActionResult, type UsernameInput } from '@/contracts';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { violatedConstraint } from '@/platform/db/errors';
import { usernames, users } from './schema';

/**
 * @usernames (2026-11-22, owner: "account id as other platforms @pm11"): every account has one, in the `usernames`
 * table (src/modules/accounts/schema.ts). Migration 0077 gave the accounts of the day one from their first name; a new
 * account gets one the first time a signed-in page loads (`assignUsername`, from the signed-in shell), and seeds call
 * `backfillUsernames`. People choose another on the account page, at most once every `USERNAME_CHANGE_DAYS`. Usernames
 * are unique without regard to case (an index on lower(username)) and stored lowercase.
 */

/** Words nobody may use: they'd pass for the company, its staff or the app. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin', 'administrator', 'support', 'help', 'helpdesk', 'staff', 'system', 'moderator', 'mod', 'mods', 'root', 'tasksnearme',
  'tasks_near_me', 'official', 'team', 'security', 'trust', 'safety', 'billing', 'payments', 'null', 'undefined', 'api', 'app',
  'www', 'everyone', 'here', 'deleted', 'anonymous', 'assistant', 'bot', 'me', 'you', 'owner', 'ceo', 'founder', 'neighbors',
]);

const ACCENTS: Record<string, string> = { á: 'a', à: 'a', ä: 'a', â: 'a', ã: 'a', å: 'a', é: 'e', è: 'e', ë: 'e', ê: 'e', í: 'i', ì: 'i', ï: 'i', î: 'i', ó: 'o', ò: 'o', ö: 'o', ô: 'o', õ: 'o', ú: 'u', ù: 'u', ü: 'u', û: 'u', ñ: 'n', ç: 'c', ý: 'y' };

/** The username a first name suggests: as migration 0077 made them (accents folded, letters and digits, 15 at most). */
export function usernameBase(firstName: string): string {
  const raw = [...firstName.toLowerCase()].map((char) => ACCENTS[char] ?? char).join('').replace(/[^a-z0-9]/g, '');
  const base = raw.slice(0, 15);
  return /^[a-z][a-z0-9]{2,}$/.test(raw) && !RESERVED_USERNAMES.has(base) ? base : 'neighbor';
}

export type UsernameProblem = 'invalid' | 'name_reserved';

/** Why a username can't be used, before asking the database whether it's taken; null when it's fine. */
export function usernameProblem(username: string): UsernameProblem | null {
  if (!USERNAME_PATTERN.test(username)) return 'invalid';
  if (RESERVED_USERNAMES.has(username) || username.startsWith('tasksnearme')) return 'name_reserved';
  return null;
}

/** The first free one among `base`, `base_2`, `base_3`… (the numbered ones can't be anyone's base: bases hold no "_"). */
async function freeUsername(db: Db, base: string): Promise<string> {
  const rows = await db
    .select({ username: usernames.username })
    .from(usernames)
    .where(or(sql`lower(${usernames.username}) = ${base}`, sql`lower(${usernames.username}) like ${`${base}\\_%`}`));
  const taken = new Set(rows.map((row) => row.username.toLowerCase()));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** The person's username, giving them one from their first name when they have none (never a deleted account). */
export async function assignUsername(db: Db, userId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [row] = await db
      .select({ firstName: users.firstName, status: users.status, username: usernames.username })
      .from(users)
      .leftJoin(usernames, eq(usernames.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row || row.status === 'deleted') return null;
    if (row.username) return row.username;
    const candidate = await freeUsername(db, usernameBase(row.firstName));
    try {
      const [set] = await db.insert(usernames).values({ userId, username: candidate }).onConflictDoNothing({ target: usernames.userId }).returning({ username: usernames.username });
      if (set?.username) return set.username;
    } catch (error) {
      // Someone took it a moment before: try the next free one.
      if (violatedConstraint(error) !== 'usernames_lower_idx') throw error;
    }
  }
  return null;
}

/** Everyone without a username gets one, as migration 0077 did (seeds and the demo marketplace call it after writing people). */
export async function backfillUsernames(db: Db): Promise<number> {
  const missing = await db
    .select({ id: users.id })
    .from(users)
    .leftJoin(usernames, eq(usernames.userId, users.id))
    .where(and(isNull(usernames.userId), ne(users.status, 'deleted')))
    .orderBy(users.createdAt, users.id);
  let given = 0;
  for (const { id } of missing) if (await assignUsername(db, id)) given += 1;
  return given;
}

/** When the person may choose another username, or null when they may now. */
export function usernameChangeableAt(changedAt: Date | null, now: Date): Date | null {
  if (!changedAt) return null;
  const at = new Date(changedAt.getTime() + USERNAME_CHANGE_DAYS * 24 * 60 * 60 * 1000);
  return at > now ? at : null;
}

/** A new username from the account page (2026-11-22). */
export async function changeUsername(db: Db, userId: string, input: UsernameInput, now: Date): Promise<ActionResult> {
  const parsed = usernameInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const username = normalizeUsername(parsed.data.username);
  const problem = usernameProblem(username);
  if (problem) return { ok: false, code: 'validation_failed', fieldErrors: { username: [problem] } };
  const [row] = await db.select({ username: usernames.username, changedAt: usernames.changedAt }).from(usernames).where(eq(usernames.userId, userId)).limit(1);
  if (row?.username === username) return { ok: true, code: 'updated' };
  const waitUntil = usernameChangeableAt(row?.changedAt ?? null, now);
  if (waitUntil) return { ok: false, code: 'rate_limited', retryAt: waitUntil.toISOString() };
  const [other] = await db.select({ id: usernames.userId }).from(usernames).where(and(sql`lower(${usernames.username}) = ${username}`, ne(usernames.userId, userId))).limit(1);
  if (other) return { ok: false, code: 'validation_failed', fieldErrors: { username: ['in_use'] } };
  try {
    await db
      .insert(usernames)
      .values({ userId, username, changedAt: now })
      .onConflictDoUpdate({ target: usernames.userId, set: { username, changedAt: now } });
  } catch (error) {
    if (violatedConstraint(error) === 'usernames_lower_idx') return { ok: false, code: 'validation_failed', fieldErrors: { username: ['in_use'] } };
    throw error;
  }
  return { ok: true, code: 'updated' };
}

/** The account with this username (any case, with or without "@"), if it's one people can reach. */
export async function findUserIdByUsername(db: Db, value: string): Promise<string | null> {
  const username = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(username)) return null;
  const [row] = await db
    .select({ id: users.id })
    .from(usernames)
    .innerJoin(users, eq(users.id, usernames.userId))
    .where(and(sql`lower(${usernames.username}) = ${username}`, inArray(users.status, ['active', 'restricted'])))
    .limit(1);
  return row?.id ?? null;
}

/** Usernames by account (the ones that have one; never a deleted account's). */
export async function usernamesOf(db: Db, userIds: readonly string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ id: usernames.userId, username: usernames.username })
    .from(usernames)
    .innerJoin(users, eq(users.id, usernames.userId))
    .where(and(inArray(usernames.userId, [...new Set(userIds)]), ne(users.status, 'deleted')));
  return new Map(rows.map((row) => [row.id, row.username] as const));
}

/** The account page's username and when it may change (absent when it may now). */
export async function usernameFacts(db: Db, userId: string, now: Date): Promise<{ username?: string; usernameChangeableAt?: string }> {
  const [row] = await db.select({ username: usernames.username, changedAt: usernames.changedAt }).from(usernames).where(eq(usernames.userId, userId)).limit(1);
  const at = row ? usernameChangeableAt(row.changedAt, now) : null;
  return { ...(row?.username ? { username: row.username } : {}), ...(at ? { usernameChangeableAt: at.toISOString() } : {}) };
}
