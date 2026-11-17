/**
 * Database lifecycle helpers shared by npm scripts and the integration-test setup.
 * Destructive operations refuse to run against anything but a local database.
 */
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../../src/platform/db/connect';
import { seedDatabase } from '../seeds/seed';

export function loadEnv(): void {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
}

function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to reset a non-local database (${host}).`);
  }
}

export async function migrateDatabase(url: string): Promise<void> {
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: path.join(process.cwd(), 'db', 'migrations') });
  } finally {
    await pool.end();
  }
}

export async function resetDatabase(url: string): Promise<void> {
  assertLocal(url);
  const { pool } = createDb(url, { max: 1 });
  try {
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } finally {
    await pool.end();
  }
  await migrateDatabase(url);
  await seedDatabase(url, { testWorld: true });
}
