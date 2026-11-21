/**
 * Restores a backup made by ./backup.ts (docs/runbooks/backup-and-restore.md has the full procedures).
 *
 *   restore --from <folder | r2> --list
 *   restore --from <folder | r2> [--backup latest | <kind>/<stamp>]
 *           (--private-key <file> | --gnupghome <dir>) [--passphrase-file <file>]
 *           [--database <new name> [--owner <role>] [--replace] [--pg-container tasksnearme-db] [--pg-user tnm]]
 *           [--uploads-to <empty folder>] [--config-to <empty folder>] [--check-field-key] [--verify-only]
 *           [--work-dir <dir>]
 *
 * `--from r2` reads BACKUP_R2_* from the environment (`node --env-file=/etc/tasksnearme-backup/backup.env ...`).
 * `--check-field-key` reads FIELD_ENCRYPTION_KEY from the environment. Without --passphrase-file, gpg asks for the
 * key's passphrase on the terminal. Exits non-zero when a check fails.
 */
import os from 'node:os';
import { parseArgs } from 'node:util';
import { bucketFromEnv, pgFromEnv } from './lib/config';
import { listBackups, runRestore } from './lib/restore';
import { localStore, type BackupStore } from './lib/store';

function storeFrom(from: string | undefined): BackupStore {
  if (!from) throw new Error('Say where the backups are: --from <folder> or --from r2.');
  if (from !== 'r2') return localStore(from);
  const bucket = bucketFromEnv(process.env);
  if (!bucket) throw new Error('--from r2 needs BACKUP_R2_BUCKET and its keys in the environment.');
  return bucket;
}

async function main(): Promise<void> {
  process.umask(0o077);
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      list: { type: 'boolean', default: false },
      backup: { type: 'string', default: 'latest' },
      'private-key': { type: 'string' },
      gnupghome: { type: 'string' },
      'passphrase-file': { type: 'string' },
      database: { type: 'string' },
      owner: { type: 'string' },
      replace: { type: 'boolean', default: false },
      'pg-container': { type: 'string' },
      'pg-user': { type: 'string' },
      'uploads-to': { type: 'string' },
      'config-to': { type: 'string' },
      'check-field-key': { type: 'boolean', default: false },
      'verify-only': { type: 'boolean', default: false },
      'work-dir': { type: 'string' },
    },
  });
  const store = storeFrom(values.from);
  if (values.list) {
    const backups = await listBackups(store);
    for (const backup of backups) {
      const bytes = backup.files.reduce((sum, file) => sum + file.bytes, 0);
      console.log(`${backup.kind}/${backup.stamp}  ${(bytes / 1_048_576).toFixed(2)} MB${backup.complete ? '' : '  (incomplete: never restored)'}`);
    }
    if (backups.length === 0) console.log(`no backups in ${store.label}`);
    return;
  }
  const fieldKey = values['check-field-key'] ? process.env.FIELD_ENCRYPTION_KEY?.trim() || null : null;
  if (values['check-field-key'] && !fieldKey) throw new Error('--check-field-key needs FIELD_ENCRYPTION_KEY in the environment.');
  const pg = pgFromEnv(process.env);
  const report = await runRestore({
    store,
    backup: values.backup ?? 'latest',
    privateKeyFile: values['private-key'] ?? null,
    gnupgHome: values.gnupghome ?? null,
    passphraseFile: values['passphrase-file'] ?? null,
    workDir: values['work-dir'] ?? os.tmpdir(),
    database: values.database
      ? {
          pg: { container: values['pg-container'] ?? pg.container, user: values['pg-user'] ?? pg.user },
          target: values.database,
          owner: values.owner ?? null,
          replace: values.replace ?? false,
        }
      : null,
    uploadsTo: values['uploads-to'] ?? null,
    configTo: values['config-to'] ?? null,
    fieldKey,
    verifyOnly: values['verify-only'] ?? false,
  });
  for (const check of report.checks) console.log(`ok: ${check}`);
  for (const problem of report.problems) console.log(`PROBLEM: ${problem}`);
  console.log(`timings (ms): ${Object.entries(report.timingsMs).map(([step, ms]) => `${step} ${ms}`).join(', ')}`);
  if (report.problems.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`restore failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
