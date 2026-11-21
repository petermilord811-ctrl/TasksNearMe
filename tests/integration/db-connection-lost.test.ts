import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createDb } from '@/platform/db/connect';

/**
 * When things break (2026-11-21): the database restarting, or a network blip, drops the pool's idle connections. The
 * pool emits 'error' for each; unheard, that ends the server process. This drops one for real (the backend is
 * terminated from another connection) and expects the pool to log it and carry on with a new connection.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 1 });
const admin = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 1 });
afterAll(async () => { await pool.end(); await admin.pool.end(); });

describe('a lost database connection', () => {
  it('is logged, not fatal, and the next query gets a new connection', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    const pid = before.rows[0]!.pid;
    // The client is idle in the pool now; end its backend as a restart would.
    const lost = new Promise<void>((resolve) => pool.once('error', () => resolve()));
    await admin.db.execute(sql`select pg_terminate_backend(${pid})`);
    await lost;
    expect(logged).toHaveBeenCalledWith('[db] an idle connection was lost:', expect.any(String));
    const after = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    expect(after.rows[0]!.pid).not.toBe(pid);
    logged.mockRestore();
  });

  it('gives up on a database that doesn’t answer in 5 s', () => {
    expect((pool as unknown as { options: { connectionTimeoutMillis?: number } }).options.connectionTimeoutMillis).toBe(5_000);
  });
});
