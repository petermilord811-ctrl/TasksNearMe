import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

/**
 * One heavy job at a time on this machine: the gate (scripts/gate.mjs), scripts/heavy.mjs and Codex's independent
 * `check:ui` (scripts/codex-run.mjs) each take this lock, so their browsers, dev servers and test workers don't
 * starve each other, and no e2e run reseeds the shared dev database under another.
 *
 * The lock is a file with the owner, pid, start time and a heartbeat. While it is held, a worker thread
 * (./heavy-lock-heartbeat.mjs) rewrites the heartbeat every `heartbeatMs`, even while the holder's main thread is
 * blocked. A waiter takes the lock over only when `lockIsStale` says so: the holder's process is gone, its
 * heartbeat is older than `staleMs` (a frozen process, or its pid reused after a crash), or it has been held
 * longer than `maxHoldMs` (a hung job). A full gate holds it well over an hour, so age alone never ends a lock
 * that still beats. A lock written without a heartbeat (by a script started before heartbeats existed) keeps
 * the old rule: stale after 45 minutes.
 */

const defaultLockFile = path.resolve(import.meta.dirname, '../../automation/heavy.lock');
const LEGACY_STALE_MS = 45 * 60_000;
/** A lock file that can't be parsed (cut off mid-write) is stale once it hasn't changed for this long. */
const UNREADABLE_STALE_MS = 60_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True while `pid` is a running process (EPERM: it runs, as another user). */
export function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** The lock as written, `{ unreadable: true, mtimeMs }` when it can't be parsed, or null when there is none. */
export function readLock(lockFile = defaultLockFile) {
  let text;
  try {
    text = fs.readFileSync(lockFile, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { unreadable: true, mtimeMs: fs.statSync(lockFile, { throwIfNoEntry: false })?.mtimeMs ?? 0 };
  }
}

/** Whether a waiter may take over the lock `held` (as returned by `readLock`). */
export function lockIsStale(held, { now = Date.now(), staleMs = 10 * 60_000, maxHoldMs = 4 * 60 * 60_000, alive = processAlive } = {}) {
  if (!held) return false;
  if (held.unreadable) return now - held.mtimeMs > UNREADABLE_STALE_MS;
  if (!Number.isInteger(held.pid) || !alive(held.pid)) return true;
  const started = Date.parse(held.startedAt);
  if (!Number.isFinite(started)) return true;
  if (held.heartbeatAt === undefined) return now - started > LEGACY_STALE_MS;
  const beat = Date.parse(held.heartbeatAt);
  return !Number.isFinite(beat) || now - beat > staleMs || now - started > maxHoldMs;
}

const sameLock = (a, b) => (a?.unreadable && b?.unreadable) || (a?.pid === b?.pid && a?.startedAt === b?.startedAt);

/**
 * Waits for the lock and takes it. Returns a release function (safe to call more than once).
 * Options: `lockFile`, `heartbeatMs` (60 s), `pollMs` (15 s), `log`, and `lockIsStale`'s `staleMs` and `maxHoldMs`.
 */
export async function acquireHeavyLock(owner, options = {}) {
  const { lockFile = defaultLockFile, heartbeatMs = 60_000, pollMs = 15_000, log = () => {}, staleMs, maxHoldMs } = options;
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  let announced = false;
  for (;;) {
    const held = readLock(lockFile);
    // Remove it only if it is still the lock judged stale: another waiter may have taken it over meanwhile.
    if (lockIsStale(held, { staleMs, maxHoldMs }) && sameLock(readLock(lockFile), held)) fs.rmSync(lockFile, { force: true });
    const startedAt = new Date().toISOString();
    try {
      fs.writeFileSync(lockFile, JSON.stringify({ owner, pid: process.pid, startedAt, heartbeatAt: startedAt }), { flag: 'wx' });
    } catch {
      if (!announced) {
        log(`Waiting for the heavy-work lock (held by ${readLock(lockFile)?.owner ?? 'someone'})…`);
        announced = true;
      }
      await sleep(pollMs);
      continue;
    }
    const heartbeat = new Worker(new URL('./heavy-lock-heartbeat.mjs', import.meta.url), {
      workerData: { lockFile, pid: process.pid, startedAt, heartbeatMs },
    });
    heartbeat.unref();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      void heartbeat.terminate();
      const mine = readLock(lockFile);
      if (mine?.pid === process.pid && mine.startedAt === startedAt) fs.rmSync(lockFile, { force: true });
    };
  }
}
