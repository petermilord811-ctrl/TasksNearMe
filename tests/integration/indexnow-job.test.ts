import { afterAll, describe, expect, it, vi } from 'vitest';
import { changedPagesAnnouncer } from '@/modules/seo/indexnow';
import { loadSitemapEntries } from '@/modules/seo/sitemap';

/**
 * The IndexNow job runs in the job runner, outside any request (src/modules/jobs/runner.ts), where next/cache's
 * cacheLife() and cacheTag() throw. On the live site seo.indexnow failed on every run: the sitemap's entries read the
 * city directory through a 'use cache' function (2026-11-21). The other files that load the sitemap swap next/cache for
 * no-ops, which hid it, so this one keeps next/cache real and runs the job's own announcer, as the runner does.
 */
const { db, pool } = await vi.hoisted(async () => {
  const { createDb } = await import('@/platform/db/connect');
  return createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
});
vi.mock('@/platform/db/client', () => ({ db }));

afterAll(async () => {
  await pool.end();
});

describe('the IndexNow job outside a request (seo.indexnow)', () => {
  it("loads the sitemap's entries with next/cache as it is outside a request", async () => {
    const { entries } = await loadSitemapEntries({ listings: true, rows: 'all' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.url.startsWith('http'))).toBe(true);
  });

  it('announces the pages on its first run, the way the runner calls it', async () => {
    const submit = vi.fn(async (urls: string[]) => ({ submitted: urls.length, statuses: [200] }));
    const announce = changedPagesAnnouncer({
      mode: () => 'site',
      baseUrl: () => 'https://tasksnearme.example',
      load: async (options) => (await loadSitemapEntries(options)).entries,
      submit,
    });
    const result = await announce(new Date());
    expect(result?.submitted).toBeGreaterThan(0);
    expect(submit).toHaveBeenCalledOnce();
    // Nothing changed since: the next run inside the interval does nothing.
    expect(await announce(new Date(Date.now() + 1000))).toBeNull();
  });
});
