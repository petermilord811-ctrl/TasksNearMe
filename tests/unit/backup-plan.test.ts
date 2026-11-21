import { describe, expect, it } from 'vitest';
import {
  checkIdentifier,
  dateOfStamp,
  formatSums,
  groupListing,
  kindsDue,
  parseManifest,
  parseRefKey,
  parseSums,
  retentionFrom,
  rowDifferences,
  stampOf,
  staleIncomplete,
  toPrune,
  type BackupRef,
} from '../../scripts/backup/lib/plan';

const keep = { daily: 7, weekly: 4, monthly: 0 };
const at = (iso: string) => new Date(iso);
const ref = (kind: BackupRef['kind'], iso: string): BackupRef => ({ kind, stamp: stampOf(at(iso)) });

describe('backup stamps', () => {
  it('are UTC, sortable and safe in keys, and read back', () => {
    const stamp = stampOf(at('2026-11-21T08:30:05.123Z'));
    expect(stamp).toBe('2026-11-21T08-30-05Z');
    expect(dateOfStamp(stamp)?.toISOString()).toBe('2026-11-21T08:30:05.000Z');
  });

  it('refuse anything else', () => {
    for (const bad of ['2026-11-21T08:30:05Z', '2026-13-01T00-00-00Z', '2026-11-21', 'latest', '../2026-11-21T08-30-05Z']) {
      expect(dateOfStamp(bad)).toBeNull();
    }
    expect(parseRefKey('daily/2026-11-21T08-30-05Z')).toEqual({ kind: 'daily', stamp: '2026-11-21T08-30-05Z' });
    expect(parseRefKey('hourly/2026-11-21T08-30-05Z')).toBeNull();
    expect(parseRefKey('daily/2026-11-21T08-30-05Z/db.dump.gpg')).toBeNull();
  });
});

describe('which kinds a run writes', () => {
  it('starts a store with a daily and a weekly', () => {
    expect(kindsDue([], at('2026-11-21T08:30:00Z'), keep)).toEqual(['daily', 'weekly']);
    expect(kindsDue([], at('2026-11-21T08:30:00Z'), { ...keep, monthly: 12 })).toEqual(['daily', 'weekly', 'monthly']);
  });

  it('writes the next weekly 7 UTC days after the last, even when tonight runs earlier in the day', () => {
    const weekly = [ref('weekly', '2026-11-14T08:35:00Z')];
    expect(kindsDue(weekly, at('2026-11-20T23:59:00Z'), keep)).toEqual(['daily']);
    expect(kindsDue(weekly, at('2026-11-21T08:29:00Z'), keep)).toEqual(['daily', 'weekly']);
  });

  it('catches up the weekly after missed nights', () => {
    expect(kindsDue([ref('weekly', '2026-11-01T08:30:00Z')], at('2026-11-21T08:30:00Z'), keep)).toEqual(['daily', 'weekly']);
  });

  it('writes one monthly per UTC month', () => {
    const monthly = { ...keep, weekly: 0, monthly: 12 };
    expect(kindsDue([ref('monthly', '2026-11-01T08:30:00Z')], at('2026-11-30T08:30:00Z'), monthly)).toEqual(['daily']);
    expect(kindsDue([ref('monthly', '2026-11-01T08:30:00Z')], at('2026-12-01T08:30:00Z'), monthly)).toEqual(['daily', 'monthly']);
  });
});

describe('pruning', () => {
  it('keeps the newest of each kind and nothing else of theirs', () => {
    const dailies = Array.from({ length: 9 }, (_, day) => ref('daily', `2026-11-${String(13 + day).padStart(2, '0')}T08:30:00Z`));
    const weeklies = [ref('weekly', '2026-10-24T08:30:00Z'), ref('weekly', '2026-10-31T08:30:00Z'), ref('weekly', '2026-11-07T08:30:00Z'), ref('weekly', '2026-11-14T08:30:00Z'), ref('weekly', '2026-11-21T08:30:00Z')];
    const pruned = toPrune([...weeklies, ...dailies], keep);
    expect(pruned).toEqual([dailies[1], dailies[0], weeklies[0]]);
  });

  it('removes folders a failed run left once they are a day old', () => {
    const now = at('2026-11-21T08:30:00Z');
    expect(staleIncomplete([ref('daily', '2026-11-21T03:30:00Z'), ref('daily', '2026-11-20T03:30:00Z')], now)).toEqual([ref('daily', '2026-11-20T03:30:00Z')]);
  });
});

