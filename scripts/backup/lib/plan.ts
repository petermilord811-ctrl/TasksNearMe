/**
 * Backups (docs/runbooks/backup-and-restore.md): names, retention, checksums and the manifest. Pure, so it's
 * unit-tested (tests/unit/backup-plan.test.ts); ./backup.ts and ./restore.ts do the work.
 *
 * A backup is a folder `<kind>/<stamp>/` in a store (a local folder, or a prefix in an R2 bucket) holding the
 * encrypted files and `SHA256SUMS`. SHA256SUMS is written last, so a folder without it is incomplete: an
 * interrupted run left it, and it's never restored.
 */

export const KINDS = ['daily', 'weekly', 'monthly'] as const;
export type BackupKind = (typeof KINDS)[number];

/** How many complete backups of each kind a store keeps. */
export type Retention = Record<BackupKind, number>;

export interface BackupRef {
  kind: BackupKind;
  stamp: string;
}

export const SUMS_FILE = 'SHA256SUMS';
export const FILES = {
  database: 'db.dump.gpg',
  uploads: 'uploads.tar.gz.gpg',
  config: 'config.tar.gz.gpg',
  manifest: 'manifest.json.gpg',
} as const;

/** `2026-11-21T08-30-05Z`: UTC, sorts as text, and safe in file names and object keys. */
export function stampOf(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

export function dateOfStamp(stamp: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/.exec(stamp);
  if (!match) return null;
  const date = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);
  return Number.isNaN(date.getTime()) || stampOf(date) !== stamp ? null : date;
}

export const refKey = (ref: BackupRef): string => `${ref.kind}/${ref.stamp}`;

export function parseRefKey(key: string): BackupRef | null {
  const parts = key.split('/');
  const [kind, stamp] = parts;
  if (parts.length !== 2 || !kind || !stamp || !(KINDS as readonly string[]).includes(kind) || !dateOfStamp(stamp)) return null;
  return { kind: kind as BackupKind, stamp };
}

const DAY_MS = 86_400_000;
const utcDay = (date: Date) => Math.floor(date.getTime() / DAY_MS);
const utcMonth = (date: Date) => date.toISOString().slice(0, 7);

function newest(refs: readonly BackupRef[], kind: BackupKind): Date | null {
  let found: Date | null = null;
  for (const ref of refs) {
    if (ref.kind !== kind) continue;
    const date = dateOfStamp(ref.stamp);
    if (date && (!found || date > found)) found = date;
  }
  return found;
}

/**
 * The kinds a run writes to a store, given its complete backups: a daily on every run; a weekly when the newest
 * is 7 or more UTC days old (counted in whole days, so the minute a run happens to start can't push the weekly a
 * day later each week); a monthly when none is from this UTC month. A kind kept 0 times is never written.
 */
export function kindsDue(complete: readonly BackupRef[], now: Date, keep: Retention): BackupKind[] {
  const kinds: BackupKind[] = [];
  if (keep.daily > 0) kinds.push('daily');
  const weekly = newest(complete, 'weekly');
  if (keep.weekly > 0 && (!weekly || utcDay(now) - utcDay(weekly) >= 7)) kinds.push('weekly');
  const monthly = newest(complete, 'monthly');
  if (keep.monthly > 0 && (!monthly || utcMonth(monthly) !== utcMonth(now))) kinds.push('monthly');
  return kinds;
}

/** The complete backups past each kind's count, newest kept: what a store deletes after a run succeeded there. */
export function toPrune(complete: readonly BackupRef[], keep: Retention): BackupRef[] {
  return KINDS.flatMap((kind) =>
    complete
      .filter((ref) => ref.kind === kind)
      .sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0))
      .slice(Math.max(0, keep[kind])),
  );
}

/** Folders a run left without SHA256SUMS (it failed or was stopped): deleted once they're more than a day old. */
export function staleIncomplete(incomplete: readonly BackupRef[], now: Date): BackupRef[] {
  return incomplete.filter((ref) => {
    const date = dateOfStamp(ref.stamp);
    return date !== null && now.getTime() - date.getTime() > DAY_MS;
  });
}

