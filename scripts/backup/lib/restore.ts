/**
 * Restores a backup (docs/runbooks/backup-and-restore.md): downloads its folder, checks SHA256SUMS, decrypts with
 * the owner's private key, and streams the dump into pg_restore and the archives into tar, so no plaintext dump
 * reaches the disk. Then it checks the result against the manifest: every table's rows (counted in the dump's own
 * snapshot, so they must match exactly), the last migration, and, given FIELD_ENCRYPTION_KEY, that the key opens
 * the restored encrypted fields.
 *
 * It never writes over the database the backup came from (restore next to it and switch, as the runbook says),
 * and it only extracts files into an empty or new folder.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldCipher } from '../../../src/platform/crypto/field-encryption';
import {
  FILES,
  SUMS_FILE,
  checkIdentifier,
  groupListing,
  parseManifest,
  parseSums,
  refKey,
  rowDifferences,
  type BackupManifest,
  type ListedBackup,
} from './plan';
import { databaseFacts, pgStage, plainSession, query, type PgTarget } from './postgres';
import type { BackupStore } from './store';
import { gpg, gpgDecrypt, makeGpgHome, removeGpgHome, run, sha256File, stopGpgAgent, stream } from './tools';

export interface RestoreOptions {
  store: BackupStore;
  /** `latest`, `<kind>/<stamp>`, or a bare stamp. */
  backup: string;
  /** A private key file to import into a temporary keyring; or null to use `gnupgHome` as it is. */
  privateKeyFile: string | null;
  gnupgHome: string | null;
  passphraseFile: string | null;
  workDir: string;
  database: { pg: PgTarget; target: string; owner: string | null; replace: boolean } | null;
  uploadsTo: string | null;
  configTo: string | null;
  /** FIELD_ENCRYPTION_KEY, to check it opens the restored encrypted fields. */
  fieldKey: string | null;
  /** Download, check and decrypt everything, but restore nothing. */
  verifyOnly: boolean;
  log?: (line: string) => void;
}

export interface RestoreReport {
  backup: string;
  manifest: BackupManifest;
  timingsMs: Record<string, number>;
  checks: string[];
  problems: string[];
}

export async function listBackups(store: BackupStore): Promise<ListedBackup[]> {
  return groupListing(await store.list(''));
}

export function pickBackup(backups: readonly ListedBackup[], wanted: string): ListedBackup {
  const complete = backups.filter((backup) => backup.complete);
  const found =
    wanted === 'latest'
      ? complete[0]
      : complete.find((backup) => refKey(backup) === wanted) ?? complete.find((backup) => backup.stamp === wanted);
  if (!found) {
    throw new Error(wanted === 'latest' ? 'No complete backup there.' : `No complete backup ${wanted} there (--list shows them).`);
  }
  return found;
}

