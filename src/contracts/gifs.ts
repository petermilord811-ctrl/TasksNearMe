import { z } from 'zod';

/**
 * GIFs in chat (2026-11-24, owner: "And if possible, add gif feature."). The composer's GIF button opens a picker:
 * trending first, then a search. A picked GIF goes at once as its own message: the server fetches it again by its id
 * (never by an address the browser sends), stores it like a message photo, and the message shows it animated
 * (`Photo.animated`). GIFs come from KLIPY; development and tests use small samples instead (public/samples/gifs).
 */

/** One GIF in the picker. */
export interface GifResult {
  /** The provider's id for it (KLIPY's slug). All the server takes to attach it. */
  id: string;
  /** What it shows, from the provider: the picker's alt text. Empty when the provider has none. */
  title: string;
  /** The small animated rendition the picker shows. */
  preview: { src: string; width: number; height: number };
  /** A still of it, shown instead to people who asked their device for reduced motion. Absent: none. */
  still?: string;
}

/** Results per page in the picker. */
export const GIF_PAGE_SIZE = 24;
/** Pages a search can go to with "Load more". */
export const GIF_MAX_PAGES = 10;
export const GIF_QUERY_MAX = 100;

/** A search (`q`), or trending when `q` is empty. Pages start at 1. */
export const gifSearchInputSchema = z.object({
  q: z.string().trim().max(GIF_QUERY_MAX).default(''),
  page: z.number().int().min(1).max(GIF_MAX_PAGES).default(1),
});
export type GifSearchInput = z.input<typeof gifSearchInputSchema>;

/** Why a search found nothing to show: too many searches this minute (60), or the provider didn't answer. */
export const GIF_SEARCH_ERRORS = ['rate_limited', 'unavailable'] as const;
export type GifSearchError = (typeof GIF_SEARCH_ERRORS)[number];

/** One page of GIFs; `nextPage` when there are more ("Load more"). */
export type GifSearchResult = { ok: true; results: GifResult[]; nextPage?: number } | { ok: false; code: GifSearchError };

/** Attaching a picked GIF: its id only. */
export interface AttachGifInput {
  id: string;
}

/** What a GIF id looks like (KLIPY's slugs, and the samples'). Anything else is refused before any lookup. */
export const GIF_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
