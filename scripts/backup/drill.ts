/**
 * Restore drill (docs/runbooks/backup-and-restore.md): backs up a database the way the nightly job does, restores it
 * into a throwaway Postgres container the way a new server would, checks everything, and times each step. Nothing
 * live is touched: the backup goes to a scratch folder, and the key pair is made for the drill and thrown away.
 *
 *   npx tsx scripts/backup/drill.ts [--database tasksnearme_e2e] [--uploads .data/uploads] [--field-key-from .env]
 *       [--pg-container tasksnearme-db] [--pg-user tnm] [--work-dir /home/ubuntu/tnm-analyze/backup-drill] [--keep]
 *
 * The throwaway container uses the source container's image, keeps its data in memory (tmpfs) and publishes no
 * port; it's removed at the end, with the scratch folder (unless --keep).
 */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { mb, runBackup } from './lib/backup';
import { runRestore } from './lib/restore';
import { localStore } from './lib/store';
import { gpg, makeGpgHome, removeGpgHome, run, stopGpgAgent } from './lib/tools';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function treeHashes(dir: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  const walk = async (at: string): Promise<void> => {
    for (const entry of await fs.readdir(at, { withFileTypes: true })) {
      const next = path.join(at, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile()) hashes.set(path.relative(dir, next), createHash('sha256').update(await fs.readFile(next)).digest('hex'));
    }
  };
  await walk(dir);
  return hashes;
}

