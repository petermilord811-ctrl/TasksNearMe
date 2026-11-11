import sharp, { type OutputInfo } from 'sharp';
import type { Photo, PhotoUploadResult } from '@/contracts';
import type { FileStorage } from '@/integrations/storage';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { files } from '../tasks/schema';

/**
 * Photo uploads (blueprint 02 J1 step 4): every image is decoded and re-encoded, which drops all
 * metadata (EXIF, including GPS) before anyone else can see it. Originals are never stored.
 */

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_EDGE_PX = 2000;
const UPLOAD_RULE = { limit: 40, windowSeconds: 60 * 60 };

export interface UploadDeps {
  db: Db;
  storage: FileStorage;
  now?: () => Date;
}

export function photoFromFile(file: { id: string; width: number; height: number; alt: string }): Photo {
  return { id: file.id, src: `/api/files/${file.id}`, alt: file.alt, width: file.width, height: file.height };
}

export async function storePhoto(
  { db, storage, now = () => new Date() }: UploadDeps,
  input: { userId: string; kind: 'task_photo' | 'work_sample' | 'evidence' | 'receipt'; file: File; alt?: string },
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
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
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
  return { ok: true, photo: photoFromFile(row) };
}
