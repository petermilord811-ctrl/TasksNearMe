import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Creates a Drizzle client. Used directly by scripts and tests; app code imports `db` from
 * ./client (server-only), which wraps this.
 */
export function createDb(connectionString: string, options: { max?: number } = {}) {
  if (!connectionString) throw new Error('DATABASE_URL is not set (copy .env.example to .env.local).');
  const pool = new Pool({ connectionString, max: options.max ?? 10 });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
