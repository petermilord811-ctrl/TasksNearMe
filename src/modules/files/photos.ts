import type { Photo } from '@/contracts';

/** What every photo upload takes (src/modules/files/uploads.ts re-encodes it). */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Profile photos are cropped to a centred square of this size (src/modules/files/uploads.ts). */
export const AVATAR_PX = 512;

/** A stored image as the UI shows it, served through the access-checked file route. */
export function photoFromFile(file: { id: string; width: number; height: number; alt: string }): Photo {
  return { id: file.id, src: `/api/files/${file.id}`, alt: file.alt, width: file.width, height: file.height };
}

/** A profile photo from its file id (always an `AVATAR_PX` square). */
export function avatarPhoto(fileId: string, alt = ''): Photo {
  return { id: fileId, src: `/api/files/${fileId}`, alt, width: AVATAR_PX, height: AVATAR_PX };
}
