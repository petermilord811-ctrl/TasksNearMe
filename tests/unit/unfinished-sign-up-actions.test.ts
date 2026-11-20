import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * An account that hasn't finished signing up (no name, 18+ check or terms; a private beta's invite comes first) may
 * only finish signing up, sign out, make its privacy requests and read its own basics (security review SEC18).
 * `getViewer` treats it as signed out, so every Server Action, page and route that finds its person through getViewer
 * refuses it. These are the only files that read the session another way; a new one must be listed here knowingly.
 */
const RAW_SESSION_READERS: Record<string, string> = {
  'src/platform/auth/viewer.ts': 'getViewer itself, and getSessionAccountId for the privacy requests',
  'src/modules/accounts/sign-in/server.ts': 'currentSessionUserId, for sign-in’s own steps',
  'src/modules/accounts/sign-in/actions.ts': 'the sign-in and sign-up steps (email code, profile, phone, passkey, Google or Microsoft) and leaving them',
  'src/modules/beta/actions.ts': 'the sign-up invite step, which comes before the name and terms; its other actions use getViewer',
  'src/modules/privacy/actions.ts': 'privacy requests (a data export, deleting the account, withdrawing that), finished signing up or not',
};

const RAW_SESSION = /\bcurrentSessionUserId\s*\(|\bgetSessionAccountId\s*\(|\.getSession\s*\(/;
const ROOT = path.resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = sourceFiles(path.join(ROOT, 'src')).map((file) => ({ file: path.relative(ROOT, file).split(path.sep).join('/'), source: fs.readFileSync(file, 'utf8') }));

describe('who reads the session', () => {
  it('finds every Server Action file, however it spells the directive', () => {
    const actions = files.filter(({ source }) => /^\s*(['"])use server\1;?\s*$/m.test(source));
    expect(actions.length).toBeGreaterThan(40);
  });

  it('is getViewer everywhere but the listed files', () => {
    expect(files.filter(({ file, source }) => RAW_SESSION.test(source) && !(file in RAW_SESSION_READERS)).map(({ file }) => file)).toEqual([]);
  });

  it('lists only files that still read the session themselves', () => {
    for (const file of Object.keys(RAW_SESSION_READERS)) expect(files.find((entry) => entry.file === file)?.source ?? '', file).toMatch(RAW_SESSION);
  });
});
