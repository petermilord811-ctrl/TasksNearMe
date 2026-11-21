/**
 * Backup settings from the environment: deploy/backup/backup.env.example lists and explains each one. They live
 * in their own root-only file on the server (/etc/tasksnearme-backup/backup.env), never in the app's preview.env,
 * so the app can't reach the backup bucket's keys.
 */
import os from 'node:os';
import path from 'node:path';
import type { BackupOptions } from './backup';
import { retentionFrom } from './plan';
import { bucketStore, localStore, type BackupStore } from './store';

type Env = Record<string, string | undefined>;

const value = (env: Env, name: string) => env[name]?.trim() || '';

/** The R2 bucket the settings name, or null when BACKUP_R2_BUCKET is empty. */
export function bucketFromEnv(env: Env): BackupStore | null {
  const bucket = value(env, 'BACKUP_R2_BUCKET');
  if (!bucket) return null;
  const accountId = value(env, 'BACKUP_R2_ACCOUNT_ID');
  const endpoint = value(env, 'BACKUP_R2_ENDPOINT') || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
  const accessKeyId = value(env, 'BACKUP_R2_ACCESS_KEY_ID');
  const secretAccessKey = value(env, 'BACKUP_R2_SECRET_ACCESS_KEY');
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('BACKUP_R2_BUCKET is set: also set BACKUP_R2_ACCOUNT_ID (or BACKUP_R2_ENDPOINT), BACKUP_R2_ACCESS_KEY_ID and BACKUP_R2_SECRET_ACCESS_KEY.');
  }
  return bucketStore({ endpoint, bucket, prefix: value(env, 'BACKUP_R2_PREFIX') || 'tasksnearme', accessKeyId, secretAccessKey });
}

export function pgFromEnv(env: Env): BackupOptions['pg'] {
  return { container: value(env, 'BACKUP_PG_CONTAINER') || 'tasksnearme-db', user: value(env, 'BACKUP_PG_USER') || 'tnm' };
}

export function backupOptionsFromEnv(env: Env): Omit<BackupOptions, 'revision'> {
  const database = value(env, 'BACKUP_DATABASE');
  if (!database) throw new Error('Set BACKUP_DATABASE (the database to back up, e.g. tasksnearme_preview).');
  const publicKeyFile = value(env, 'BACKUP_PUBLIC_KEY');
  if (!publicKeyFile) throw new Error('Set BACKUP_PUBLIC_KEY (the owner\'s public key file; backups are encrypted to it).');

  const targets: BackupOptions['targets'] = [];
  const localDir = value(env, 'BACKUP_LOCAL_DIR');
  if (localDir) targets.push({ store: localStore(localDir), keep: retentionFrom(env, 'BACKUP_LOCAL', { daily: 3, weekly: 0, monthly: 0 }) });
  const bucket = bucketFromEnv(env);
  if (bucket) targets.push({ store: bucket, keep: retentionFrom(env, 'BACKUP_R2', { daily: 7, weekly: 4, monthly: 0 }) });
  if (targets.length === 0) throw new Error('Set BACKUP_LOCAL_DIR, BACKUP_R2_BUCKET, or both.');

  const configFiles = value(env, 'BACKUP_CONFIG_FILES').split(/[\s,]+/).filter(Boolean);
  const relative = configFiles.find((file) => !path.isAbsolute(file));
  if (relative) throw new Error(`BACKUP_CONFIG_FILES takes absolute paths: ${relative}`);

  return {
    database,
    pg: pgFromEnv(env),
    uploadsDir: value(env, 'BACKUP_UPLOADS_DIR') || null,
    configFiles,
    publicKeyFile,
    targets,
    workDir: value(env, 'BACKUP_WORK_DIR') || (localDir ? path.join(localDir, '.work') : os.tmpdir()),
  };
}