async function emptyFolder(dir: string): Promise<string> {
  const entries = await fs.readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  if (entries.length > 0) throw new Error(`${dir} isn't empty: give an empty or new folder.`);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

const ENCRYPTED_FIELD = String.raw`^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.`;

/** The first value in the database that looks like a FIELD_ENCRYPTION_KEY field (`v1.<iv>.<tag>.<data>`). */
async function findEncryptedValue(pg: PgTarget, database: string): Promise<{ column: string; value: string } | null> {
  const columns = await query(
    pg,
    database,
    `SELECT format('%I.%I', table_schema, table_name), quote_ident(column_name) FROM information_schema.columns
     WHERE table_schema = 'public' AND data_type IN ('text', 'character varying') ORDER BY 1, 2`,
  );
  for (let at = 0; at < columns.length; at += 100) {
    const sql = columns
      .slice(at, at + 100)
      .map(([table, column]) => `(SELECT '${`${table}.${column}`.replace(/'/g, "''")}', ${column}::text FROM ${table} WHERE ${column} ~ '${ENCRYPTED_FIELD}' LIMIT 1)`)
      .join(' UNION ALL ');
    const [row] = await query(pg, database, `SELECT * FROM (${sql}) found LIMIT 1`);
    if (row?.[0] && row[1]) return { column: row[0], value: row[1] };
  }
  return null;
}

export async function runRestore(options: RestoreOptions): Promise<RestoreReport> {
  const log = options.log ?? ((line: string) => console.log(line));
  const timingsMs: Record<string, number> = {};
  const timed = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try {
      return await work();
    } finally {
      timingsMs[name] = Math.round(performance.now() - started);
    }
  };
  const checks: string[] = [];
  const problems: string[] = [];

  const chosen = await timed('find', async () => pickBackup(await listBackups(options.store), options.backup));
  const label = refKey(chosen);
  log(`backup ${label} in ${options.store.label}`);

  await fs.mkdir(options.workDir, { recursive: true, mode: 0o700 });
  const work = await fs.mkdtemp(path.join(options.workDir, `.restore-${chosen.stamp}-`));
  let home = options.gnupgHome;
  let temporaryHome = false;
  try {
    await timed('download', async () => {
      for (const file of chosen.files) await options.store.get(`${label}/${file.name}`, path.join(work, file.name));
    });
    const sums = parseSums(await fs.readFile(path.join(work, SUMS_FILE), 'utf8'));
    await timed('checksums', async () => {
      for (const [name, sha256] of sums) {
        const found = await sha256File(path.join(work, name)).catch(() => null);
        if (found?.sha256 !== sha256) throw new Error(`${name} doesn't match SHA256SUMS: the download is damaged or incomplete.`);
      }
    });
    checks.push(`${sums.size} files match SHA256SUMS`);

    if (options.privateKeyFile) {
      home = await makeGpgHome();
      temporaryHome = true;
      await run(gpg(home, ['--batch', '--import', options.privateKeyFile]));
      // GnuPG 2.4's agent can answer "Bad secret key" for a key it has just imported; a fresh agent reads it from disk.
      await stopGpgAgent(home);
    }
    if (!home) throw new Error('Give the private key (--private-key) or a keyring that holds it (--gnupghome).');
    const keyring = home;
    const decrypt = (name: string) => gpgDecrypt(keyring, path.join(work, name), options.passphraseFile);
    const matches = (name: string, got: { sha256: string; bytes: number }, manifest: BackupManifest) => {
      const want = manifest.files[name];
      if (want && want.sha256 === got.sha256 && want.bytes === got.bytes) return true;
      problems.push(`${name} decrypted to something other than what was backed up`);
      return false;
    };

    const manifest = parseManifest((await timed('manifest', () => stream(decrypt(FILES.manifest), 'collect'))).output.toString('utf8'));
    log(`made ${manifest.createdAt} from ${manifest.database.name} (Postgres ${manifest.database.serverVersion.split(' ')[0]})${manifest.revision ? `, release ${manifest.revision.slice(0, 7)}` : ''}`);

    if (options.verifyOnly) {
      await timed('decrypt', async () => {
        for (const name of Object.keys(manifest.files)) {
          if (matches(name, await stream(decrypt(name), 'discard'), manifest)) checks.push(`${name} decrypts and matches the manifest`);
        }
      });
      return { backup: label, manifest, timingsMs, checks, problems };
    }

    if (options.database) {
      const { pg, replace } = options.database;
      const target = checkIdentifier(options.database.target, 'The database');
      const owner = checkIdentifier(options.database.owner ?? manifest.database.owner, 'The owner');
      if (replace && target === manifest.database.name) {
        throw new Error(`--replace won't drop ${target}, the database this backup came from. Restore under another name, check it, then switch (runbook).`);
      }
      await timed('database', async () => {
        const present = await query(pg, 'postgres', `SELECT 1 FROM pg_database WHERE datname = '${target}'`);
        if (present.length > 0) {
          if (!replace) throw new Error(`The database ${target} already exists: pick another name, or add --replace to drop it first.`);
          await query(pg, 'postgres', `DROP DATABASE "${target}" WITH (FORCE)`);
          log(`dropped the existing ${target}`);
        }
        for (const role of new Set([...manifest.database.roles, owner])) {
          checkIdentifier(role, 'A role');
          if ((await query(pg, 'postgres', `SELECT 1 FROM pg_roles WHERE rolname = '${role}'`)).length > 0) continue;
          await query(pg, 'postgres', `CREATE ROLE "${role}"${role === owner ? ' LOGIN' : ''}`);
          checks.push(`created the role ${role} without a password: set one (ALTER ROLE ${role} PASSWORD ...) before the app connects`);
        }
        await query(pg, 'postgres', `CREATE DATABASE "${target}" OWNER "${owner}" TEMPLATE template0`);
        const restore = pgStage(pg, 'pg_restore', ['-d', target, '--exit-on-error', '--single-transaction', '--no-password'], { stdin: true });
        if (matches(FILES.database, await stream(decrypt(FILES.database), restore), manifest)) checks.push(`the dump decrypted and restored into ${target}`);
      });

      await timed('database checks', async () => {
        const facts = await databaseFacts(plainSession(pg, target));
        const differences = rowDifferences(manifest.database.rows, facts.rows);
        if (differences.length === 0) checks.push(`all ${Object.keys(facts.rows).length} tables have the backup's row counts`);
        else problems.push(`row counts differ in ${differences.length} tables: ${differences.slice(0, 5).join('; ')}`);
        const want = manifest.database.lastMigration?.hash ?? null;
        const got = facts.lastMigration?.hash ?? null;
        if (want === got) checks.push(want ? `last migration ${want.slice(0, 12)}, as backed up` : 'no migrations table, as backed up');
        else problems.push(`last migration ${got ?? 'none'}, but the backup had ${want ?? 'none'}`);
        const missing = manifest.database.extensions.filter((extension) => !facts.extensions.includes(extension));
        if (missing.length > 0) problems.push(`extensions differ: the backup had ${missing.join(', ')}; restored ${facts.extensions.join(', ') || 'none'}`);
        if (options.fieldKey) {
          const sample = await findEncryptedValue(pg, target);
          if (!sample) checks.push('no encrypted fields to try FIELD_ENCRYPTION_KEY on');
          else {
            try {
              createFieldCipher(options.fieldKey).decrypt(sample.value);
              checks.push(`FIELD_ENCRYPTION_KEY opens the restored encrypted fields (tried ${sample.column})`);
            } catch {
              problems.push(`FIELD_ENCRYPTION_KEY doesn't open ${sample.column}: it's not the key this data was written with`);
            }
          }
        }
      });
    }

    const extract = async (name: string, dir: string, step: string) => {
      const into = await emptyFolder(dir);
      const tar = { name: 'tar', cmd: 'tar', args: ['-xzf', '-', '-C', into, '--no-same-owner'] };
      return timed(step, async () => matches(name, await stream(decrypt(name), tar), manifest));
    };
    if (options.uploadsTo) {
      if (!manifest.files[FILES.uploads]) checks.push('the backup has no uploaded files');
      else if (await extract(FILES.uploads, options.uploadsTo, 'uploads')) {
        checks.push(`uploaded files restored into ${options.uploadsTo} (${manifest.uploads?.files ?? '?'} files when backed up)`);
      }
    }
    if (options.configTo) {
      if (!manifest.files[FILES.config]) checks.push('the backup has no settings files');
      else if (await extract(FILES.config, options.configTo, 'config')) {
        checks.push(`settings files restored into ${options.configTo}: ${manifest.config.join(', ')} (copy them into place by hand)`);
      }
    }
    return { backup: label, manifest, timingsMs, checks, problems };
  } finally {
    if (home && temporaryHome) await removeGpgHome(home);
    await fs.rm(work, { recursive: true, force: true });
  }
}
