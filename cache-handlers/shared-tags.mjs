// The `'use cache'` handler (next.config.ts `cacheHandlers.default`): entries stay in this process's memory, like
// Next's built-in handler, and tag invalidations are shared through Postgres, so an `updateTag` on one web instance
// reaches the others before they serve (blueprint 07 runs two; decisions.md 2026-11-13 and 2026-11-14).
//
// Next loads this file at runtime by path and never bundles it, so it is plain JavaScript with no `@/` aliases.
// The rules mirror node_modules/next/dist/server/lib/cache-handlers/default.js:
// - a size-bounded LRU of buffered entries;
// - production drops an entry once past its `revalidate`; the dev server keeps it until `expire` (at least 5
//   minutes) so reloads stay fast; production doesn't store `expire: 0` (dynamic) entries;
// - a negative `expire` is the dev tiered handler's eviction sentinel;
// - an expired tag makes the entry a miss; a stale tag serves it with `revalidate: -1` (regenerated in the
//   background); `getExpiration` answers with the newest `expired` time, which covers soft tags.
//
// Shared state: `updateTags` writes each tag's times to `cache_tag_invalidations` (src/platform/cache/schema.ts);
// `refreshTags` (called by Next once per request, before the first read) reads the rows changed since this
// process last looked. `get` and `set` never throw, and a database error leaves the handler working on its own
// local state, with one log line a minute.
import pg from 'pg';

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
/** The dev server puts Next's own 50 MB in-memory front before this handler, so this one stays small there. */
const DEV_MAX_BYTES = 16 * 1024 * 1024;
/** Next's MIN_PRERENDERABLE_EXPIRE: the dev server keeps entries at least this long. */
const DEV_MIN_EXPIRE_SECONDS = 300;
/** Rows committed just before a read can carry a slightly older time: read back a little further each time. */
const READ_OVERLAP_MS = 5_000;
const LOG_EVERY_MS = 60_000;

const nowMs = () => performance.timeOrigin + performance.now();

