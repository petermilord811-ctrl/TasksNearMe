import { describe, expect, it, vi } from 'vitest';
import { createKlipyGifs, mapKlipyItem, mapKlipyPage, storedKlipyMedia } from './klipy';
import { createStandInGifs } from './stand-in';
import { GifTooLargeError, GifUnavailableError } from './types';

const file = (name: string, width: number, height: number, size = 50_000, host = 'static.klipy.com') => ({
  gif: { url: `https://${host}/ii/abc/${name}.gif`, width, height, size },
  jpg: { url: `https://${host}/ii/abc/${name}.jpg`, width, height, size: 4_000 },
  webp: { url: `https://${host}/ii/abc/${name}.webp`, width, height, size: 20_000 },
});
const item = (slug: string, extra: Record<string, unknown> = {}) => ({
  id: 1, slug, title: ` Dancing  ${slug} `, type: 'gif', tags: [], blur_preview: 'data:image/jpeg;base64,AAAA',
  file: { hd: file('hd', 498, 498, 3_000_000), md: file('md', 498, 498, 2_000_000), sm: file('sm', 220, 220), xs: file('xs', 90, 90) },
  ...extra,
});
const page = (items: unknown[], hasNext = false) => ({ result: true, data: { data: items, current_page: 1, per_page: 24, has_next: hasNext } });

describe('KLIPY results', () => {
  it('maps a GIF to its small rendition and still, and skips ads, other kinds, foreign hosts and repeats', () => {
    expect(mapKlipyItem(item('cat-dance-1'))).toEqual({
      id: 'cat-dance-1', title: 'Dancing cat-dance-1',
      preview: { src: 'https://static.klipy.com/ii/abc/sm.gif', width: 220, height: 220 },
      still: 'https://static.klipy.com/ii/abc/sm.jpg',
    });
    const ad = { type: 'ad', content: '<div>Buy now</div>', width: 320, height: 50 };
    const sticker = item('sticker-1', { type: 'sticker' });
    const elsewhere = item('elsewhere-1', { file: { sm: file('sm', 220, 220, 1000, 'evil.example.com') } });
    const badSlug = item('../../etc/passwd');
    const found = mapKlipyPage(page([ad, item('cat-dance-1'), sticker, elsewhere, badSlug, item('cat-dance-1'), item('dog-2')], true));
    expect(found.results.map((gif) => gif.id)).toEqual(['cat-dance-1', 'dog-2']);
    expect(found.hasMore).toBe(true);
    expect(() => mapKlipyPage({ result: false })).toThrow(GifUnavailableError);
  });

  it('stores the medium GIF when it fits, else a smaller one', () => {
    expect(storedKlipyMedia(item('cat-1'), 4_000_000)).toEqual({ id: 'cat-1', title: 'Dancing cat-1', url: 'https://static.klipy.com/ii/abc/md.gif', bytes: 2_000_000 });
    expect(storedKlipyMedia(item('cat-1'), 1_000_000)?.url).toBe('https://static.klipy.com/ii/abc/sm.gif');
    expect(storedKlipyMedia({ type: 'ad', slug: 'x' }, 4_000_000)).toBeNull();
  });
});

describe('the KLIPY client', () => {
  it('asks for trending or a search with the safest filter, keeps pages a while, and looks one GIF up by its slug', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const address = String(url);
      return new Response(JSON.stringify(address.includes('/gifs/items') ? page([item('cat-1')]) : page([item('cat-1'), item('dog-2')], true)), { status: 200 });
    });
    const klipy = createKlipyGifs('test-key', fetchImpl as unknown as typeof fetch);
    expect((await klipy.search({ q: '', page: 1, perPage: 24 })).results).toHaveLength(2);
    await klipy.search({ q: '', page: 1, perPage: 24 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const trendingUrl = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(trendingUrl.origin + trendingUrl.pathname).toBe('https://api.klipy.com/api/v1/test-key/gifs/trending');
    expect(Object.fromEntries(trendingUrl.searchParams)).toEqual({ page: '1', per_page: '24', content_filter: 'high' });
    await klipy.search({ q: 'happy dance', page: 2, perPage: 24 });
    const searchUrl = new URL(String(fetchImpl.mock.calls[1]![0]));
    expect(searchUrl.pathname).toBe('/api/v1/test-key/gifs/search');
    expect(searchUrl.searchParams.get('q')).toBe('happy dance');
    expect(await klipy.find('cat-1', 4_000_000)).toMatchObject({ id: 'cat-1', url: 'https://static.klipy.com/ii/abc/md.gif' });
    expect(new URL(String(fetchImpl.mock.calls[2]![0])).searchParams.get('slugs')).toBe('cat-1');
    expect(await klipy.find('not-there', 4_000_000)).toBeNull();
  });

  it('refuses to download from anywhere but KLIPY’s file host, and stops past the size', async () => {
    const big = new Uint8Array(3_000);
    const fetchImpl = vi.fn(async () => new Response(big, { status: 200 }));
    const klipy = createKlipyGifs('test-key', fetchImpl as unknown as typeof fetch);
    await expect(klipy.download({ id: 'x', title: '', url: 'http://169.254.169.254/latest/meta-data' }, 4_000_000)).rejects.toThrow(GifUnavailableError);
    await expect(klipy.download({ id: 'x', title: '', url: 'https://static.klipy.com.evil.example/a.gif' }, 4_000_000)).rejects.toThrow(GifUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(klipy.download({ id: 'x', title: '', url: 'https://static.klipy.com/ii/a.gif' }, 1_000)).rejects.toThrow(GifTooLargeError);
    expect((await klipy.download({ id: 'x', title: '', url: 'https://static.klipy.com/ii/a.gif' }, 4_000)).length).toBe(3_000);
    expect(fetchImpl).toHaveBeenLastCalledWith('https://static.klipy.com/ii/a.gif', expect.objectContaining({ redirect: 'error' }));
  });
});

describe('the stand-in', () => {
  it('finds samples by their words, and reads one from disk', async () => {
    const standIn = createStandInGifs();
    expect((await standIn.search({ q: '', page: 1, perPage: 24 })).results).toHaveLength(6);
    expect((await standIn.search({ q: 'gracias', page: 1, perPage: 24 })).results.map((gif) => gif.title)).toEqual(['Thank you']);
    const media = await standIn.find('sample-party', 4_000_000);
    expect(media).toMatchObject({ id: 'sample-party', title: 'Party time' });
    const bytes = await standIn.download(media!, 4_000_000);
    expect(bytes.subarray(0, 6).toString('latin1')).toBe('GIF89a');
    expect(await standIn.find('sample-nope', 4_000_000)).toBeNull();
  });
});
