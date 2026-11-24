import type { GifResult } from '@/contracts';

/** One page of a provider's GIFs. */
export interface GifPage {
  results: GifResult[];
  hasMore: boolean;
}

/** A GIF the server may store: what it shows, and the one rendition to download. */
export interface GifMedia {
  id: string;
  title: string;
  url: string;
  /** The provider's size for that rendition, in bytes, when it says (checked again while downloading). */
  bytes?: number;
}

/**
 * Where GIFs come from (2026-11-24): KLIPY, or the stand-in's samples. `search` with an empty query is trending.
 * `find` looks a GIF up again by its id (null: unknown), with the rendition to store (at most `maxBytes` when the
 * provider says its size); `download` fetches that rendition, at most `maxBytes`.
 */
export interface GifProvider {
  readonly name: 'klipy' | 'stand-in';
  search(input: { q: string; page: number; perPage: number }): Promise<GifPage>;
  find(id: string, maxBytes: number): Promise<GifMedia | null>;
  download(media: GifMedia, maxBytes: number): Promise<Buffer>;
}

/** The provider didn't answer in time, or answered with something unusable. */
export class GifUnavailableError extends Error {}

/** The rendition is bigger than the server stores. */
export class GifTooLargeError extends Error {}
