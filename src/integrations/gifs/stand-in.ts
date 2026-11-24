import fs from 'node:fs/promises';
import path from 'node:path';
import { SAMPLE_GIFS, matchSampleGifs, sampleGifResult } from '@/shared/gifs';
import { GifTooLargeError, GifUnavailableError, type GifProvider } from './types';

/**
 * Development and tests (2026-11-24): the samples in public/samples/gifs, found by their titles and tags, read from
 * disk when one is attached. No provider and no network.
 */
export function createStandInGifs(dir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'samples', 'gifs')): GifProvider {
  return {
    name: 'stand-in',
    async search({ q, page, perPage }) {
      const found = matchSampleGifs(q);
      const start = (page - 1) * perPage;
      return { results: found.slice(start, start + perPage).map(sampleGifResult), hasMore: start + perPage < found.length };
    },
    async find(id) {
      const sample = SAMPLE_GIFS.find((candidate) => candidate.id === id);
      return sample ? { id: sample.id, title: sample.title, url: `/samples/gifs/${sample.file}.gif` } : null;
    },
    async download(media, maxBytes) {
      const sample = SAMPLE_GIFS.find((candidate) => candidate.id === media.id);
      if (!sample) throw new GifUnavailableError('Not a sample');
      const bytes = await fs.readFile(path.join(dir, `${sample.file}.gif`));
      if (bytes.length > maxBytes) throw new GifTooLargeError('Too large');
      return bytes;
    },
  };
}
