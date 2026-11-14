import sharp from 'sharp';
import type { PhotoWidth } from './photos';

/**
 * A smaller copy of a stored image for `/api/files/<id>?w=` (completion plan 5.7): at most `width` px on its long
 * edge, never enlarged, WebP like every upload. Made on request and not stored, so no copy outlives its file.
 */
export async function resizedImage(body: Buffer, width: PhotoWidth): Promise<Buffer> {
  return sharp(body, { failOn: 'error' }).resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
}
