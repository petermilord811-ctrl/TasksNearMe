#!/usr/bin/env node
/**
 * The e2e suite's own database, tasksnearme_e2e, beside the dev database (DATABASE_URL) and the integration tests'
 * (TEST_DATABASE_URL). e2e runs then never reseed the data people browse on the dev server, and the dev server's job
 * runner never takes e2e's jobs (it had sent an e2e email with a link to :3000). Its URL is DATABASE_URL with the
 * database name swapped, so it needs no setting of its own.
 *
 *   node scripts/e2e-db.mjs url       prints the URL
 *   node scripts/e2e-db.mjs prepare   creates it when missing, then migrates and seeds it (idempotent)
 *
 * `heavy.mjs --e2e-build` and the gate prepare it before the e2e build, and build and serve against it;
 * playwright.config.ts points the e2e build's tests at it.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';

export const E2E_DATABASE = 'tasksnearme_e2e';
const root = path.resolve(import.meta.dirname, '..');

/** DATABASE_URL (from the environment, else .env.local) with the database name swapped for the e2e one. */
export function e2eDatabaseUrl(env = process.env) {
  if (!env.DATABASE_URL) {
    try {
      process.loadEnvFile(path.join(root, '.env.local'));
    } catch {
      // Environment provided by the shell (CI).
    }
  }
  const base = env.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set (see .env.example).');
  const url = new URL(base);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw new Error('The e2e database lives beside a local dev database only.');
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
}

async function prepare() {
  const url = e2eDatabaseUrl();
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('select 1 from pg_database where datname = $1', [E2E_DATABASE]);
    if (rowCount === 0) await client.query(`create database ${E2E_DATABASE}`);
  } finally {
    await client.end();
  }
  for (const step of ['migrate', 'seed']) {
    const result = spawnSync('npx', ['tsx', 'db/scripts/cli.ts', step], { cwd: root, stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
    if (result.status !== 0) throw new Error(`db ${step} on ${E2E_DATABASE} failed (exit ${result.status}).`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  if (command === 'url') console.log(e2eDatabaseUrl());
  else if (command === 'prepare') await prepare();
  else {
    console.error('Usage: node scripts/e2e-db.mjs <url|prepare>');
    process.exit(2);
  }
}
