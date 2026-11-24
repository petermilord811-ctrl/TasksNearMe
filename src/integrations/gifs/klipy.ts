import { GIF_ID_PATTERN, type GifResult } from '@/contracts';
import { isGifMediaUrl } from '@/shared/gifs';
import { GifTooLargeError, GifUnavailableError, type GifMedia, type GifPage, type GifProvider } from './types';

/**
 * KLIPY's GIF API (2026-11-24; docs.klipy.com, "GIF - Search / Trending / Items API"): Tenor's closed on 2026-06-30 and
 * GIPHY's is no longer free. The key goes in the path. Search and trending answer `{ result, data: { data: [items],
 * current_page, per_page, has_next } }`; an item has `slug`, `title`, `type` ("gif"; ads are other types and are never
 * shown) and `file.{hd,md,sm,xs}.{gif,webp,jpg,mp4,webm}` with `url`, `width`, `height` and `size`, on static.klipy.com.
 * No customer id is sent (it's only needed for ads), and the safest content filter is asked for.
 */

const BASE_URL = 'https://api.klipy.com/api/v1';
const TIMEOUT_MS = 4_000;
const DOWNLOAD_TIMEOUT_MS = 8_000;
const CONTENT_FILTER = 'high';
/** Pages already asked for are kept a while: a test key allows 100 requests an hour, and trending is the same for all. */
const CACHE_MS = 5 * 60_000;
const CACHE_ENTRIES = 200;

type Json = Record<string, unknown>;

function record(value: unknown): Json | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function pixels(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 4000 ? value : null;
}

interface Rendition {
  url: string;
  width: number;
  height: number;
  bytes?: number;
}

/** The first of `sizes` that has `format` on KLIPY's file host, with its size in pixels. */
function rendition(item: Json, sizes: readonly string[], format: 'gif' | 'jpg'): Rendition | null {
  const file = record(item.file);
  for (const name of sizes) {
    const found = record(record(file?.[name])?.[format]);
    if (!found || !isGifMediaUrl(found.url)) continue;
    const width = pixels(found.width);
    const height = pixels(found.height);
    if (!width || !height) continue;
    const bytes = typeof found.size === 'number' && found.size > 0 ? found.size : undefined;
    return { url: found.url, width, height, ...(bytes ? { bytes } : {}) };
  }
  return null;
}

function titleOf(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 140) : '';
}

/** One of KLIPY's items as the picker shows it: the small GIF, and a still. Null for ads and anything unusable. */
export function mapKlipyItem(value: unknown): GifResult | null {
  const item = record(value);
  if (!item || item.type !== 'gif') return null;
  const id = typeof item.slug === 'string' ? item.slug : '';
  if (!GIF_ID_PATTERN.test(id)) return null;
  const preview = rendition(item, ['sm', 'xs', 'md'], 'gif');
  if (!preview) return null;
  const still = rendition(item, ['sm', 'xs', 'md'], 'jpg');
  return { id, title: titleOf(item.title), preview: { src: preview.url, width: preview.width, height: preview.height }, ...(still ? { still: still.url } : {}) };
}

function itemsOf(body: unknown): unknown[] {
  const root = record(body);
  if (!root || root.result !== true) throw new GifUnavailableError('KLIPY answered without a result');
  const data = record(root.data);
  return Array.isArray(data?.data) ? data.data : [];
}

/** A search or trending page: GIFs only (ads and repeats left out), and whether there's another page. */
export function mapKlipyPage(body: unknown): GifPage {
  const seen = new Set<string>();
  const results = itemsOf(body).flatMap((item) => {
    const gif = mapKlipyItem(item);
    if (!gif || seen.has(gif.id)) return [];
    seen.add(gif.id);
    return [gif];
  });
  return { results, hasMore: record(record(body)?.data)?.has_next === true };
}

/** The rendition the server stores for an item: the medium GIF when it fits, else a smaller one. */
export function storedKlipyMedia(value: unknown, maxBytes: number): GifMedia | null {
  const item = record(value);
  if (!item || item.type !== 'gif' || typeof item.slug !== 'string') return null;
  for (const size of ['md', 'sm', 'xs']) {
    const found = rendition(item, [size], 'gif');
    if (found && (found.bytes === undefined || found.bytes <= maxBytes)) {
      return { id: item.slug, title: titleOf(item.title), url: found.url, ...(found.bytes ? { bytes: found.bytes } : {}) };
    }
  }
  return null;
}

export function createKlipyGifs(apiKey: string, fetchImpl: typeof fetch = fetch, clock: () => number = Date.now): GifProvider {
  const cache = new Map<string, { at: number; page: GifPage }>();

  // The address carries the key: it never goes into an error or a log.
  async function getJson(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(apiKey)}/gifs/${path}`, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new GifUnavailableError('KLIPY did not answer');
    }
    if (!response.ok) throw new GifUnavailableError(`KLIPY answered ${response.status}`);
    try {
      return await response.json();
    } catch {
      throw new GifUnavailableError('KLIPY answered with something other than JSON');
    }
  }

  return {
    name: 'klipy',
    async search({ q, page, perPage }) {
      const key = `${q.toLocaleLowerCase()}\n${page}\n${perPage}`;
      const cached = cache.get(key);
      if (cached && clock() - cached.at < CACHE_MS) return cached.page;
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage), content_filter: CONTENT_FILTER });
      if (q) params.set('q', q);
      const found = mapKlipyPage(await getJson(`${q ? 'search' : 'trending'}?${params}`));
      cache.delete(key);
      cache.set(key, { at: clock(), page: found });
      if (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
      return found;
    },
    async find(id, maxBytes) {
      if (!GIF_ID_PATTERN.test(id)) return null;
      const items = itemsOf(await getJson(`items?${new URLSearchParams({ slugs: id })}`));
      const item = items.find((candidate) => record(candidate)?.slug === id);
      return item ? storedKlipyMedia(item, maxBytes) : null;
    },
    async download(media, maxBytes) {
      if (!isGifMediaUrl(media.url)) throw new GifUnavailableError('Not on KLIPY’s file host');
      if (media.bytes !== undefined && media.bytes > maxBytes) throw new GifTooLargeError('Too large');
      let response: Response;
      try {
        response = await fetchImpl(media.url, { redirect: 'error', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      } catch {
        throw new GifUnavailableError('The GIF did not download');
      }
      if (!response.ok || !response.body) throw new GifUnavailableError(`The file host answered ${response.status}`);
      if (Number(response.headers.get('content-length') ?? 0) > maxBytes) throw new GifTooLargeError('Too large');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new GifTooLargeError('Too large');
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    },
  };
}
