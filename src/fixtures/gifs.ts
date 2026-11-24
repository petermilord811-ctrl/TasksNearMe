import type { GifResult, GifSearchError, GifSearchResult, MessageView, Photo, ThreadHandlers, ThreadPageData } from '@/contracts';
import { GIF_PAGE_SIZE } from '@/contracts';
import { SAMPLE_GIFS, matchSampleGifs, sampleGifResult } from '@/shared/gifs';
import { deskBookingThreadPageData } from './messaging';

/**
 * GIFs in chat (2026-11-24): the picker's states and a conversation with a GIF in it. The GIFs are the stand-in's
 * samples (public/samples/gifs), the same ones development and the e2e build use.
 */

/** Trending: every sample. */
export const gifTrendingResults: GifResult[] = SAMPLE_GIFS.map(sampleGifResult);

/** A search for "thanks", with another page to load. */
export const gifSearchQuery = 'thanks';
export const gifSearchResults: GifResult[] = matchSampleGifs(gifSearchQuery).map(sampleGifResult);

/** The picker's states: loading, trending, a search with more to load, nothing found, and two failures. */
export interface GifPanelSeed {
  query: string;
  status: 'loading' | 'ready' | 'error';
  results: GifResult[];
  nextPage?: number;
  error?: GifSearchError;
}
export const gifPanelStates: Record<'loading' | 'trending' | 'results' | 'empty' | 'error' | 'rateLimited', GifPanelSeed> = {
  loading: { query: '', status: 'loading', results: [] },
  trending: { query: '', status: 'ready', results: gifTrendingResults },
  results: { query: gifSearchQuery, status: 'ready', results: gifSearchResults, nextPage: 2 },
  empty: { query: 'zebra crossing', status: 'ready', results: [] },
  error: { query: '', status: 'error', results: [], error: 'unavailable' },
  rateLimited: { query: gifSearchQuery, status: 'error', results: [], error: 'rate_limited' },
};

/** A sent GIF as the conversation shows it. */
export const sentGifPhoto: Photo = { id: 'fil_gif_thank_you', src: '/samples/gifs/thank-you.gif', alt: 'Thank you', width: 160, height: 120, animated: true };

const lastAt = deskBookingThreadPageData.messages.at(-1)?.createdAt ?? '2026-11-21T16:00:00.000Z';
export const gifMessage: MessageView = {
  id: 'msg_gif_thank_you',
  sender: 'them',
  kind: 'text',
  segments: [],
  attachments: [sentGifPhoto],
  createdAt: new Date(Date.parse(lastAt) + 60_000).toISOString(),
};

/** The booking's conversation, ending with a GIF from Jordan. */
export const gifThreadPageData: ThreadPageData = { ...deskBookingThreadPageData, messages: [...deskBookingThreadPageData.messages, gifMessage] };

const later = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/** The samples, searched as the stand-in does; attaching one gives back its GIF as a photo. */
export const fakeGifHandlers: Required<Pick<ThreadHandlers, 'onSearchGifs' | 'onAttachGif'>> = {
  onSearchGifs: ({ q = '', page = 1 }) => {
    const found = matchSampleGifs(q.trim());
    const start = (page - 1) * GIF_PAGE_SIZE;
    const result: GifSearchResult = { ok: true, results: found.slice(start, start + GIF_PAGE_SIZE).map(sampleGifResult), ...(start + GIF_PAGE_SIZE < found.length ? { nextPage: page + 1 } : {}) };
    return later(result);
  },
  onAttachGif: ({ id }) => {
    const sample = SAMPLE_GIFS.find((candidate) => candidate.id === id);
    return later(sample
      ? { ok: true as const, photo: { id: `fil_${sample.id}`, src: `/samples/gifs/${sample.file}.gif`, alt: sample.title, width: 160, height: 120, animated: true as const } }
      : { ok: false as const, code: 'unsupported_type' as const });
  },
};
