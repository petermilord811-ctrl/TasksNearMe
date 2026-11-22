import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { communityFollowInputSchema, type ActionResult, type CommunityFollowInput, type CommunityFollowState } from '@/contracts';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { communityFollows } from './schema';

/**
 * Following a post (plan 10.9): its author, people who reply to it or save it, and anyone who taps Follow hear about
 * its new replies, at most once a post an hour (the notice's `followNoticeKey`). Mute stops that for good: replying
 * again doesn't follow a muted post again. "Neither" forgets the row, so a later reply follows it once more.
 */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** The viewer's state on each post (`none` when they never followed or muted it). */
export async function followStatesOf(db: Db, userId: string, postIds: readonly string[]): Promise<Map<string, CommunityFollowState>> {
  const states = new Map<string, CommunityFollowState>();
  if (postIds.length === 0) return states;
  const rows = await db.select({ postId: communityFollows.postId, state: communityFollows.state }).from(communityFollows).where(and(eq(communityFollows.userId, userId), inArray(communityFollows.postId, [...postIds])));
  for (const row of rows) states.set(row.postId, row.state === 'muted' ? 'muted' : 'following');
  return states;
}

/** Follows a post for someone who just wrote, replied to or saved it, unless they muted it (inside its transaction). */
export async function autoFollow(tx: Tx | Db, userId: string, postId: string, now: Date): Promise<void> {
  await tx.insert(communityFollows).values({ userId, postId, state: 'following', createdAt: now, updatedAt: now }).onConflictDoNothing();
}

/** Sets the viewer's state on a post they can read (`canRead` checks that first). */
export async function setFollowState(db: Db, userId: string, input: CommunityFollowInput, now: Date, canRead: (postId: string) => Promise<boolean>): Promise<ActionResult> {
  const parsed = communityFollowInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { postId, state } = parsed.data;
  if (state === 'none') {
    await db.delete(communityFollows).where(and(eq(communityFollows.userId, userId), eq(communityFollows.postId, postId)));
    return { ok: true, code: 'updated' };
  }
  if (!(await canRead(postId))) return { ok: false, code: 'not_found' };
  await db
    .insert(communityFollows)
    .values({ userId, postId, state, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [communityFollows.userId, communityFollows.postId], set: { state, updatedAt: now } });
  return { ok: true, code: 'updated' };
}

/** Who follows a post now (not muted), leaving out `exclude`. */
export async function followersOf(db: Db, postId: string, exclude: readonly string[]): Promise<string[]> {
  const conditions = [eq(communityFollows.postId, postId), eq(communityFollows.state, 'following')];
  if (exclude.length > 0) conditions.push(notInArray(communityFollows.userId, [...exclude]));
  const rows = await db.select({ userId: communityFollows.userId }).from(communityFollows).where(and(...conditions)).orderBy(sql`${communityFollows.createdAt} asc`).limit(500);
  return rows.map((row) => row.userId);
}

/** Who muted a post (never told about it, not even as the author or a person replied to). */
export async function mutedOf(db: Db, postId: string, userIds: readonly string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.select({ userId: communityFollows.userId }).from(communityFollows).where(and(eq(communityFollows.postId, postId), eq(communityFollows.state, 'muted'), inArray(communityFollows.userId, [...userIds])));
  return new Set(rows.map((row) => row.userId));
}
