/**
 * Postgres for backups, through `docker exec` into the database's container: the host needs no Postgres tools, the
 * tools always match the server's version, and the container's superuser connects over its local socket, so no
 * password is involved.
 */
import { spawn } from 'node:child_process';
import { run, type Stage } from './tools';

export interface PgTarget {
  container: string;
  /** A superuser in the container (the image's POSTGRES_USER). */
  user: string;
}

const SEP = '\x1f';
const PSQL_FLAGS = ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-F', SEP];

export function pgStage(pg: PgTarget, tool: 'pg_dump' | 'pg_restore' | 'psql', args: string[], options: { stdin?: boolean } = {}): Stage {
  return { name: tool, cmd: 'docker', args: ['exec', ...(options.stdin ? ['-i'] : []), pg.container, tool, '-U', pg.user, ...args] };
}

const rowsOf = (out: string): string[][] =>
  out
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split(SEP));

/** One statement's rows. */
export async function query(pg: PgTarget, database: string, sql: string): Promise<string[][]> {
  return rowsOf(await run(pgStage(pg, 'psql', ['-d', database, ...PSQL_FLAGS, '-c', sql])));
}

export async function toolVersion(pg: PgTarget, tool: 'pg_dump' | 'pg_restore'): Promise<string> {
  // --version is only read as the first argument, so no -U here.
  return (await run({ name: tool, cmd: 'docker', args: ['exec', pg.container, tool, '--version'] })).trim();
}

export interface SqlSession {
  query(sql: string): Promise<string[][]>;
  close(): Promise<void>;
}

/**
 * A read-only REPEATABLE READ transaction that exports its snapshot: pg_dump given `--snapshot` dumps exactly what
 * this session sees, so the row counts it takes are the dump's. Keep it open until pg_dump has finished.
 */
export async function openSnapshot(pg: PgTarget, database: string): Promise<SqlSession & { snapshot: string }> {
  const child = spawn('docker', ['exec', '-i', pg.container, 'psql', '-U', pg.user, '-d', database, ...PSQL_FLAGS], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  let stderr = '';
  let failure: Error | null = null;
  let pending: { marker: string; resolve: (out: string) => void; reject: (error: Error) => void } | null = null;
  const fail = (error: Error) => {
    failure ??= error;
    pending?.reject(failure);
    pending = null;
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    if (!pending) return;
    const at = buffer.indexOf(`${pending.marker}\n`);
    if (at === -1) return;
    const out = buffer.slice(0, at);
    buffer = buffer.slice(at + pending.marker.length + 1);
    const { resolve } = pending;
    pending = null;
    resolve(out);
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  child.stdin.on('error', () => {}); // psql exited: its exit handler says why
  child.on('error', (error) => fail(new Error(`psql could not start: ${error.message}`)));
  const exited = new Promise<void>((resolve) => {
    child.on('close', (code) => {
      fail(new Error(code === 0 ? 'psql ended' : `psql failed (exit ${code}): ${stderr.trim().slice(-800)}`));
      resolve();
    });
  });

  let counter = 0;
  const send = (sql: string) =>
    new Promise<string>((resolve, reject) => {
      if (failure) return reject(failure);
      counter += 1;
      const marker = `__tnm_backup_${process.pid}_${counter}__`;
      pending = { marker, resolve, reject };
      child.stdin.write(`${sql.trim().replace(/;$/, '')};\n\\echo ${marker}\n`);
    });

  try {
    await send('BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const snapshot = (await send('SELECT pg_export_snapshot()')).trim();
    if (!/^[0-9A-F-]+$/i.test(snapshot)) throw new Error(`Unexpected snapshot id from psql: ${snapshot.slice(0, 40)}`);
    return {
      snapshot,
      query: async (sql) => rowsOf(await send(sql)),
      async close() {
        if (!failure) child.stdin.end('COMMIT;\n\\q\n');
        await exited;
      },
    };
  } catch (error) {
    child.kill();
    await exited;
    throw error;
  }
}

/** User tables, quoted the way SQL needs them; tables an extension owns (PostGIS's spatial_ref_sys) are left out. */
const TABLES_SQL = `
  SELECT format('%I.%I', n.nspname, c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
  ORDER BY 1`;

const ROLES_SQL = `
  SELECT DISTINCT rolname FROM (
    SELECT pg_get_userbyid(datdba) AS rolname FROM pg_database WHERE datname = current_database()
    UNION SELECT pg_get_userbyid(n.nspowner) FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'
    UNION SELECT pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'
    UNION SELECT pg_get_userbyid(acl.grantee) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(c.relacl) acl
      WHERE c.relacl IS NOT NULL AND acl.grantee <> 0 AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'
  ) roles WHERE rolname NOT LIKE 'pg\\_%' ORDER BY 1`;

export interface DatabaseFacts {
  owner: string;
  roles: string[];
  serverVersion: string;
  extensions: string[];
  lastMigration: { hash: string; createdAt: string } | null;
  rows: Record<string, number>;
}

/** What a backup's manifest records about a database, and what a restore is checked against. */
export async function databaseFacts(session: SqlSession): Promise<DatabaseFacts> {
  const one = async (sql: string) => (await session.query(sql))[0]?.[0] ?? '';
  const owner = await one('SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()');
  const roles = (await session.query(ROLES_SQL)).map((row) => row[0] ?? '').filter(Boolean);
  const serverVersion = await one('SHOW server_version');
  const extensions = (await session.query("SELECT extname || ' ' || extversion FROM pg_extension ORDER BY 1")).map((row) => row[0] ?? '');
  let lastMigration: DatabaseFacts['lastMigration'] = null;
  if ((await one("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL")) === 't') {
    const row = (await session.query('SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at DESC, id DESC LIMIT 1'))[0];
    if (row?.[0]) lastMigration = { hash: row[0], createdAt: row[1] ?? '' };
  }
  const tables = (await session.query(TABLES_SQL)).map((row) => row[0] ?? '').filter(Boolean);
  const rows: Record<string, number> = {};
  for (let at = 0; at < tables.length; at += 50) {
    const batch = tables.slice(at, at + 50);
    const sql = batch.map((table) => `SELECT '${table.replace(/'/g, "''")}', count(*) FROM ${table}`).join(' UNION ALL ');
    for (const [table, count] of await session.query(sql)) if (table) rows[table] = Number(count);
  }
  return { owner, roles, serverVersion, extensions, lastMigration, rows };
}

/** A plain session (no snapshot) for reading a restored database's facts. */
export function plainSession(pg: PgTarget, database: string): SqlSession {
  return { query: (sql) => query(pg, database, sql), close: async () => {} };
}
