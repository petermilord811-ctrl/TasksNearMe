/**
 * A scratch database at realistic volume, for checking the hot queries with EXPLAIN (completion plan 5.7):
 *   npx tsx scripts/perf/scratch-db.ts [copies]     (default 100)
 * Creates `tasksnearme_perf` next to the dev database (same server, from .env.local's DATABASE_URL), migrates it,
 * seeds it, then multiplies the seed (scripts/perf/multiply.ts). The dev database is reseeded by every e2e run and
 * the test database by test:db, so neither is used. Local only.
 */
import pg from 'pg';
import { loadEnv, migrateDatabase } from '../../db/scripts/lib';
import { seedDatabase } from '../../db/seeds/seed';
import { multiply } from './multiply';

loadEnv();
const devUrl = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', '::1'].includes(devUrl.hostname)) throw new Error('The scratch database is for a local Postgres only');
const perfUrl = new URL(devUrl);
perfUrl.pathname = '/tasksnearme_perf';
const copies = Number(process.argv[2] ?? 100);

async function main() {
  const admin = new pg.Client({ connectionString: Object.assign(new URL(devUrl), { pathname: '/postgres' }).toString() });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS tasksnearme_perf WITH (FORCE)');
  await admin.query('CREATE DATABASE tasksnearme_perf');
  await admin.end();

  await migrateDatabase(perfUrl.toString());
  await seedDatabase(perfUrl.toString());
  const counts = await multiply(perfUrl.toString(), copies);
  console.log(JSON.stringify(counts, null, 1));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
