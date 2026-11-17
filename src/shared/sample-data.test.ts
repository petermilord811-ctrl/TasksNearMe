import type { SQL } from 'drizzle-orm';
import { PgDialect, pgTable, text } from 'drizzle-orm/pg-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENERATED_ID_PATTERN, hideSamplesFor, isRealRecordId, isSampleId, realRowsOnly, rowScopeCondition, rowsFor, searchEngineRows } from './sample-data';

const people = pgTable('users', { id: text('id').primaryKey() });
const render = (query: SQL) => {
  const { sql, params } = new PgDialect().sqlToQuery(query);
  return { sql, params };
};

describe('isRealRecordId', () => {
  it('accepts ids the app generates', () => {
    expect(isRealRecordId('usr_0f4c9a1b2c3d4e5f60718293a4b5c6d7')).toBe(true);
    expect(isRealRecordId('tsk_ffffffffffffffffffffffffffffffff')).toBe(true);
  });

  it('rejects the demo marketplace and the base seed', () => {
    for (const id of ['tsk_demo_007', 'usr_demo_042', 'off_demo_007_sam', 'mkt_demo_chicago', 'usr_jordan', 'tsk_desk', 'mkt_austin']) {
      expect(isRealRecordId(id), id).toBe(false);
    }
  });

  it('rejects anything malformed', () => {
    for (const id of ['', 'usr_', 'USR_0f4c9a1b2c3d4e5f60718293a4b5c6d7', 'usr_0f4c9a1b2c3d4e5f60718293a4b5c6d', 'usr_0f4c9a1b2c3d4e5f60718293a4b5c6d7x']) {
      expect(isRealRecordId(id), id).toBe(false);
    }
  });
});

describe('isSampleId', () => {
  it('is every id that is not a generated one', () => {
    expect(isSampleId('usr_sam')).toBe(true);
    expect(isSampleId('usr_demo_au_c001')).toBe(true);
    // A demo id can't pass for a real one: the prefix has no underscore, and "demo" isn't hex.
    expect(isSampleId('usr_demo_0f4c9a1b2c3d4e5f60718293a4b5c6')).toBe(true);
    expect(isSampleId('usr_0f4c9a1b2c3d4e5f60718293a4b5c6d7')).toBe(false);
  });
});

describe('realRowsOnly', () => {
  it('matches the column against the generated id form, the pattern isRealRecordId uses', () => {
    expect(render(realRowsOnly(people.id))).toEqual({ sql: '"users"."id" ~ $1', params: [GENERATED_ID_PATTERN] });
  });

  it('is the condition for real rows, and no condition for every row', () => {
    expect(rowScopeCondition('all', people.id)).toBeUndefined();
    expect(render(rowScopeCondition('real', people.id)!)).toEqual(render(realRowsOnly(people.id)));
  });
});

describe('who sees sample rows', () => {
  it('hides them from the public only, and only where the build hides them', () => {
    expect(hideSamplesFor('public', true)).toBe(true);
    expect(hideSamplesFor('testers', true)).toBe(false);
    expect(hideSamplesFor('public', false)).toBe(false);
    expect(hideSamplesFor('testers', false)).toBe(false);
    expect(rowsFor('public', true)).toBe('real');
    expect(rowsFor('testers', true)).toBe('all');
    expect(rowsFor('public', false)).toBe('all');
  });

  it("gives search engines the public's rows, whoever asks", () => {
    expect(searchEngineRows(true)).toBe('real');
    expect(searchEngineRows(false)).toBe('all');
  });
});

/**
 * The build's own rule follows the development helpers' switch (src/shared/dev-helpers.ts), which reads how the app
 * was built when the module loads, so each case loads the modules afresh (as tests/unit/dev-helpers.test.ts does).
 */
describe("this build's rule", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function load(env: Record<string, string>) {
    vi.resetModules();
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    return import('./sample-data');
  }

  it('shows everyone everything in development and tests, where every row is seed data', async () => {
    const rule = await load({ NODE_ENV: 'development' });
    expect(rule.samplesHiddenInThisBuild()).toBe(false);
    expect(rule.rowsFor('public')).toBe('all');
    expect(rule.searchEngineRows()).toBe('all');
  });

  it('hides samples from the public and search engines in a production build, not from testers', async () => {
    const rule = await load({ NODE_ENV: 'production' });
    expect(rule.samplesHiddenInThisBuild()).toBe(true);
    expect(rule.hideSamplesFor('public')).toBe(true);
    expect(rule.rowsFor('public')).toBe('real');
    expect(rule.rowsFor('testers')).toBe('all');
    expect(rule.searchEngineRows()).toBe('real');
  });

  it('shows everyone everything in the e2e build, a production build of seed data', async () => {
    const rule = await load({ NODE_ENV: 'production', TNM_E2E_BUILD: '1' });
    expect(rule.samplesHiddenInThisBuild()).toBe(false);
    expect(rule.rowsFor('public')).toBe('all');
    expect(rule.searchEngineRows()).toBe('all');
  });
});
