import sharp from 'sharp';
import { GIF_ID_PATTERN, GIF_MAX_PAGES, GIF_PAGE_SIZE, gifSearchInputSchema, type GifSearchResult, type PhotoUploadResult } from '@/contracts';
import { GifTooLargeError, GifUnavailableError, type GifProvider } from '@/integrations/gifs/types';
import { photoFromFile } from '@/modules/files/photos';
import type { UploadDeps } from '@/modules/files/uploads';
import { files } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';

/**
 * GIFs in chat (2026-11-24, owner: "And if possible, add gif feature."). The picker searches through the server, which
 * holds the key and limits each person to 60 searches a minute. A picked GIF is attached by its id only: the server
 * looks it up at the provider again, downloads its one rendition from KLIPY's file host (no address from the browser,
 * no redirects), checks it's a real animated GIF of a sane size, and stores it as it came, as a message photo
 * (`image/gif`, so it shows animated: photos.ts). It then goes like a photo with `sendMessage`.
 */

export const GIF_SEARCH_RULE = { limit: 60, windowSeconds: 60 };
/** GIFs stored per person an hour: their own allowance, apart from photo uploads. */
export const GIF_ATTACH_RULE = { limit: 60, windowSeconds: 60 * 60 };
export const MAX_GIF_BYTES = 4 * 1024 * 1024;
const MIN_EDGE_PX = 16;
const MAX_EDGE_PX = 1000;
const MAX_FRAMES = 600;

function logFailure(what: string, error: unknown): void {
  // Our own messages only (never an address: KLIPY's carry the key).
  console.warn(`GIFs: ${what} failed: ${error instanceof GifUnavailableError || error instanceof GifTooLargeError ? error.message : 'unexpected error'}`);
}

/** A page of trending GIFs (empty `q`) or of a search. */
export async function searchGifs(db: Db, userId: string, input: unknown, now: Date, provider: GifProvider | null): Promise<GifSearchResult> {
  if (!provider) return { ok: false, code: 'unavailable' };
  const parsed = gifSearchInputSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, code: 'unavailable' };
  const limited = await consumeRateLimit(db, `gifs:search:user:${userId}`, GIF_SEARCH_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited' };
  const { q, page } = parsed.data;
  try {
    const found = await provider.search({ q, page, perPage: GIF_PAGE_SIZE });
    return { ok: true, results: found.results, ...(found.hasMore && page < GIF_MAX_PAGES ? { nextPage: page + 1 } : {}) };
  } catch (error) {
    logFailure('search', error);
    return { ok: false, code: 'unavailable' };
  }
}

/** The frame size of an animated GIF, or null when the bytes are anything else (or absurd). */
export async function animatedGifSize(bytes: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(bytes, { animated: true, failOn: 'error' }).metadata();
    const width = meta.width ?? 0;
    const height = meta.pageHeight ?? meta.height ?? 0;
    const frames = meta.pages ?? 1;
    if (meta.format !== 'gif' || frames < 2 || frames > MAX_FRAMES) return null;
    if (width < MIN_EDGE_PX || height < MIN_EDGE_PX || width > MAX_EDGE_PX || height > MAX_EDGE_PX) return null;
    return { width, height };
  } catch {
    return null;
  }
}

/**
 * Attach a picked GIF by its id: ok with the stored photo (`animated`), to send with `sendMessage`. Errors:
 * `unsupported_type` (an unknown id, or not an animated GIF), `too_large` (over 4 MB), `rate_limited`, `unknown`
 * (GIFs are off, or the provider didn't answer).
 */
export async function attachGif({ db, storage, now = () => new Date() }: UploadDeps, input: { userId: string; id: unknown }, provider: GifProvider | null): Promise<PhotoUploadResult> {
  if (!provider) return { ok: false, code: 'unknown' };
  const id = typeof input.id === 'string' ? input.id : '';
  if (!GIF_ID_PATTERN.test(id)) return { ok: false, code: 'unsupported_type' };
  const limited = await consumeRateLimit(db, `gifs:attach:user:${input.userId}`, GIF_ATTACH_RULE, now());
  if (!limited.ok) return { ok: false, code: 'rate_limited' };

  let bytes: Buffer;
  let title: string;
  try {
    const media = await provider.find(id, MAX_GIF_BYTES);
    if (!media) return { ok: false, code: 'unsupported_type' };
    title = media.title;
    bytes = await provider.download(media, MAX_GIF_BYTES);
  } catch (error) {
    if (error instanceof GifTooLargeError) return { ok: false, code: 'too_large' };
    logFailure('attach', error);
    return { ok: false, code: 'unknown' };
  }
  if (bytes.length > MAX_GIF_BYTES) return { ok: false, code: 'too_large' };
  const size = await animatedGifSize(bytes);
  if (!size) return { ok: false, code: 'unsupported_type' };

  const fileId = newId('fil');
  const storageKey = `message/${fileId}.gif`;
  await storage.put(storageKey, bytes, 'image/gif');
  const row = { id: fileId, ownerUserId: input.userId, kind: 'message', storageKey, contentType: 'image/gif', width: size.width, height: size.height, bytes: bytes.length, alt: title.slice(0, 200), createdAt: now() };
  await db.insert(files).values(row);
  return { ok: true, photo: photoFromFile(row) };
}
