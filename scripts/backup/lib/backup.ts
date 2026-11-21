/**
 * One backup run (docs/runbooks/backup-and-restore.md):
 * 1. the database, dumped by pg_dump inside a snapshot whose row counts go into the manifest;
 * 2. the uploaded files and the chosen settings files, as tar archives;
 * 3. the manifest; each of these encrypted to the owner's public key as it streams, so no plaintext reaches the disk;
 * 4. SHA256SUMS of the encrypted files, written to each store last, under every kind due there (daily, weekly,
 *    monthly). Each copy is checked by listing it, and only then are a store's older backups pruned.
 * A store that fails doesn't stop the others; the report says which failed, and the command exits non-zero.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FILES,
  SUMS_FILE,
  formatSums,
  groupListing,
  kindsDue,
  refKey,
  stampOf,
  staleIncomplete,
  toPrune,
  type BackupManifest,
  type Retention,
} from './plan';
import { databaseFacts, openSnapshot, pgStage, toolVersion, type PgTarget } from './postgres';
import { BucketError, type BackupStore } from './store';
import { gpgEncrypt, makeGpgHome, removeGpgHome, sha256File, stream } from './tools';

export interface BackupTarget {
  store: BackupStore;
  keep: Retention;
}

export interface BackupOptions {
  database: string;
  pg: PgTarget;
  /** The uploaded files' folder (FILE_STORAGE=local), or null. */
  uploadsDir: string | null;
  /** Absolute paths of settings files to keep with the backup (preview.env, the Caddyfile). */
  configFiles: string[];
  publicKeyFile: string;
  targets: BackupTarget[];
  /** Where the encrypted files are assembled before they're stored. */
  workDir: string;
  revision: string | null;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface BackupReport {
  stamp: string;
  files: Array<{ name: string; bytes: number }>;
  stores: Array<{ label: string; wrote: string[]; pruned: string[]; error: string | null }>;
  timingsMs: Record<string, number>;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
export const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 2 : 1)} MB`;

async function countFiles(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const walk = async (at: string): Promise<void> => {
    for (const entry of await fs.readdir(at, { withFileTypes: true })) {
      const next = path.join(at, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile()) {
        files += 1;
        bytes += (await fs.stat(next)).size;
      }
    }
  };
  await walk(dir);
  return { files, bytes };
}

const exists = (file: string) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

export async function runBackup(options: BackupOptions): Promise<BackupReport> {
  const log = options.log ?? ((line: string) => console.log(line));
  const now = options.now?.() ?? new Date();
  const stamp = stampOf(now);
  const timingsMs: Record<string, number> = {};
  const timed = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try {
      return await work();
    } finally {
      timingsMs[name] = Math.round(performance.now() - started);
    }
  };
  if (options.targets.length === 0) throw new Error('Nowhere to write: set a local folder, an R2 bucket, or both.');
  if (!(await exists(options.publicKeyFile))) throw new Error(`The public key ${options.publicKeyFile} isn't there.`);

  await fs.mkdir(options.workDir, { recursive: true, mode: 0o700 });
  const staging = await fs.mkdtemp(path.join(options.workDir, `.backup-${stamp}-`));
  const gnupg = await makeGpgHome();
  const encryptTo = (name: string) => gpgEncrypt(gnupg, options.publicKeyFile, path.join(staging, name));
  const plaintext: BackupManifest['files'] = {};

  try {
    const facts = await timed('database', async () => {
      const session = await openSnapshot(options.pg, options.database);
      try {
        const found = await databaseFacts(session);
        const dump = pgStage(options.pg, 'pg_dump', ['-d', options.database, '-Fc', `--snapshot=${session.snapshot}`, '--no-password']);
        const dumped = await stream(dump, encryptTo(FILES.database));
        plaintext[FILES.database] = { bytes: dumped.bytes, sha256: dumped.sha256 };
        return found;
      } finally {
        await session.close();
      }
    });
    const dumpVersion = await toolVersion(options.pg, 'pg_dump');
    log(`database ${options.database}: ${Object.keys(facts.rows).length} tables, a ${mb(plaintext[FILES.database]?.bytes ?? 0)} dump (${timingsMs.database} ms)`);

    let uploads: BackupManifest['uploads'] = null;
    if (options.uploadsDir) {
      const dir = options.uploadsDir;
      uploads = await timed('uploads', async () => {
        const counted = await countFiles(dir);
        const tar = { name: 'tar', cmd: 'tar', args: ['-C', dir, '--warning=no-file-changed', '-czf', '-', '.'], okExit: [1] };
        const packed = await stream(tar, encryptTo(FILES.uploads));
        plaintext[FILES.uploads] = { bytes: packed.bytes, sha256: packed.sha256 };
        return counted;
      });
      log(`uploads ${dir}: ${uploads.files} files, ${mb(uploads.bytes)} (${timingsMs.uploads} ms)`);
    }

    const config: string[] = [];
    for (const file of options.configFiles) {
      if (await exists(file)) config.push(file);
      else log(`settings file ${file} isn't there: left out`);
    }
    if (config.length > 0) {
      await timed('config', async () => {
        const tar = { name: 'tar', cmd: 'tar', args: ['-C', '/', '-czf', '-', ...config.map((file) => path.relative('/', file))] };
        const packed = await stream(tar, encryptTo(FILES.config));
        plaintext[FILES.config] = { bytes: packed.bytes, sha256: packed.sha256 };
      });
      log(`settings: ${config.length} file${config.length === 1 ? '' : 's'}`);
    }

    const manifest: BackupManifest = {
      format: 1,
      createdAt: now.toISOString(),
      revision: options.revision,
      database: { name: options.database, dumpVersion, ...facts },
      files: plaintext,
      uploads,
      config,
    };
    await stream(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), encryptTo(FILES.manifest));

    const produced = [...Object.keys(plaintext), FILES.manifest];
    const sums = await Promise.all(produced.map(async (name) => ({ name, ...(await sha256File(path.join(staging, name))) })));
    await fs.writeFile(path.join(staging, SUMS_FILE), formatSums(sums), { mode: 0o600 });
    const sizes = new Map(sums.map((entry) => [entry.name, entry.bytes]));
    sizes.set(SUMS_FILE, (await fs.stat(path.join(staging, SUMS_FILE))).size);

    const stores: BackupReport['stores'] = [];
    for (const target of options.targets) {
      const entry: BackupReport['stores'][number] = { label: target.store.label, wrote: [], pruned: [], error: null };
      stores.push(entry);
      try {
        await timed(`store: ${target.store.label}`, async () => {
          const listed = groupListing(await target.store.list(''));
          const complete = listed.filter((backup) => backup.complete);
          const kinds = kindsDue(complete, now, target.keep);
          for (const kind of kinds) {
            const folder = refKey({ kind, stamp });
            for (const name of [...produced, SUMS_FILE]) await target.store.put(`${folder}/${name}`, path.join(staging, name));
            const stored = await target.store.list(`${folder}/`);
            for (const [name, bytes] of sizes) {
              const found = stored.find((object) => object.key === `${folder}/${name}`);
              if (found?.bytes !== bytes) throw new Error(`${folder}/${name} holds ${found ? `${found.bytes} bytes` : 'nothing'}, not ${bytes}`);
            }
            entry.wrote.push(folder);
          }
          const doomed = [...toPrune([...complete, ...kinds.map((kind) => ({ kind, stamp }))], target.keep), ...staleIncomplete(listed.filter((backup) => !backup.complete), now)];
          for (const ref of doomed) {
            const files = listed.find((backup) => backup.kind === ref.kind && backup.stamp === ref.stamp)?.files ?? [];
            // SHA256SUMS goes first: a folder that can't be deleted whole is then never restored half-gone.
            const names = files.map((file) => file.name).sort((a, b) => (a === SUMS_FILE ? -1 : b === SUMS_FILE ? 1 : 0));
            try {
              for (const name of names) await target.store.delete(`${refKey(ref)}/${name}`);
              entry.pruned.push(refKey(ref));
            } catch (error) {
              const locked = error instanceof BucketError && error.status === 403 ? ' (a bucket lock keeps it until its time is up)' : '';
              log(`kept ${refKey(ref)} in ${target.store.label}: ${messageOf(error)}${locked}`);
            }
          }
        });
        log(`${target.store.label}: wrote ${entry.wrote.join(', ')}${entry.pruned.length ? `; pruned ${entry.pruned.join(', ')}` : ''} (${timingsMs[`store: ${target.store.label}`]} ms)`);
      } catch (error) {
        entry.error = messageOf(error);
        log(`${target.store.label} failed: ${entry.error}`);
      }
    }
    return { stamp, files: [...sizes].map(([name, bytes]) => ({ name, bytes })), stores, timingsMs };
  } finally {
    await removeGpgHome(gnupg);
    await fs.rm(staging, { recursive: true, force: true });
  }
}
