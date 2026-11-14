import type { MetadataRoute } from 'next';
import { describe, expect, it, vi } from 'vitest';
import { changedPagesAnnouncer, INDEXNOW_ENDPOINT, INDEXNOW_KEY, submitToIndexNow, type IndexNowResult } from './indexnow';

const BASE = 'https://tasksnearme.com';

function fakeFetch(status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status }));
}

describe('submitToIndexNow', () => {
  it('posts our own pages once each, with the key and where to find it', async () => {
    const fetcher = fakeFetch(202);
    const result = await submitToIndexNow([`${BASE}/`, `${BASE}/austin`, `${BASE}/austin`, 'https://other.example/x', 'not a url'], BASE, fetcher);
    expect(result).toEqual({ submitted: 2, statuses: [202] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect(JSON.parse(String(init?.body))).toEqual({
      host: 'tasksnearme.com',
      key: INDEXNOW_KEY,
      keyLocation: `${BASE}/${INDEXNOW_KEY}.txt`,
      urlList: [`${BASE}/`, `${BASE}/austin`],
    });
  });

  it('splits more than 10,000 pages into batches, and sends nothing for none', async () => {
    const fetcher = fakeFetch();
    const urls = Array.from({ length: 10_001 }, (_, index) => `${BASE}/tasks/t-${index}`);
    expect(await submitToIndexNow(urls, BASE, fetcher)).toEqual({ submitted: 10_001, statuses: [200, 200] });
    expect(await submitToIndexNow([], BASE, fakeFetch())).toEqual({ submitted: 0, statuses: [] });
  });

  it('the key file in public/ holds the key', async () => {
    const fs = await import('node:fs');
    expect(fs.readFileSync(`public/${INDEXNOW_KEY}.txt`, 'utf8')).toBe(INDEXNOW_KEY);
  });
});

describe('changedPagesAnnouncer', () => {
  const page = (url: string, lastModified?: string): MetadataRoute.Sitemap[number] => ({ url, ...(lastModified ? { lastModified } : {}) });

  function setup(mode: 'off' | 'site' | 'on', pages: MetadataRoute.Sitemap, status = 200) {
    const state = { pages, status };
    const submit = vi.fn(async (urls: string[]): Promise<IndexNowResult> => ({ submitted: urls.length, statuses: [state.status] }));
    const load = vi.fn(async (_options: { listings: boolean }) => state.pages);
    const announce = changedPagesAnnouncer({ mode: () => mode, baseUrl: () => BASE, load, submit }, 15 * 60_000);
    return { state, submit, load, announce };
  }
  const at = (minutes: number) => new Date(Date.UTC(2026, 10, 14, 12, minutes));

  it('does nothing while indexing is off', async () => {
    const { announce, load, submit } = setup('off', [page(`${BASE}/`)]);
    expect(await announce(at(0))).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('announces everything first, then only new or changed pages, at most every 15 minutes', async () => {
    const { state, announce, submit, load } = setup('site', [page(`${BASE}/`, '2026-11-14T09:00:00.000Z'), page(`${BASE}/pricing`)]);
    expect(await announce(at(0))).toEqual({ submitted: 2, statuses: [200] });
    expect(load).toHaveBeenLastCalledWith({ listings: false });
    expect(await announce(at(10))).toBeNull();

    state.pages = [page(`${BASE}/`, '2026-11-14T12:05:00.000Z'), page(`${BASE}/pricing`), page(`${BASE}/austin`)];
    await announce(at(15));
    expect(submit).toHaveBeenLastCalledWith([`${BASE}/`, `${BASE}/austin`], BASE);

    expect(await announce(at(30))).toEqual({ submitted: 0, statuses: [] });
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('asks for the listings only in the on mode', async () => {
    const { announce, load } = setup('on', [page(`${BASE}/tasks/x`)]);
    await announce(at(0));
    expect(load).toHaveBeenLastCalledWith({ listings: true });
  });

  it('tries again next time when the engines refused the batch', async () => {
    const { state, announce, submit } = setup('site', [page(`${BASE}/`)], 429);
    await announce(at(0));
    state.status = 200;
    await announce(at(15));
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenLastCalledWith([`${BASE}/`], BASE);
  });
});
