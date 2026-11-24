import type { GifResult } from '@/contracts';

/**
 * Where GIF media may come from (2026-11-24): KLIPY's file host. The picker's previews load from it (the Content
 * Security Policy's img-src, src/shared/csp.ts), and the server downloads a picked GIF only from it
 * (src/integrations/gifs), over https, without redirects.
 */
export const GIF_MEDIA_HOSTS = ['static.klipy.com'] as const;

export function isGifMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.port === '' && !url.username && !url.password && (GIF_MEDIA_HOSTS as readonly string[]).includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * The stand-in's GIFs (development, previews and tests; no provider, no network): small animated GIFs in
 * public/samples/gifs, each with a still of its first frame. `tags` are what a search matches, in English and Spanish.
 */
export const SAMPLE_GIFS = [
  { id: 'sample-hello', file: 'hello', title: 'Waving hello', tags: ['hi', 'hello', 'wave', 'hola', 'saludo'] },
  { id: 'sample-thumbs-up', file: 'thumbs-up', title: 'Thumbs up', tags: ['ok', 'yes', 'good', 'great', 'sí', 'bien'] },
  { id: 'sample-party', file: 'party', title: 'Party time', tags: ['party', 'celebrate', 'yay', 'fiesta'] },
  { id: 'sample-heart', file: 'heart', title: 'Big heart', tags: ['love', 'heart', 'thanks', 'amor', 'corazón'] },
  { id: 'sample-thank-you', file: 'thank-you', title: 'Thank you', tags: ['thanks', 'thank you', 'grateful', 'gracias'] },
  { id: 'sample-sunny', file: 'sunny', title: 'Sunny day', tags: ['sun', 'sunny', 'good morning', 'sol', 'buenos días'] },
] as const;
export type SampleGif = (typeof SAMPLE_GIFS)[number];
export const SAMPLE_GIF_SIZE = { width: 160, height: 120 } as const;

/** A sample as the picker shows it. */
export function sampleGifResult(sample: SampleGif): GifResult {
  return { id: sample.id, title: sample.title, preview: { src: `/samples/gifs/${sample.file}.gif`, ...SAMPLE_GIF_SIZE }, still: `/samples/gifs/${sample.file}-still.png` };
}

/** The samples a search finds: every one whose title or tags contain the words (all of them), or all for trending. */
export function matchSampleGifs(query: string): SampleGif[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...SAMPLE_GIFS];
  return SAMPLE_GIFS.filter((sample) => {
    const text = [sample.title, ...sample.tags].join(' ').toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}
