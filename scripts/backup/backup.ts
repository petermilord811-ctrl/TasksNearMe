/**
 * Nightly backup (docs/runbooks/backup-and-restore.md): the live database, the uploaded files and the settings
 * files, encrypted to the owner's public key, into a local folder and/or an R2 bucket. Settings come from the
 * environment (deploy/backup/backup.env.example):
 *
 *   node --env-file=/etc/tasksnearme-backup/backup.env /usr/local/lib/tasksnearme-backup/backup.cjs   # the server
 *   npx tsx scripts/backup/backup.ts                                                                  # the repo
 *
 * deploy/backup/setup-backup.sh builds backup.cjs and installs the nightly timer (the owner runs it). Exits
 * non-zero when any store failed; BACKUP_HEARTBEAT_URL, when set, is called only after a full success, so a
 * monitor that hears nothing for a day knows the backups stopped.
 */
import fs from 'node:fs/promises';
import { runBackup } from './lib/backup';
import { backupOptionsFromEnv } from './lib/config';

async function main(): Promise<void> {
  process.umask(0o077);
  const options = backupOptionsFromEnv(process.env);
  const revisionFile = process.env.BACKUP_REVISION_FILE?.trim();
  const revision = revisionFile ? (await fs.readFile(revisionFile, 'utf8').catch(() => '')).trim().slice(0, 64) || null : null;
  const report = await runBackup({ ...options, revision });
  const failed = report.stores.filter((store) => store.error);
  const seconds = (Object.values(report.timingsMs).reduce((sum, ms) => sum + ms, 0) / 1000).toFixed(1);
  console.log(`backup ${report.stamp}: ${failed.length === 0 ? 'done' : `${failed.length} of ${report.stores.length} stores failed`} in ${seconds} s`);
  if (failed.length > 0) {
    process.exitCode = 1;
    return;
  }
  const heartbeat = process.env.BACKUP_HEARTBEAT_URL?.trim();
  if (heartbeat) {
    // The URL itself is a secret (anyone holding it could fake a success), so it's never printed.
    await fetch(heartbeat, { signal: AbortSignal.timeout(10_000) })
      .then((response) => console.log(`heartbeat: ${response.status}`))
      .catch((error: unknown) => console.log(`heartbeat failed: ${error instanceof Error ? error.message : String(error)}`));
  }
}

main().catch((error: unknown) => {
  console.error(`backup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
