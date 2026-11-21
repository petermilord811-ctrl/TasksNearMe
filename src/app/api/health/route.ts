import { sql } from 'drizzle-orm';
import { connection } from 'next/server';
import { runnerHealth, runnerState } from '@/modules/jobs/watch';
import { db } from '@/platform/db/client';

/**
 * Health for an outside check (when things break, 2026-11-21; docs/runbooks/database-unreachable.md). The on-call pager
 * needs the database, so a database that's down, or a server that's gone, can only be caught from outside: a monitor
 * calls this every minute and pages when it isn't 200. 200 when the database answers `select 1` within 3 s and this
 * server's job runner isn't stuck; 503 otherwise. It says only which part is down, never anything about anyone.
 */
const DATABASE_WAIT_MS = 3_000;

export async function GET(): Promise<Response> {
  await connection();
  const database = await Promise.race([
    db.execute(sql`select 1`).then(() => 'ok' as const, () => 'down' as const),
    new Promise<'down'>((resolve) => setTimeout(() => resolve('down'), DATABASE_WAIT_MS)),
  ]);
  const jobs = runnerHealth(runnerState(), Date.now());
  const ok = database === 'ok' && jobs !== 'stalled';
  return Response.json({ ok, database, jobs }, { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
