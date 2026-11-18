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
 *
 * Waiters queue in arrival order. Each one leaves a ticket in `<lockFile>.queue/` (named by its arrival time) and
 * only the first live ticket may take a free lock, so a job that releases and asks again goes to the back, rather
 * than winning every race against waiters that poll less often (2026-11-18: a screenshot loop re-took the lock
 * within the 15 s poll for 25 minutes). A waiter touches its ticket on every poll; a ticket whose process is gone,
 * or that hasn't been touched for `TICKET_STALE_MS` (a frozen waiter, or a pid reused after a crash), is dropped.
 */

const defaultLockFile = path.resolve(import.meta.dirname, '../../automation/heavy.lock');
const LEGACY_STALE_MS = 45 * 60_000;
/** A lock file that can't be parsed (cut off mid-write) is stale once it hasn't changed for this long. */
const UNREADABLE_STALE_MS = 60_000;
/** A waiter's ticket that hasn't been touched for this long no longer holds its place. */
export const TICKET_STALE_MS = 2 * 60_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The live tickets in `queueDir`, oldest first, after dropping the ones whose waiter is gone or stopped touching them. */
export function liveTickets(queueDir, { now = Date.now(), alive = processAlive, staleMs = TICKET_STALE_MS } = {}) {
  let names;
  try {
    names = fs.readdirSync(queueDir).filter((name) => name.endsWith('.ticket')).sort();
  } catch {
    return [];
  }
  const live = [];
  for (const name of names) {
    const file = path.join(queueDir, name);
    const pid = Number(name.split('-')[1]);
    const mtimeMs = fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs;
    if (mtimeMs === undefined) continue;
    if (!Number.isInteger(pid) || !alive(pid) || now - mtimeMs > staleMs) {
      fs.rmSync(file, { force: true });
      continue;
    }
    live.push(name);
  }
  return live;
}

let ticketSeq = 0;
/** A ticket name that sorts by arrival: the time, then the pid and a per-process sequence for ties. */
const ticketName = () =>
  `${String(Date.now()).padStart(15, '0')}-${process.pid}-${String((ticketSeq += 1)).padStart(6, '0')}.ticket`;

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
 * Waits for the lock, in arrival order, and takes it. Returns a release function (safe to call more than once).
 * Options: `lockFile`, `heartbeatMs` (60 s), `pollMs` (15 s; the first waiter in line polls every `headPollMs`, 2 s,
 * so a released lock doesn't sit idle), `log`, and `lockIsStale`'s `staleMs` and `maxHoldMs`.
 */
export async function acquireHeavyLock(owner, options = {}) {
  const { lockFile = defaultLockFile, heartbeatMs = 60_000, pollMs = 15_000, headPollMs = Math.min(pollMs, 2_000), log = () => {}, staleMs, maxHoldMs } = options;
  const queueDir = `${lockFile}.queue`;
  fs.mkdirSync(queueDir, { recursive: true });
  const ticket = path.join(queueDir, ticketName());
  const writeTicket = () => fs.writeFileSync(ticket, JSON.stringify({ owner, pid: process.pid, at: new Date().toISOString() }));
  const dropTicket = () => fs.rmSync(ticket, { force: true });
  writeTicket();
  process.once('exit', dropTicket);
  let announced = false;
  try {
    for (;;) {
      // Still waiting: keep the place in line (a dropped ticket, after a freeze, is written again under the same name).
      const touched = new Date();
      try {
        fs.utimesSync(ticket, touched, touched);
      } catch {
        writeTicket();
      }
      const queue = liveTickets(queueDir);
      const first = queue[0] === path.basename(ticket);
      if (first) {
        const held = readLock(lockFile);
        // Remove it only if it is still the lock judged stale: another waiter may have taken it over meanwhile.
        if (lockIsStale(held, { staleMs, maxHoldMs }) && sameLock(readLock(lockFile), held)) fs.rmSync(lockFile, { force: true });
        const startedAt = new Date().toISOString();
        try {
          fs.writeFileSync(lockFile, JSON.stringify({ owner, pid: process.pid, startedAt, heartbeatAt: startedAt }), { flag: 'wx' });
        } catch {
          await waitAnnounced();
          continue;
        }
        dropTicket();
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
      await waitAnnounced(queue.indexOf(path.basename(ticket)));
    }
  } finally {
    dropTicket();
    process.removeListener('exit', dropTicket);
  }

  /** Waits one poll, saying once who holds the lock and how many wait ahead. */
  async function waitAnnounced(ahead = 0) {
    if (!announced) {
      const holder = readLock(lockFile)?.owner;
      log(`Waiting for the heavy-work lock (${holder ? `held by ${holder}` : 'free'}${ahead > 0 ? `; ${ahead} ahead in line` : ''})…`);
      announced = true;
    }
    await sleep(ahead === 0 ? headPollMs : pollMs);
  }
}
