import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOCK_SKEW_MS, createPostgresTagStore, createSharedTagsCacheHandler } from '../../cache-handlers/shared-tags.mjs';

const pools = vi.hoisted(() => [] as { listeners: string[]; queries: number }[]);
vi.mock('pg', () => {
  class Pool {
    listeners: string[] = [];
    queries = 0;
    constructor() {
      pools.push(this);
    }
    on(event: string) {
      this.listeners.push(event);
      return this;
    }
    async query() {
      this.queries++;
      return { rows: [] };
    }
    async end() {}
  }
  return { default: { Pool } };
});

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
    // A new entry made after the invalidation (past the clock skew it covers) is fresh again.
    await b.set('board', Promise.resolve(entry('the new board', { timestamp: performance.timeOrigin + performance.now() + CLOCK_SKEW_MS + 1 })));
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

describe('the Postgres tag store', () => {
  it('makes one pool with one error listener, however many reads and writes run', async () => {
    const store = createPostgresTagStore('postgres://example.invalid/db');
    for (let i = 0; i < 25; i++) {
      await store.read(i === 0 ? null : Date.now());
      await store.write([{ tag: `tag:${i}`, expired: Date.now() }]);
    }
    expect(pools).toHaveLength(1);
    expect(pools[0]!.queries).toBe(50);
    expect(pools[0]!.listeners).toEqual(['error']);
  });
});

describe('time at millisecond resolution (a CI flake, 5.18)', () => {
  /** performance.now() made to return `ms` after the time origin's next whole second plus `fraction`. */
  const at = (offset: number) => {
    const base = Math.floor(performance.timeOrigin) + 10_000 - performance.timeOrigin;
    vi.spyOn(performance, 'now').mockReturnValue(base + offset);
    return Math.floor(performance.timeOrigin) + 10_000 + offset;
  };
  afterEach(() => vi.restoreAllMocks());

  it('an updateTag in the same millisecond as the entry, just after it, still expires it', async () => {
    const store = fakeStore();
    const a = createSharedTagsCacheHandler({ store, development: false });
    const b = createSharedTagsCacheHandler({ store, development: false });
    await b.refreshTags();
    at(0.1);
    await b.set('board', Promise.resolve(entry('the board')));
    at(0.3);
    await a.updateTags(['tasks']);
    // Its own updateTag counts at once, in the same millisecond.
    await a.set('own', Promise.resolve(entry('own', { timestamp: Math.floor(performance.timeOrigin) + 10_000 + 0.2 })));
    expect(await a.get('own', [])).toBeUndefined();
    await b.refreshTags();
    expect(await b.get('board', [])).toBeUndefined();
  });

  it('covers an entry another instance stamped a little later by its clock, not one made well after', async () => {
    const store = fakeStore();
    const a = createSharedTagsCacheHandler({ store, development: false });
    const b = createSharedTagsCacheHandler({ store, development: false });
    await b.refreshTags();
    const invalidated = at(5);
    await a.updateTags(['tasks']);
    at(400);
    await b.refreshTags();
    // B's clock runs a few ms ahead: its entry was made before the invalidation, though stamped after it.
    await b.set('skewed', Promise.resolve(entry('skewed', { timestamp: invalidated + CLOCK_SKEW_MS - 2 })));
    expect(await b.get('skewed', [])).toBeUndefined();
    await b.set('fresh', Promise.resolve(entry('fresh', { timestamp: invalidated + 200 })));
    expect(await read(await b.get('fresh', []))).toBe('fresh');
  });
});
