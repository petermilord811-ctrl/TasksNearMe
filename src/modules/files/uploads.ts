import sharp, { type OutputInfo } from 'sharp';
import type { PhotoUploadResult } from '@/contracts';
import type { FileStorage } from '@/integrations/storage';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { files } from '../tasks/schema';
import { ACCEPTED_IMAGE_TYPES, AVATAR_PX, MAX_PHOTO_BYTES, avatarPhoto, photoFromFile } from './photos';

/**
 * Photo uploads (blueprint 02 J1 step 4): every image is decoded and re-encoded, which drops all
 * metadata (EXIF, including GPS) before anyone else can see it. Originals are never stored.
 */

const MAX_EDGE_PX = 2000;
const UPLOAD_RULE = { limit: 40, windowSeconds: 60 * 60 };

export interface UploadDeps {
  db: Db;
  storage: FileStorage;
  now?: () => Date;
}

export { ACCEPTED_IMAGE_TYPES, AVATAR_PX, avatarPhoto, MAX_PHOTO_BYTES, photoFromFile } from './photos';

export async function storePhoto(
  { db, storage, now = () => new Date() }: UploadDeps,
  input: { userId: string; kind: 'task_photo' | 'work_sample' | 'evidence' | 'receipt' | 'message' | 'avatar' | 'community_photo' | 'group_photo'; file: File; alt?: string },
): Promise<PhotoUploadResult> {
  const { file } = input;
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return { ok: false, code: 'unsupported_type' };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, code: 'too_large' };

  const limited = await consumeRateLimit(db, `uploads:user:${input.userId}`, UPLOAD_RULE, now());
  if (!limited.ok) return { ok: false, code: 'rate_limited' };

  let encoded: { data: Buffer; info: OutputInfo };
  try {
    encoded = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: 'error' })
      .rotate() // apply the camera orientation before the metadata is dropped
      .resize(
        input.kind === 'avatar'
          ? { width: AVATAR_PX, height: AVATAR_PX, fit: 'cover', position: 'attention' }
          : { width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true },
      )
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    // Unreadable images, and HEIC where the image library can't decode it.
    return { ok: false, code: 'unsupported_type' };
  }

  const id = newId('fil');
  const storageKey = `${input.kind}/${id}.webp`;
  await storage.put(storageKey, encoded.data, 'image/webp');
  const row = {
    id,
    ownerUserId: input.userId,
    kind: input.kind,
    storageKey,
    contentType: 'image/webp',
    width: encoded.info.width,
    height: encoded.info.height,
    bytes: encoded.data.length,
    alt: input.alt ?? '',
    createdAt: now(),
  };
  await db.insert(files).values(row);
  // A profile photo comes back at the size it's shown everywhere (photos.ts), so the page and the menu agree.
  return { ok: true, photo: input.kind === 'avatar' ? avatarPhoto(row.id, row.alt) : photoFromFile(row) };
}
