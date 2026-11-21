import { isSampleId } from '@/shared/sample-data';

/**
 * Pages that exist only for the sample marketplace (src/shared/sample-data.ts): a demo city's pages (its market's id is
 * `mkt_demo_<key>`, db/seeds/demo), a sample task's page and a sample helper's profile. Where samples are hidden, the
 * public and search engines never see these, so src/proxy.ts answers a real 404 to a request without a session before
 * anything renders. Signed-in testers still get them.
 *
 * Why the proxy and not the pages: a page that learns who is visiting only inside Suspense has already streamed its
 * 200, so it could answer only a soft 404 with noindex. Google keeps recrawling soft 404s and noindex pages, and a
 * demo city's noindex pages kept leading it to more of them (830 by 2026-11-20); a 404 is the signal to stop
 * (docs/seo/PLAN.md §11).
 *
 * The answers come from the database, read through one connection of the proxy's own and kept for ten minutes, so a
 * page request costs at most one indexed lookup. Any failure counts as "not a sample page": the page is served as
 * before and answers for itself.
 */

export interface SamplePageLookup {
  /** The slugs of the demo cities' markets. */
  demoMarketSlugs(): Promise<ReadonlySet<string>>;
  /** The id of the task with this slug, or null. */
  taskId(slug: string): Promise<string | null>;
  /** The user id behind the helper profile with this handle, or null. */
  helperUserId(handle: string): Promise<string | null>;
}

/** The path (without its language prefix) is a page of the sample marketplace only. */
export async function isSamplePage(path: string, lookup: SamplePageLookup = databaseLookup()): Promise<boolean> {
  const segments = path.split('/').filter(Boolean);
  const [first, second] = segments;
  if (!first) return false;
  try {
    if (first === 'tasks' || first === 'helpers') {
      if (!second || segments.length !== 2) return false;
      const id = first === 'tasks' ? await lookup.taskId(second) : await lookup.helperUserId(second);
      return id !== null && isSampleId(id);
    }
    // A city's page, its board, categories, cost guides and job hubs all start with the market's slug.
    return (await lookup.demoMarketSlugs()).has(first);
  } catch {
    return false;
  }
}

const KEEP_MS = 10 * 60_000;
/** After a failed query, lookups wait this long before trying the database again (pages are served as before). */
const PAUSE_AFTER_FAILURE_MS = 30_000;
/** Answers kept per task slug and helper handle: enough for every sample page Google has seen, bounded. */
const MAX_KEPT = 5_000;

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** The lookup above against the database, with its answers kept for ten minutes. `connect` is for tests. */
export function createDatabaseLookup(connect: () => Promise<Queryable>, now: () => number = Date.now): SamplePageLookup {
  let client: Promise<Queryable> | null = null;
  // While the database is down, no request waits for its connection timeout: they skip the lookup for a while.
  let failedAt = Number.NEGATIVE_INFINITY;
  const run = async (text: string, values?: unknown[]) => {
    if (now() - failedAt < PAUSE_AFTER_FAILURE_MS) throw new Error('sample page lookup paused after a failure');
    try {
      client ??= connect().catch((error: unknown) => {
        client = null;
        throw error;
      });
      return await (await client).query(text, values);
    } catch (error) {
      failedAt = now();
      throw error;
    }
  };
  let markets: { slugs: ReadonlySet<string>; at: number } | null = null;
  const kept = new Map<string, { id: string | null; at: number }>();
  const remember = async (key: string, read: () => Promise<string | null>) => {
    const hit = kept.get(key);
    if (hit && now() - hit.at < KEEP_MS) return hit.id;
    const id = await read();
    kept.delete(key);
    kept.set(key, { id, at: now() });
    // The oldest answer goes first once the map is full (a Map keeps insertion order).
    if (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value!);
    return id;
  };
  const single = async (text: string, value: string) => {
    const { rows } = await run(text, [value]);
    const id = rows[0]?.id;
    return typeof id === 'string' ? id : null;
  };
  return {
    async demoMarketSlugs() {
      if (markets && now() - markets.at < KEEP_MS) return markets.slugs;
      const { rows } = await run("select slug from markets where left(id, 9) = 'mkt_demo_'");
      markets = { slugs: new Set(rows.map((row) => String(row.slug))), at: now() };
      return markets.slugs;
    },
    taskId: (slug) => remember(`task:${slug}`, () => single('select id from tasks where slug = $1 limit 1', slug)),
    helperUserId: (handle) => remember(`helper:${handle}`, () => single('select user_id as id from helper_profiles where handle = $1 limit 1', handle)),
  };
}

let shared: SamplePageLookup | null = null;

/**
 * The lookup the proxy uses: its own pool of one connection (the app's pool lives in the pages' module graph), which
 * closes when idle. pg is loaded on first use, so requests that never ask don't load it.
 */
export function databaseLookup(): SamplePageLookup {
  shared ??= createDatabaseLookup(async () => {
    const { Pool } = await import('pg');
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
      statement_timeout: 2_000,
      allowExitOnIdle: true,
    });
  });
  return shared;
}
