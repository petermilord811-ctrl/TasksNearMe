import { describe, expect, it } from 'vitest';
import type { ProxyDatabase } from './proxy-database';
import { createProxySearchIndexing } from './proxy-search-indexing';

const LIVE = { APP_URL: 'https://tasksnearme.com' };
const production = { production: true };

function database(rows: () => Array<Record<string, unknown>>) {
  const queries: string[] = [];
  const db: ProxyDatabase = {
    run: async (text, values) => {
      queries.push(`${text} ${JSON.stringify(values ?? [])}`);
      return { rows: rows() };
    },
  };
  return { db, queries };
}

describe('the proxy’s search mode', () => {
  it('follows the admin setting on the live site: on, site, or the default when never set', async () => {
    for (const [rows, expected] of [[[{ enabled: true }], 'on'], [[{ enabled: false }], 'site'], [[], 'site']] as const) {
      const { db } = database(() => [...rows]);
      expect(await createProxySearchIndexing(db, { env: LIVE, build: production })()).toBe(expected);
    }
  });

  it('reads the flag at most every 15 seconds, so a change arrives within that', async () => {
    let enabled = false;
    let clock = 0;
    const { db, queries } = database(() => [{ enabled }]);
    const mode = createProxySearchIndexing(db, { env: LIVE, build: production, now: () => clock });
    expect(await mode()).toBe('site');
    enabled = true;
    clock += 10_000;
    expect(await mode()).toBe('site');
    clock += 5_000;
    expect(await mode()).toBe('on');
    expect(queries).toEqual([
      `select enabled from feature_flags where key = $1 and market_id = 'global' limit 1 ["search.listings"]`,
      `select enabled from feature_flags where key = $1 and market_id = 'global' limit 1 ["search.listings"]`,
    ]);
  });

  it('reads nothing where the setting can’t change the mode, and stays off there', async () => {
    const { db, queries } = database(() => [{ enabled: true }]);
    expect(await createProxySearchIndexing(db, { env: LIVE, build: { production: false } })()).toBe('off');
    expect(await createProxySearchIndexing(db, { env: { ...LIVE, SEARCH_INDEXING: 'site' }, build: production })()).toBe('site');
    expect(queries).toEqual([]);
  });

  it('keeps the last answer when the database can’t answer, or the default when there is none', async () => {
    let clock = 0;
    let down = false;
    const db: ProxyDatabase = {
      run: async () => {
        if (down) throw new Error('down');
        return { rows: [{ enabled: true }] };
      },
    };
    const mode = createProxySearchIndexing(db, { env: LIVE, build: production, now: () => clock });
    expect(await mode()).toBe('on');
    down = true;
    clock += 20_000;
    expect(await mode()).toBe('on');
    const fresh = createProxySearchIndexing(db, { env: LIVE, build: production });
    expect(await fresh()).toBe('site');
  });
});
