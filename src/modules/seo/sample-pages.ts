import { isSampleId } from '@/shared/sample-data';
import { proxyDatabase, type ProxyDatabase } from './proxy-database';

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
 * The answers come from the database, read through the proxy's own connection (src/modules/seo/proxy-database.ts) and
 * kept for ten minutes, so a page request costs at most one indexed lookup. Any failure counts as "not a sample page":
 * the page is served as before and answers for itself.
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
/** Answers kept per task slug and helper handle: enough for every sample page Google has seen, bounded. */
const MAX_KEPT = 5_000;

/** The lookup above over the proxy's database reads (src/modules/seo/proxy-database.ts), answers kept ten minutes. */
export function createDatabaseLookup(database: ProxyDatabase, now: () => number = Date.now): SamplePageLookup {
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
    const { rows } = await database.run(text, [value]);
    const id = rows[0]?.id;
    return typeof id === 'string' ? id : null;
  };
  return {
    async demoMarketSlugs() {
      if (markets && now() - markets.at < KEEP_MS) return markets.slugs;
      const { rows } = await database.run("select slug from markets where left(id, 9) = 'mkt_demo_'");
      markets = { slugs: new Set(rows.map((row) => String(row.slug))), at: now() };
      return markets.slugs;
    },
    taskId: (slug) => remember(`task:${slug}`, () => single('select id from tasks where slug = $1 limit 1', slug)),
    helperUserId: (handle) => remember(`helper:${handle}`, () => single('select user_id as id from helper_profiles where handle = $1 limit 1', handle)),
  };
}

let shared: SamplePageLookup | null = null;

/** The lookup the proxy uses, over its own connection. */
export function databaseLookup(): SamplePageLookup {
  shared ??= createDatabaseLookup(proxyDatabase());
  return shared;
}
