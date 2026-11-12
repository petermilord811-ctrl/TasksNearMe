import 'server-only';
import { eq } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import type { ActionResult, PhotoUploadResult } from '@/contracts';
import { storePhoto, type UploadDeps } from '@/modules/files/uploads';
import { helperProfiles } from '@/modules/profiles/schema';
import type { Db } from '@/platform/db/connect';
import { users } from './schema';

/**
 * The account's profile photo (AccountHandlers.onUploadPhoto / onRemovePhoto, and the helper profile
 * editor). Uploads are re-encoded and cropped to a square around the face or subject (files/uploads.ts).
 * Only the current photo is public (files/related-access.ts): a replaced or removed one stops showing.
 */

export async function setProfilePhoto(deps: UploadDeps, userId: string, file: File): Promise<PhotoUploadResult> {
  const [user] = await deps.db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { ok: false, code: 'unknown' };
  const uploaded = await storePhoto(deps, { userId, kind: 'avatar', file, alt: user.name });
  if (!uploaded.ok) return uploaded;
  await deps.db.update(users).set({ avatarFileId: uploaded.photo.id, updatedAt: (deps.now ?? (() => new Date()))() }).where(eq(users.id, userId));
  return uploaded;
}

export async function removeProfilePhoto(db: Db, userId: string, now: Date): Promise<ActionResult> {
  await db.update(users).set({ avatarFileId: null, updatedAt: now }).where(eq(users.id, userId));
  return { ok: true, code: 'updated' };
}

/**
 * After a change that shows on a helper's public profile (the photo, the name): its cached pages and the
 * helper lists refresh. Server Actions only (`updateTag`). Nothing to do for people without a helper profile.
 */
export async function refreshPublicProfile(db: Db, userId: string): Promise<void> {
  const [profile] = await db.select({ handle: helperProfiles.handle }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  if (!profile) return;
  updateTag('helpers');
  updateTag(`helper:${profile.handle}`);
}
