/**
 * The proxy's own database reads (src/proxy.ts: which pages belong to the sample marketplace, and the search setting).
 * One pg connection, opened on first use and closed when idle; the app's pool lives in the pages' module graph. While
 * the database is down, reads fail at once for 30 seconds instead of each waiting for its connection timeout, and every
 * caller then does what it does without the database.
 */

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface ProxyDatabase {
  run(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** After a failed query, reads wait this long before trying the database again. */
const PAUSE_AFTER_FAILURE_MS = 30_000;

/** The reads above over `connect`'s client. `connect` and `now` are for tests. */
export function createProxyDatabase(connect: () => Promise<Queryable>, now: () => number = Date.now): ProxyDatabase {
  let client: Promise<Queryable> | null = null;
  let failedAt = Number.NEGATIVE_INFINITY;
  return {
    async run(text, values) {
      if (now() - failedAt < PAUSE_AFTER_FAILURE_MS) throw new Error('proxy database reads paused after a failure');
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
    },
  };
}

let shared: ProxyDatabase | null = null;

/** The proxy's connection: a pool of one, with short timeouts. pg is loaded on first use. */
export function proxyDatabase(): ProxyDatabase {
  shared ??= createProxyDatabase(async () => {
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
