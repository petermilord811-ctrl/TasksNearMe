import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Creates a Drizzle client. Used directly by scripts and tests; app code imports `db` from
 * ./client (server-only), which wraps this.
 */
export function createDb(connectionString: string, options: { max?: number } = {}) {
  if (!connectionString) throw new Error('DATABASE_URL is not set (copy .env.example to .env.local).');
  const pool = new Pool({
    connectionString,
    max: options.max ?? 10,
    // A database that doesn't answer fails the request in 5 s instead of holding it until the operating system gives up
    // on the connection, minutes later: the page or action shows its error, the job runner tries again the next minute
    // (when things break, 2026-11-21).
    connectionTimeoutMillis: 5_000,
  });
  // An idle client whose connection drops (the database restarted, a network blip) makes the pool emit 'error'. With no
  // listener Node treats it as uncaught and the server process exits, taking every page with it. The pool has already
  // discarded that client and opens a new one for the next query, so saying so is all there is to do.
  pool.on('error', (error) => console.error('[db] an idle connection was lost:', error.message));
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
