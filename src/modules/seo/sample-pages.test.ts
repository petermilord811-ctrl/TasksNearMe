import { describe, expect, it } from 'vitest';
import { createProxyDatabase } from './proxy-database';
import { createDatabaseLookup, isSamplePage, type SamplePageLookup } from './sample-pages';

const REAL_TASK = `tsk_${'a1'.repeat(16)}`;
const REAL_USER = `usr_${'b2'.repeat(16)}`;

const lookup: SamplePageLookup = {
  demoMarketSlugs: async () => new Set(['dallas', 'pretty-prairie']),
  taskId: async (slug) => ({ 'rake-leaves-uptown-1a2b3c': 'tsk_demo_dal_0042', 'assemble-a-desk-duckpond-9f2e': REAL_TASK })[slug] ?? null,
  helperUserId: async (handle) => ({ 'paul-w': 'usr_demo_dal_0007', 'rosa-d': REAL_USER })[handle] ?? null,
};

describe('isSamplePage', () => {
  it('knows a demo city by its first segment, on every page under it', async () => {
    for (const path of ['/dallas', '/dallas/tasks', '/dallas/moving-help', '/dallas/moving-help/cost', '/pretty-prairie/tasks/yard-cleanup']) {
      expect(await isSamplePage(path, lookup), path).toBe(true);
    }
    for (const path of ['/', '/gainesville', '/gainesville/moving-help', '/pricing', '/help/staying-safe', '/cities/texas']) {
      expect(await isSamplePage(path, lookup), path).toBe(false);
    }
  });

  it('knows a sample task or helper by the id behind its address, and leaves real and unknown ones to their page', async () => {
    expect(await isSamplePage('/tasks/rake-leaves-uptown-1a2b3c', lookup)).toBe(true);
    expect(await isSamplePage('/helpers/paul-w', lookup)).toBe(true);
    expect(await isSamplePage('/tasks/assemble-a-desk-duckpond-9f2e', lookup)).toBe(false);
    expect(await isSamplePage('/helpers/rosa-d', lookup)).toBe(false);
    expect(await isSamplePage('/tasks/no-such-task-0000', lookup)).toBe(false);
    expect(await isSamplePage('/tasks', lookup)).toBe(false);
    expect(await isSamplePage('/helpers/paul-w/extra', lookup)).toBe(false);
  });

  it('serves the page as before when the database can’t answer', async () => {
    const broken: SamplePageLookup = {
      demoMarketSlugs: () => Promise.reject(new Error('connection refused')),
      taskId: () => Promise.reject(new Error('timeout')),
      helperUserId: () => Promise.reject(new Error('timeout')),
    };
    expect(await isSamplePage('/dallas', broken)).toBe(false);
    expect(await isSamplePage('/tasks/rake-leaves-uptown-1a2b3c', broken)).toBe(false);
  });
});

describe('createDatabaseLookup', () => {
  function fakeDatabase() {
    const queries: string[] = [];
    const tables: Record<string, Array<Record<string, unknown>>> = {
      markets: [{ slug: 'dallas' }, { slug: 'chicago' }],
      tasks: [{ id: 'tsk_demo_dal_0042' }],
      helper_profiles: [{ id: 'usr_demo_dal_0007' }],
    };
    let connections = 0;
    const connect = async () => {
      connections += 1;
      return {
        query: async (text: string, values?: unknown[]) => {
          queries.push(`${text} ${JSON.stringify(values ?? [])}`);
          const table = Object.keys(tables).find((name) => text.includes(`from ${name}`))!;
          return { rows: values?.[0] === 'missing' ? [] : tables[table]! };
        },
      };
    };
    return { connect, queries, connections: () => connections };
  }

  it('reads the demo cities once per ten minutes, and each address once per ten minutes', async () => {
    const database = fakeDatabase();
    let clock = 0;
    const lookup = createDatabaseLookup(createProxyDatabase(database.connect, () => clock), () => clock);
    expect([...(await lookup.demoMarketSlugs())]).toEqual(['dallas', 'chicago']);
    await lookup.demoMarketSlugs();
    expect(await lookup.taskId('rake-leaves-uptown-1a2b3c')).toBe('tsk_demo_dal_0042');
    expect(await lookup.taskId('rake-leaves-uptown-1a2b3c')).toBe('tsk_demo_dal_0042');
    expect(await lookup.helperUserId('paul-w')).toBe('usr_demo_dal_0007');
    expect(await lookup.taskId('missing')).toBeNull();
    expect(await lookup.taskId('missing')).toBeNull();
    expect(database.queries).toHaveLength(4);
    expect(database.connections()).toBe(1);

    clock += 10 * 60_000;
    await lookup.demoMarketSlugs();
    await lookup.taskId('rake-leaves-uptown-1a2b3c');
    expect(database.queries).toHaveLength(6);
  });

  it('asks only for the demo markets, a task by its slug and a profile by its handle, with parameters', async () => {
    const database = fakeDatabase();
    const lookup = createDatabaseLookup(createProxyDatabase(database.connect));
    await lookup.demoMarketSlugs();
    await lookup.taskId("x' or 1=1 --");
    await lookup.helperUserId('paul-w');
    expect(database.queries).toEqual([
      "select slug from markets where left(id, 9) = 'mkt_demo_' []",
      `select id from tasks where slug = $1 limit 1 ${JSON.stringify(["x' or 1=1 --"])}`,
      'select user_id as id from helper_profiles where handle = $1 limit 1 ["paul-w"]',
    ]);
  });
});