async function fieldKeyFrom(envFile: string | undefined): Promise<string | null> {
  if (!envFile) return null;
  const line = (await fs.readFile(envFile, 'utf8')).split('\n').find((entry) => entry.startsWith('FIELD_ENCRYPTION_KEY='));
  return line?.slice('FIELD_ENCRYPTION_KEY='.length).trim().replace(/^["']|["']$/g, '') || null;
}

async function waitForPostgres(container: string, user: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  // The image's entrypoint runs a socket-only server while it initializes, then restarts: wait for the restart.
  while (Date.now() < deadline) {
    const logs = await run({ name: 'docker logs', cmd: 'docker', args: ['logs', container] }).catch(() => '');
    if (logs.includes('PostgreSQL init process complete')) {
      const ready = await run({ name: 'psql', cmd: 'docker', args: ['exec', container, 'psql', '-U', user, '-d', 'postgres', '-Atc', 'SELECT 1'] }).catch(() => '');
      if (ready.trim() === '1') return;
    }
    await sleep(250);
  }
  throw new Error(`The throwaway Postgres ${container} didn't come up in 2 minutes.`);
}

async function main(): Promise<void> {
  process.umask(0o077);
  const { values } = parseArgs({
    options: {
      database: { type: 'string', default: 'tasksnearme_e2e' },
      uploads: { type: 'string' },
      'field-key-from': { type: 'string' },
      'pg-container': { type: 'string', default: 'tasksnearme-db' },
      'pg-user': { type: 'string', default: 'tnm' },
      'work-dir': { type: 'string', default: '/home/ubuntu/tnm-analyze/backup-drill' },
      keep: { type: 'boolean', default: false },
    },
  });
  const database = values.database ?? 'tasksnearme_e2e';
  const source = { container: values['pg-container'] ?? 'tasksnearme-db', user: values['pg-user'] ?? 'tnm' };
  const uploadsDir = values.uploads ? path.resolve(values.uploads) : null;
  const fieldKey = await fieldKeyFrom(values['field-key-from']);
  await fs.mkdir(values['work-dir'] ?? '', { recursive: true, mode: 0o700 });
  const work = await fs.mkdtemp(path.join(values['work-dir'] ?? '', 'drill-'));
  const keys = await makeGpgHome();
  const container = `tnm-restore-drill-${process.pid}`;
  const steps: Array<[string, number]> = [];
  const timed = async <T>(name: string, task: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try {
      return await task();
    } finally {
      steps.push([name, Math.round(performance.now() - started)]);
    }
  };
  let containerStarted = false;
  try {
    const uid = 'TasksNearMe restore drill';
    await timed('drill key pair', async () => {
      await run(gpg(keys, ['--batch', '--pinentry-mode', 'loopback', '--passphrase', '', '--quick-generate-key', uid, 'default', 'default', 'never']));
      await fs.writeFile(path.join(work, 'public.asc'), await run(gpg(keys, ['--armor', '--export', uid])));
      await fs.writeFile(path.join(work, 'private.asc'), await run(gpg(keys, ['--batch', '--pinentry-mode', 'loopback', '--passphrase', '', '--armor', '--export-secret-keys', uid])));
      await fs.writeFile(path.join(work, 'passphrase'), '');
    });
    await stopGpgAgent(keys);
    const settings = path.join(work, 'settings', 'drill.env');
    await fs.mkdir(path.dirname(settings), { mode: 0o700 });
    await fs.writeFile(settings, 'DRILL=1\n');

    const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const backup = await timed('backup', () =>
      runBackup({
        database,
        pg: source,
        uploadsDir,
        configFiles: [settings],
        publicKeyFile: path.join(work, 'public.asc'),
        targets: [{ store: localStore(path.join(work, 'store')), keep: { daily: 7, weekly: 4, monthly: 0 } }],
        workDir: work,
        revision,
      }),
    );
    if (backup.stores.some((store) => store.error)) throw new Error('The backup failed (above).');

    const image = (await run({ name: 'docker inspect', cmd: 'docker', args: ['inspect', '-f', '{{.Config.Image}}', source.container] })).trim();
    await timed(`fresh Postgres (${image})`, async () => {
      await run({
        name: 'docker run',
        cmd: 'docker',
        args: ['run', '-d', '--rm', '--name', container, '-e', `POSTGRES_USER=${source.user}`, '-e', `POSTGRES_PASSWORD=${randomBytes(18).toString('hex')}`,
          '--memory', '512m', '--tmpfs', '/var/lib/postgresql/data:rw,size=1024m', image],
      });
      containerStarted = true;
      await waitForPostgres(container, source.user);
    });

    const restored = path.join(work, 'restored');
    const report = await timed('restore', () =>
      runRestore({
        store: localStore(path.join(work, 'store')),
        backup: 'latest',
        privateKeyFile: path.join(work, 'private.asc'),
        gnupgHome: null,
        passphraseFile: path.join(work, 'passphrase'),
        workDir: work,
        database: { pg: { container, user: source.user }, target: database, owner: null, replace: false },
        uploadsTo: uploadsDir ? path.join(restored, 'uploads') : null,
        configTo: path.join(restored, 'config'),
        fieldKey,
        verifyOnly: false,
      }),
    );

    if (uploadsDir) {
      const [before, after] = await Promise.all([treeHashes(uploadsDir), treeHashes(path.join(restored, 'uploads'))]);
      const same = before.size === after.size && [...before].every(([file, hash]) => after.get(file) === hash);
      if (same) report.checks.push(`every uploaded file (${before.size}) is byte for byte the original`);
      else report.problems.push(`the restored uploads differ from the originals (${before.size} files before, ${after.size} after)`);
    }
    const restoredSettings = await fs.readFile(path.join(restored, 'config', path.relative('/', settings)), 'utf8').catch(() => '');
    if (restoredSettings === 'DRILL=1\n') report.checks.push('the settings file came back as it was');
    else report.problems.push('the settings file did not come back');

    console.log('');
    console.log(`Drill: ${database} (${Object.keys(report.manifest.database.rows).length} tables, ${Object.values(report.manifest.database.rows).reduce((sum, rows) => sum + rows, 0)} rows)`);
    console.log(`Backup files: ${backup.files.map((file) => `${file.name} ${mb(file.bytes)}`).join(', ')}`);
    console.log('Steps (ms):');
    for (const [step, ms] of steps) console.log(`  ${step}: ${ms}`);
    console.log(`  backup in detail: ${Object.entries(backup.timingsMs).map(([step, ms]) => `${step} ${ms}`).join(', ')}`);
    console.log(`  restore in detail: ${Object.entries(report.timingsMs).map(([step, ms]) => `${step} ${ms}`).join(', ')}`);
    for (const check of report.checks) console.log(`ok: ${check}`);
    for (const problem of report.problems) console.log(`PROBLEM: ${problem}`);
    if (report.problems.length > 0) process.exitCode = 1;
  } finally {
    if (containerStarted && !values.keep) await run({ name: 'docker stop', cmd: 'docker', args: ['stop', container] }).catch(() => {});
    await removeGpgHome(keys);
    if (!values.keep) await fs.rm(work, { recursive: true, force: true });
    else console.log(`kept ${work}${containerStarted ? ` and the container ${container}` : ''}`);
  }
}

main().catch((error: unknown) => {
  console.error(`drill failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
