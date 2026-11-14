import { describe, expect, it, vi } from 'vitest';
import { createSharedTagsCacheHandler } from '../../cache-handlers/shared-tags.mjs';

/**
 * The `'use cache'` handler (cache-handlers/shared-tags.mjs): entries in each instance's memory, tag
 * invalidations shared through a store (Postgres in the app). Two instances over one fake store stand for two
 * web instances.
 */

type Row = { tag: string; stale?: number; expired?: number; updatedAt: number };

function fakeStore() {
  const rows = new Map<string, Row>();
  let clock = Date.now();
  return {
    rows,
    failing: false,
    async read(since: number | null) {
      if (this.failing) throw new Error('database unreachable');
      return [...rows.values()].filter((row) => since === null || row.updatedAt > since).sort((a, b) => a.updatedAt - b.updatedAt);
    },
    async write(updates: { tag: string; stale?: number; expired?: number }[]) {
      if (this.failing) throw new Error('database unreachable');
      for (const update of updates) {
        const current = rows.get(update.tag);
        rows.set(update.tag, { tag: update.tag, stale: update.stale ?? current?.stale, expired: update.expired ?? current?.expired, updatedAt: ++clock });
      }
    },
  };
}

const bytes = (text: string) => new TextEncoder().encode(text);
function entry(text: string, over: Partial<{ tags: string[]; revalidate: number; expire: number; timestamp: number }> = {}) {
  return {
    value: new ReadableStream<Uint8Array>({ start: (c) => { c.enqueue(bytes(text)); c.close(); } }),
    tags: over.tags ?? ['tasks'],
    stale: 300,
    timestamp: over.timestamp ?? performance.timeOrigin + performance.now(),
    expire: over.expire ?? 3600,
    revalidate: over.revalidate ?? 900,
  };
}
const read = async (found: { value: ReadableStream<Uint8Array> } | undefined) => (found ? new TextDecoder().decode(await new Response(found.value).arrayBuffer()) : undefined);
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('two instances sharing tags', () => {
  it('an updateTag on one makes the other miss once it refreshes', async () => {
    const store = fakeStore();
    const a = createSharedTagsCacheHandler({ store, development: false });
    const b = createSharedTagsCacheHandler({ store, development: false });
    await b.refreshTags();
    await b.set('board', Promise.resolve(entry('the board')));
    expect(await read(await b.get('board', []))).toBe('the board');

    await tick();
    await a.updateTags(['tasks']);
    // Until B refreshes it serves its entry; Next calls refreshTags before the request's first read.
    expect(await read(await b.get('board', []))).toBe('the board');
    await b.refreshTags();
    expect(await b.get('board', [])).toBeUndefined();
    // A new entry made after the invalidation is fresh again.
    await tick();
    await b.set('board', Promise.resolve(entry('the new board')));
    expect(await read(await b.get('board', []))).toBe('the new board');
  });

  it('a revalidation with a profile serves the entry while it refreshes (revalidate -1), then expires it', async () => {
    const store = fakeStore();
    const a = createSharedTagsCacheHandler({ store, development: false });
    const b = createSharedTagsCacheHandler({ store, development: false });
    await b.set('board', Promise.resolve(entry('the board')));
    await tick();
    await a.updateTags(['tasks'], { expire: 0.05 });
    await b.refreshTags();
    expect((await b.get('board', []))?.revalidate).toBe(-1);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await b.get('board', [])).toBeUndefined();
  });

  it('answers getExpiration from the shared times, which covers soft tags (revalidatePath)', async () => {
    const store = fakeStore();
    const a = createSharedTagsCacheHandler({ store, development: false });
    const b = createSharedTagsCacheHandler({ store, development: false });
    expect(await b.getExpiration(['_N_T_/austin'])).toBe(0);
    await a.updateTags(['_N_T_/austin']);
    await b.refreshTags();
    expect(await b.getExpiration(['_N_T_/austin', '_N_T_/layout'])).toBeGreaterThan(0);
    expect(await b.getExpiration(['_N_T_/elsewhere'])).toBe(0);
  });

  it('only reads what changed since it last looked', async () => {
    const store = fakeStore();
    const reads: (number | null)[] = [];
    const watched = { ...store, read: (since: number | null) => { reads.push(since); return store.read.call(store, since); } };
    const b = createSharedTagsCacheHandler({ store: watched, development: false });
    await store.write([{ tag: 'tasks', expired: 1 }]);
    await b.refreshTags();
    await b.refreshTags();
    expect(reads[0]).toBeNull();
    expect(typeof reads[1]).toBe('number');
  });
});

