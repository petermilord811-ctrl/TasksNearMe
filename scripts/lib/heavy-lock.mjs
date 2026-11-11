import fs from 'node:fs';
import path from 'node:path';

/**
 * One heavy job at a time on this machine: Codex's independent `check:ui` and Claude's full gate
 * (`scripts/gate.mjs`) each take the lock, so their browsers, dev servers and test workers don't starve
 * each other (vitest worker start-up timeouts, Playwright navigation timeouts).
 * The lock is a file with the owner, pid and start time; a lock older than `staleMs`, or whose process is
 * gone, is taken over.
 */

const lockPath = path.resolve(import.meta.dirname, '../../automation/heavy.lock');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function current() {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

/** Waits for the lock and takes it. Returns a release function. */
export async function acquireHeavyLock(owner, { staleMs = 45 * 60_000, pollMs = 15_000, log = () => {} } = {}) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let announced = false;
  for (;;) {
    const held = current();
    const stale = held && (Date.now() - Date.parse(held.startedAt) > staleMs || !alive(held.pid));
    if (held && stale) fs.rmSync(lockPath, { force: true });
    try {
      fs.writeFileSync(lockPath, JSON.stringify({ owner, pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' });
      return () => {
        const mine = current();
        if (mine && mine.pid === process.pid && mine.owner === owner) fs.rmSync(lockPath, { force: true });
      };
    } catch {
      if (!announced) {
        log(`Waiting for the heavy-work lock (held by ${current()?.owner ?? 'someone'})…`);
        announced = true;
      }
      await sleep(pollMs);
    }
  }
}