describe('listings', () => {
  it('groups objects into backups, newest first, marking those without SHA256SUMS incomplete', () => {
    const listed = groupListing([
      { key: 'daily/2026-11-20T08-30-00Z/db.dump.gpg', bytes: 10 },
      { key: 'daily/2026-11-20T08-30-00Z/SHA256SUMS', bytes: 2 },
      { key: 'daily/2026-11-21T08-30-00Z/db.dump.gpg', bytes: 11 },
      { key: 'weekly/2026-11-20T08-30-00Z/SHA256SUMS', bytes: 2 },
      { key: '.work/.backup-x/db.dump.gpg', bytes: 5 },
      { key: 'daily/notastamp/SHA256SUMS', bytes: 2 },
    ]);
    expect(listed.map((backup) => [backup.kind, backup.stamp, backup.complete])).toEqual([
      ['daily', '2026-11-21T08-30-00Z', false],
      ['daily', '2026-11-20T08-30-00Z', true],
      ['weekly', '2026-11-20T08-30-00Z', true],
    ]);
  });
});

describe('SHA256SUMS', () => {
  it('reads what it writes, in sha256sum format', () => {
    const text = formatSums([{ name: 'db.dump.gpg', sha256: 'a'.repeat(64) }]);
    expect(text).toBe(`${'a'.repeat(64)}  db.dump.gpg\n`);
    expect([...parseSums(text)]).toEqual([['db.dump.gpg', 'a'.repeat(64)]]);
    expect([...parseSums(`${'b'.repeat(64)} *binary.gpg\n`)]).toEqual([['binary.gpg', 'b'.repeat(64)]]);
  });

  it('refuses lines it cannot read', () => {
    expect(() => parseSums('not a checksum line')).toThrow(/can't read/);
    expect(() => parseSums(`${'a'.repeat(64)}  ../escape\n`)).toThrow(/can't read/);
  });
});

describe('manifest and checks', () => {
  it('refuses a manifest of another format', () => {
    expect(() => parseManifest('{"format":2}')).toThrow(/format 1/);
  });

  it('lists tables whose rows differ', () => {
    expect(rowDifferences({ 'public.users': 3, 'public.tasks': 5 }, { 'public.users': 3, 'public.tasks': 4 })).toEqual(['public.tasks: 5 in the backup, 4 restored']);
    expect(rowDifferences({ 'public.users': 3 }, {})).toEqual(['public.users: 3 in the backup, missing restored']);
  });

  it('takes only plain lowercase names into SQL', () => {
    expect(checkIdentifier('tasksnearme_preview', 'The database')).toBe('tasksnearme_preview');
    for (const bad of ['Tasks', 'x"; DROP DATABASE y; --', '1abc', '']) expect(() => checkIdentifier(bad, 'The database')).toThrow();
  });

  it('reads retention from settings, with fallbacks', () => {
    expect(retentionFrom({}, 'BACKUP_R2', keep)).toEqual(keep);
    expect(retentionFrom({ BACKUP_R2_KEEP_DAILY: '14', BACKUP_R2_KEEP_MONTHLY: '12' }, 'BACKUP_R2', keep)).toEqual({ daily: 14, weekly: 4, monthly: 12 });
    expect(() => retentionFrom({ BACKUP_R2_KEEP_DAILY: '0' }, 'BACKUP_R2', keep)).toThrow(/at least 1/);
    expect(() => retentionFrom({ BACKUP_R2_KEEP_WEEKLY: 'four' }, 'BACKUP_R2', keep)).toThrow(/whole number/);
  });
});
