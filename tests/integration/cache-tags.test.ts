import { like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresTagStore, createSharedTagsCacheHandler } from '../../cache-handlers/shared-tags.mjs';
import { pruneCacheTags, TAG_ROW_DAYS } from '@/platform/cache/prune';
import { cacheTagInvalidations } from '@/platform/cache/schema';
import { createDb } from '@/platform/db/connect';

/**
 * The `'use cache'` handler's shared tags on Postgres (cache-handlers/shared-tags.mjs): two handlers with their
 * own connections stand for two web instances. Tags here start with `test:` and are removed afterwards.
 */

const url = process.env.TEST_DATABASE_URL ?? '';
const { db, pool } = createDb(url, { max: 2 });
const storeA = createPostgresTagStore(url);
const storeB = createPostgresTagStore(url);
const PREFIX = 'test:cache-tags:';

const entry = (text: string, tags: string[]) => ({
  value: new ReadableStream<Uint8Array>({ start: (c) => { c.enqueue(new TextEncoder().encode(text)); c.close(); } }),
  tags,
  stale: 300,
  timestamp: performance.timeOrigin + performance.now(),
  expire: 3600,
  revalidate: 900,
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

beforeAll(() => db.delete(cacheTagInvalidations).where(like(cacheTagInvalidations.tag, `${PREFIX}%`)));
afterAll(async () => {
  await db.delete(cacheTagInvalidations).where(like(cacheTagInvalidations.tag, `${PREFIX}%`));
  await Promise.all([storeA.end(), storeB.end(), pool.end()]);
});

describe('shared cache tags on Postgres', () => {
  it('an updateTag on one instance reaches the other on its next refresh', async () => {
    const a = createSharedTagsCacheHandler({ store: storeA, development: false });
    const b = createSharedTagsCacheHandler({ store: storeB, development: false });
    const tag = `${PREFIX}tasks`;
    await b.refreshTags();
    await b.set('board', Promise.resolve(entry('the board', [tag])));
    expect(await b.get('board', [])).toBeDefined();

    await tick();
    await a.updateTags([tag]);
    await b.refreshTags();
    expect(await b.get('board', [])).toBeUndefined();

    // Stale with a profile: served while it refreshes.
    await tick();
    await b.set('board', Promise.resolve(entry('the new board', [tag])));
    await tick();
    await a.updateTags([tag], { expire: 3600 });
    await b.refreshTags();
    expect((await b.get('board', []))?.revalidate).toBe(-1);

    // Both kinds of time are kept on the one row.
    const [row] = await db.select().from(cacheTagInvalidations).where(like(cacheTagInvalidations.tag, tag));
    expect(row?.staleAt).toBeGreaterThan(0);
    expect(row?.expiredAt).toBeGreaterThan(row!.staleAt!);
  });

  it('a new instance learns every earlier invalidation on its first refresh', async () => {
    const a = createSharedTagsCacheHandler({ store: storeA, development: false });
    const tag = `${PREFIX}soft`;
    await a.updateTags([tag]);
    const late = createSharedTagsCacheHandler({ store: storeB, development: false });
    expect(await late.getExpiration([tag])).toBe(0);
    await late.refreshTags();
    expect(await late.getExpiration([tag])).toBeGreaterThan(0);
  });

  it(`prunes rows older than ${TAG_ROW_DAYS} days, and nothing newer`, async () => {
    const now = new Date();
    const old = new Date(now.getTime() - (TAG_ROW_DAYS + 1) * 24 * 60 * 60 * 1000);
    await db.insert(cacheTagInvalidations).values([
      { tag: `${PREFIX}old`, expiredAt: old.getTime(), updatedAt: old },
      { tag: `${PREFIX}recent`, expiredAt: now.getTime(), updatedAt: now },
    ]);
    expect(await pruneCacheTags(db, now)).toBeGreaterThanOrEqual(1);
    const left = (await db.select({ tag: cacheTagInvalidations.tag }).from(cacheTagInvalidations).where(like(cacheTagInvalidations.tag, `${PREFIX}%`))).map((row) => row.tag);
    expect(left).toContain(`${PREFIX}recent`);
    expect(left).not.toContain(`${PREFIX}old`);
  });
});
