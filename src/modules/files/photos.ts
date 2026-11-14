import type { Photo } from '@/contracts';

/** What every photo upload takes (src/modules/files/uploads.ts re-encodes it). */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Profile photos are cropped to a centred square of this size (src/modules/files/uploads.ts). */
export const AVATAR_PX = 512;

/**
 * Smaller copies the file route makes on request (`/api/files/<id>?w=…`, completion plan 5.7): 256 for profile
 * photos (shown at 96 px at most), 1280 for photos (uploads keep up to 2000 px; a page never shows one wider than
 * about 640 px, so 1280 covers a 2× screen). Nothing extra is stored, so deleting a file deletes every size of it.
 */
export const PHOTO_WIDTHS = [256, 1280] as const;
export type PhotoWidth = (typeof PHOTO_WIDTHS)[number];
const PHOTO_SHOWN_PX: PhotoWidth = 1280;
const AVATAR_SHOWN_PX: PhotoWidth = 256;

/** The file route's address for a stored image, at most `max` px on its long edge. */
export function photoSrc(file: { id: string; width: number; height: number }, max: PhotoWidth = PHOTO_SHOWN_PX): string {
  return Math.max(file.width, file.height) > max ? `/api/files/${file.id}?w=${max}` : `/api/files/${file.id}`;
}

/** A stored image as the UI shows it, served through the access-checked file route. */
export function photoFromFile(file: { id: string; width: number; height: number; alt: string }): Photo {
  return { id: file.id, src: photoSrc(file), alt: file.alt, width: file.width, height: file.height };
}

/** A profile photo from its file id (stored as an `AVATAR_PX` square, served at 256). */
export function avatarPhoto(fileId: string, alt = ''): Photo {
  return { id: fileId, src: photoSrc({ id: fileId, width: AVATAR_PX, height: AVATAR_PX }, AVATAR_SHOWN_PX), alt, width: AVATAR_SHOWN_PX, height: AVATAR_SHOWN_PX };
}