export interface ListedBackup extends BackupRef {
  complete: boolean;
  files: Array<{ name: string; bytes: number }>;
}

/** Groups a store's objects (`<kind>/<stamp>/<file>`) into backups, newest first. Other keys are ignored. */
export function groupListing(objects: ReadonlyArray<{ key: string; bytes: number }>): ListedBackup[] {
  const byRef = new Map<string, ListedBackup>();
  for (const object of objects) {
    const parts = object.key.split('/');
    const name = parts[2];
    const ref = parts.length === 3 && name ? parseRefKey(`${parts[0]}/${parts[1]}`) : null;
    if (!ref || !name) continue;
    const entry = byRef.get(refKey(ref)) ?? { ...ref, complete: false, files: [] };
    entry.files.push({ name, bytes: object.bytes });
    if (name === SUMS_FILE) entry.complete = true;
    byRef.set(refKey(ref), entry);
  }
  return [...byRef.values()].sort((a, b) =>
    a.stamp === b.stamp ? KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) : a.stamp < b.stamp ? 1 : -1,
  );
}

/** `sha256sum` format, so `sha256sum -c SHA256SUMS` checks a downloaded backup without these scripts. */
export function formatSums(entries: ReadonlyArray<{ name: string; sha256: string }>): string {
  return entries.map((entry) => `${entry.sha256}  ${entry.name}\n`).join('');
}

export function parseSums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64}) [ *]([A-Za-z0-9._-]+)$/.exec(line.trim());
    if (!match || !match[1] || !match[2]) throw new Error(`SHA256SUMS has a line it can't read: ${line.slice(0, 80)}`);
    sums.set(match[2], match[1]);
  }
  return sums;
}

export interface BackupManifest {
  format: 1;
  createdAt: string;
  /** The app release that was running (the live server's REVISION file), when known. */
  revision: string | null;
  database: {
    name: string;
    owner: string;
    /** Roles that own or were granted something in it: a restore creates the missing ones. */
    roles: string[];
    serverVersion: string;
    dumpVersion: string;
    extensions: string[];
    lastMigration: { hash: string; createdAt: string } | null;
    /** Rows per table, counted in the snapshot the dump was taken from, so a restore must match exactly. */
    rows: Record<string, number>;
  };
  /** Each encrypted file's plaintext, checked again after decrypting. */
  files: Record<string, { bytes: number; sha256: string }>;
  uploads: { files: number; bytes: number } | null;
  config: string[];
}

export function parseManifest(text: string): BackupManifest {
  const manifest = JSON.parse(text) as BackupManifest;
  if (manifest?.format !== 1 || typeof manifest.database?.name !== 'string' || typeof manifest.files !== 'object') {
    throw new Error('The manifest is not one these scripts wrote (format 1).');
  }
  return manifest;
}

/** Tables whose rows differ between the backup's manifest and a restored database. */
export function rowDifferences(expected: Record<string, number>, actual: Record<string, number>): string[] {
  const names = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  return names
    .filter((name) => expected[name] !== actual[name])
    .map((name) => `${name}: ${expected[name] ?? 'missing'} in the backup, ${actual[name] ?? 'missing'} restored`);
}

/** Names this tooling puts into SQL unquoted-safe: databases, roles. */
export function checkIdentifier(name: string, what: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error(`${what} "${name}" must be lowercase letters, digits and underscores.`);
  return name;
}

export function retentionFrom(env: Record<string, string | undefined>, prefix: string, fallback: Retention): Retention {
  const read = (kind: BackupKind) => {
    const raw = env[`${prefix}_KEEP_${kind.toUpperCase()}`]?.trim();
    if (!raw) return fallback[kind];
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) throw new Error(`${prefix}_KEEP_${kind.toUpperCase()} must be a whole number.`);
    return value;
  };
  const keep = { daily: read('daily'), weekly: read('weekly'), monthly: read('monthly') };
  if (keep.daily < 1) throw new Error(`${prefix}_KEEP_DAILY must be at least 1.`);
  return keep;
}