describe('on its own', () => {
  it('misses at once after its own updateTag, even when the store is down', async () => {
    const store = fakeStore();
    const log = vi.fn();
    const a = createSharedTagsCacheHandler({ store, development: false, log });
    await a.set('board', Promise.resolve(entry('the board')));
    store.failing = true;
    await tick();
    await expect(a.updateTags(['tasks'])).resolves.toBeUndefined();
    await expect(a.refreshTags()).resolves.toBeUndefined();
    expect(await a.get('board', [])).toBeUndefined();
    // One line, not one per call.
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('never throws from get or set', async () => {
    const a = createSharedTagsCacheHandler({ store: fakeStore(), development: false, log: () => {} });
    await expect(a.set('broken', Promise.reject(new Error('render failed')))).resolves.toBeUndefined();
    expect(await a.get('broken', [])).toBeUndefined();
    const erroring = { ...entry('x'), value: new ReadableStream<Uint8Array>({ start: (c) => c.error(new Error('stream failed')) }) };
    await expect(a.set('half', Promise.resolve(erroring))).resolves.toBeUndefined();
    expect(await a.get('half', [])).toBeUndefined();
  });

  it('waits for a set in progress before reading', async () => {
    const a = createSharedTagsCacheHandler({ store: undefined, development: false });
    let finish: (value: ReturnType<typeof entry>) => void = () => {};
    const pending = new Promise<ReturnType<typeof entry>>((resolve) => (finish = resolve));
    const setting = a.set('slow', pending);
    const reading = a.get('slow', []);
    finish(entry('slow value'));
    await setting;
    expect(await read(await reading)).toBe('slow value');
  });

  it('keeps entries within its byte budget, dropping the least recently used', async () => {
    const a = createSharedTagsCacheHandler({ store: undefined, development: false, maxBytes: 40 });
    await a.set('one', Promise.resolve(entry('1234567890')));
    await a.set('two', Promise.resolve(entry('1234567890')));
    await a.get('one', []);
    await a.set('three', Promise.resolve(entry('1234567890')));
    expect(await a.get('two', [])).toBeUndefined();
    expect(await read(await a.get('one', []))).toBe('1234567890');
    expect(await read(await a.get('three', []))).toBe('1234567890');
    // Larger than the whole budget: not stored.
    await a.set('huge', Promise.resolve(entry('x'.repeat(100))));
    expect(await a.get('huge', [])).toBeUndefined();
  });

  it('follows Next’s retention: production drops at revalidate and skips dynamic entries, development keeps until expire', async () => {
    const old = performance.timeOrigin + performance.now() - 120_000;
    const production = createSharedTagsCacheHandler({ store: undefined, development: false });
    await production.set('aged', Promise.resolve(entry('aged', { revalidate: 60, expire: 3600, timestamp: old })));
    expect(await production.get('aged', [])).toBeUndefined();
    await production.set('dynamic', Promise.resolve(entry('dynamic', { expire: 0 })));
    expect(production.entryCount).toBe(1);

    const development = createSharedTagsCacheHandler({ store: undefined, development: true });
    await development.set('aged', Promise.resolve(entry('aged', { revalidate: 60, expire: 3600, timestamp: old })));
    expect(await read(await development.get('aged', []))).toBe('aged');
    // The dev tiered handler's eviction sentinel.
    await development.set('aged', Promise.resolve(entry('aged', { expire: -1 })));
    expect(await development.get('aged', [])).toBeUndefined();
  });
});
