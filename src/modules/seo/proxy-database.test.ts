import { describe, expect, it } from 'vitest';
import { createProxyDatabase } from './proxy-database';

describe('createProxyDatabase', () => {
  it('connects once and reuses the connection', async () => {
    let connections = 0;
    const database = createProxyDatabase(async () => {
      connections += 1;
      return { query: async (text: string) => ({ rows: [{ text }] }) };
    });
    expect((await database.run('select 1')).rows).toEqual([{ text: 'select 1' }]);
    await database.run('select 2');
    expect(connections).toBe(1);
  });

  it('pauses for 30 seconds after a failure, so no request waits on a database that is down, then tries again', async () => {
    let attempts = 0;
    let clock = 0;
    const database = createProxyDatabase(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('no database yet');
      return { query: async () => ({ rows: [{ slug: 'dallas' }] }) };
    }, () => clock);
    await expect(database.run('select slug from markets')).rejects.toThrow('no database yet');
    clock += 10_000;
    await expect(database.run('select slug from markets')).rejects.toThrow('paused');
    expect(attempts).toBe(1);
    clock += 30_000;
    expect((await database.run('select slug from markets')).rows).toEqual([{ slug: 'dallas' }]);
    expect(attempts).toBe(2);
  });

  it('pauses after a failed query too, not only a failed connection', async () => {
    let clock = 0;
    let fail = true;
    const database = createProxyDatabase(async () => ({
      query: async () => {
        if (fail) throw new Error('statement timeout');
        return { rows: [] };
      },
    }), () => clock);
    await expect(database.run('select 1')).rejects.toThrow('statement timeout');
    fail = false;
    await expect(database.run('select 1')).rejects.toThrow('paused');
    clock += 30_000;
    expect((await database.run('select 1')).rows).toEqual([]);
  });
});