function streamFromBytes(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/**
 * Tag times in Postgres. `read(sinceMs)`: rows changed after that time (all of them for `null`), as
 * `{ tag, stale, expired, updatedAt }` in milliseconds. `write(updates)`: upserts `{ tag, stale?, expired? }`
 * (a missing time keeps the stored one).
 */
export function createPostgresTagStore(connectionString, options = {}) {
  let pool;
  const db = () => {
    pool ??= new pg.Pool({ connectionString, max: options.max ?? 2, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 3_000 });
    pool.on?.('error', () => {});
    return pool;
  };
  return {
    async read(sinceMs) {
      const { rows } = await db().query(
        `select tag, stale_at, expired_at, (extract(epoch from updated_at) * 1000)::float8 as updated_ms
           from cache_tag_invalidations
          where $1::float8 is null or updated_at > to_timestamp($1::float8 / 1000)
          order by updated_at`,
        [sinceMs],
      );
      return rows.map((row) => ({
        tag: row.tag,
        stale: row.stale_at === null ? undefined : Number(row.stale_at),
        expired: row.expired_at === null ? undefined : Number(row.expired_at),
        updatedAt: Number(row.updated_ms),
      }));
    },
    async write(updates) {
      if (updates.length === 0) return;
      const values = [];
      const params = [];
      updates.forEach((update, index) => {
        values.push(`($${index * 3 + 1}, $${index * 3 + 2}::bigint, $${index * 3 + 3}::bigint, clock_timestamp())`);
        params.push(update.tag, update.stale ?? null, update.expired ?? null);
      });
      await db().query(
        `insert into cache_tag_invalidations (tag, stale_at, expired_at, updated_at)
         values ${values.join(', ')}
         on conflict (tag) do update set
           stale_at = coalesce(excluded.stale_at, cache_tag_invalidations.stale_at),
           expired_at = coalesce(excluded.expired_at, cache_tag_invalidations.expired_at),
           updated_at = clock_timestamp()`,
        params,
      );
    },
    async end() {
      await pool?.end();
    },
  };
}

/** An LRU of buffered entries, bounded by bytes (each entry counts its value and its key). */
function createLru(maxBytes) {
  const entries = new Map();
  let bytes = 0;
  const sizeOf = (key, item) => item.value.byteLength + key.length;
  return {
    get(key) {
      const item = entries.get(key);
      if (!item) return undefined;
      entries.delete(key);
      entries.set(key, item);
      return item;
    },
    set(key, item) {
      const size = sizeOf(key, item);
      if (size > maxBytes) return;
      const previous = entries.get(key);
      if (previous) {
        bytes -= sizeOf(key, previous);
        entries.delete(key);
      }
      entries.set(key, item);
      bytes += size;
      for (const [oldest, old] of entries) {
        if (bytes <= maxBytes) break;
        entries.delete(oldest);
        bytes -= sizeOf(oldest, old);
      }
    },
    get size() {
      return entries.size;
    },
  };
}

/**
 * A handler over a tag store (Postgres in the app, a fake in tests). `development` follows Next's dev-server
 * rules. `log` gets at most one line a minute about the store being unreachable.
 */
export function createSharedTagsCacheHandler({ store, maxBytes = DEFAULT_MAX_BYTES, development = Boolean(process.env.__NEXT_DEV_SERVER), log = (message) => console.warn(message) } = {}) {
  const lru = createLru(maxBytes);
  const pendingSets = new Map();
  /** tag → { stale?, expired? } in milliseconds, this process's view of every instance's invalidations. */
  const tags = new Map();
  let watermark = null;
  let refreshing = null;
  let lastLog = 0;

  const warn = (what, error) => {
    const at = Date.now();
    if (at - lastLog < LOG_EVERY_MS) return;
    lastLog = at;
    log(`[cache] ${what}; using this instance's tags only: ${error instanceof Error ? error.message : String(error)}`);
  };

  const expiredFor = (entryTags, timestamp) => {
    const now = nowMs();
    return entryTags.some((tag) => {
      const expired = tags.get(tag)?.expired;
      return typeof expired === 'number' && expired <= now && expired > timestamp;
    });
  };
  const staleFor = (entryTags, timestamp) => entryTags.some((tag) => (tags.get(tag)?.stale ?? 0) > timestamp);

  function apply(row) {
    const current = tags.get(row.tag) ?? {};
    tags.set(row.tag, { stale: row.stale ?? current.stale, expired: row.expired ?? current.expired });
  }

  return {
    async get(cacheKey) {
      try {
        const pending = pendingSets.get(cacheKey);
        if (pending) await pending;
        const item = lru.get(cacheKey);
        if (!item) return undefined;
        const { entry } = item;
        if (entry.expire < 0) return undefined;
        const maxAgeSeconds = development ? Math.max(entry.expire, DEV_MIN_EXPIRE_SECONDS) : entry.revalidate;
        if (nowMs() > entry.timestamp + maxAgeSeconds * 1000) return undefined;
        if (expiredFor(entry.tags, entry.timestamp)) return undefined;
        const revalidate = staleFor(entry.tags, entry.timestamp) ? -1 : entry.revalidate;
        return { ...entry, revalidate, value: streamFromBytes(item.value) };
      } catch (error) {
        warn('reading an entry failed', error);
        return undefined;
      }
    },

    async set(cacheKey, pendingEntry) {
      let resolvePending = () => {};
      pendingSets.set(cacheKey, new Promise((resolve) => (resolvePending = resolve)));
      try {
        const entry = await pendingEntry;
        // Production regenerates an `expire: 0` entry on every read, so storing it would be wasted.
        if (!development && entry.expire === 0) return;
        const value = new Uint8Array(await new Response(entry.value).arrayBuffer());
        const { value: _stream, ...metadata } = entry;
        lru.set(cacheKey, { entry: metadata, value });
      } catch {
        // An interrupted value is discarded: the next read renders again.
      } finally {
        resolvePending();
        pendingSets.delete(cacheKey);
      }
    },

    async refreshTags() {
      if (!store) return;
      refreshing ??= (async () => {
        try {
          const since = watermark === null ? null : watermark - READ_OVERLAP_MS;
          const rows = await store.read(since);
          for (const row of rows) {
            apply(row);
            if (watermark === null || row.updatedAt > watermark) watermark = row.updatedAt;
          }
          // First read and nothing stored yet: start from now, so later reads only look at new rows.
          if (watermark === null) watermark = Date.now() - READ_OVERLAP_MS;
        } catch (error) {
          warn('reading shared tags failed', error);
        } finally {
          refreshing = null;
        }
      })();
      await refreshing;
    },

    async getExpiration(tagList) {
      return Math.max(...tagList.map((tag) => tags.get(tag)?.expired ?? 0), 0);
    },

    async updateTags(tagList, durations) {
      const now = Math.round(nowMs());
      const updates = tagList.map((tag) => (durations ? { tag, stale: now, ...(durations.expire !== undefined ? { expired: now + durations.expire * 1000 } : {}) } : { tag, expired: now }));
      // This instance's next read must miss at once, whatever the database says.
      updates.forEach(apply);
      if (!store) return;
      try {
        await store.write(updates);
      } catch (error) {
        warn('sharing a tag invalidation failed', error);
      }
    },

    /** For tests: how many entries are held. */
    get entryCount() {
      return lru.size;
    },
  };
}

const databaseUrl = process.env.DATABASE_URL;

export default createSharedTagsCacheHandler({
  store: databaseUrl ? createPostgresTagStore(databaseUrl) : undefined,
  maxBytes: Number(process.env.CACHE_MAX_MEMORY_BYTES) || (process.env.__NEXT_DEV_SERVER ? DEV_MAX_BYTES : DEFAULT_MAX_BYTES),
});
