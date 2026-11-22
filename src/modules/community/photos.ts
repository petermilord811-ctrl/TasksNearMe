import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Photo } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { photoFromFile } from '@/modules/files/photos';
import { staffPhotoFromFile } from '@/modules/files/staff-file-token';
import { files } from '@/modules/tasks/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import type { Db } from '@/platform/db/connect';
import { communityPhotos, communityPosts, communityReplies } from './schema';

/**
 * Photos on Neighbors (plan 10.1): uploaded as files of kind `community_photo` (src/modules/files/uploads.ts re-encodes
 * each and drops every bit of metadata, location included), attached when the post or reply is written, and shown to
 * whoever may read what they're on.
 */
export const COMMUNITY_PHOTO_KIND = 'community_photo';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Which of these uploads the person may attach: their own community photos not on anything yet, in the order given,
 * each once. `null` when any of them isn't (someone else's file, another kind, already used), so the post is refused
 * rather than posted with fewer photos than the author saw.
 */
export async function attachablePhotoIds(db: Db, userId: string, fileIds: readonly string[], max: number): Promise<string[] | null> {
  const ids = [...new Set(fileIds.map((id) => String(id)))];
  if (ids.length === 0) return [];
  if (ids.length > max || ids.length !== fileIds.length) return null;
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .leftJoin(communityPhotos, eq(communityPhotos.fileId, files.id))
    .where(and(inArray(files.id, ids), eq(files.ownerUserId, userId), eq(files.kind, COMMUNITY_PHOTO_KIND), isNull(communityPhotos.fileId)));
  return rows.length === ids.length ? ids : null;
}

/** Attaches checked photos to a new post or reply, in order (inside the transaction that writes it). */
export async function attachPhotos(tx: Tx, input: { postId: string; replyId?: string; fileIds: readonly string[]; now: Date }): Promise<void> {
  if (input.fileIds.length === 0) return;
  await tx.insert(communityPhotos).values(input.fileIds.map((fileId, position) => ({ fileId, postId: input.postId, replyId: input.replyId ?? null, position, createdAt: input.now })));
}

/**
 * The photos of these posts and their replies, as the screens show them. For a staff reader of something hidden
 * (`staffFor`), each comes with a short-lived staff token (src/modules/files/staff-file-token.ts), as on staff pages.
 */
export async function photosOf(db: Db, postIds: readonly string[], staffFor?: { staffId: string; hiddenIds: ReadonlySet<string>; now: Date }): Promise<{ posts: Map<string, Photo[]>; replies: Map<string, Photo> }> {
  const posts = new Map<string, Photo[]>();
  const replies = new Map<string, Photo>();
  if (postIds.length === 0) return { posts, replies };
  const rows = await db
    .select({ postId: communityPhotos.postId, replyId: communityPhotos.replyId, id: files.id, width: files.width, height: files.height, alt: files.alt, ownerUserId: files.ownerUserId })
    .from(communityPhotos)
    .innerJoin(files, eq(files.id, communityPhotos.fileId))
    .where(inArray(communityPhotos.postId, [...postIds]))
    .orderBy(asc(communityPhotos.position), asc(communityPhotos.createdAt));
  for (const row of rows) {
    if (!row.width || !row.height) continue;
    const hidden = staffFor && (staffFor.hiddenIds.has(row.postId) || (row.replyId !== null && staffFor.hiddenIds.has(row.replyId)));
    const photo = hidden && staffFor ? staffPhotoFromFile(row, { id: staffFor.staffId }, `community:${row.replyId ?? row.postId}`, staffFor.now) : photoFromFile(row);
    if (row.replyId) {
      if (!replies.has(row.replyId)) replies.set(row.replyId, photo);
    } else posts.set(row.postId, [...(posts.get(row.postId) ?? []), photo]);
  }
  return { posts, replies };
}

/**
 * Whether someone may see a community photo (src/modules/files/related-access.ts): a member of the post's market who
 * may read it now (visible, its author and the reply's author not blocked either way). Its uploader always may
 * (`canViewFile`), staff through their token.
 */
export async function canViewCommunityPhoto(db: Db, fileId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ postId: communityPhotos.postId, replyId: communityPhotos.replyId, marketId: communityPosts.marketId, postStatus: communityPosts.status, postAuthor: communityPosts.authorUserId })
    .from(communityPhotos)
    .innerJoin(communityPosts, eq(communityPosts.id, communityPhotos.postId))
    .where(eq(communityPhotos.fileId, fileId))
    .limit(1);
  if (!row || row.postStatus !== 'visible') return false;
  const [viewer] = await db.select({ marketId: users.homeMarketId, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!viewer || viewer.marketId !== row.marketId || viewer.status === 'banned' || viewer.status === 'deleted') return false;
  if (await isBlockedBetween(db, userId, row.postAuthor)) return false;
  if (!row.replyId) return true;
  const [reply] = await db.select({ status: communityReplies.status, authorUserId: communityReplies.authorUserId }).from(communityReplies).where(eq(communityReplies.id, row.replyId)).limit(1);
  return Boolean(reply && reply.status === 'visible' && !(await isBlockedBetween(db, userId, reply.authorUserId)));
}
