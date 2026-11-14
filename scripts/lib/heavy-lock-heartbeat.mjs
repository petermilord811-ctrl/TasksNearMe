/**
 * The heavy-work lock's heartbeat (scripts/lib/heavy-lock.mjs), in a worker thread so it keeps beating while the
 * holder's main thread is blocked in execSync or spawnSync (scripts/codex-run.mjs runs `check:ui` that way).
 *
 * Every `heartbeatMs` it rewrites `heartbeatAt` in the lock file, in place and only while the file still holds
 * this holder's lock. It opens the file with 'r+', which fails once the file is gone, so it can never bring a
 * released or taken-over lock back.
 */
import fs from 'node:fs';
import { workerData } from 'node:worker_threads';

const { lockFile, pid, startedAt, heartbeatMs } = workerData;

setInterval(() => {
  let fd;
  try {
    fd = fs.openSync(lockFile, 'r+');
    const held = JSON.parse(fs.readFileSync(fd, 'utf8'));
    if (held.pid !== pid || held.startedAt !== startedAt) return; // someone else's lock now
    const text = JSON.stringify({ ...held, heartbeatAt: new Date().toISOString() });
    fs.writeSync(fd, text, 0);
    fs.ftruncateSync(fd, Buffer.byteLength(text));
  } catch {
    // Gone or unreadable: there is nothing of ours to refresh.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}, heartbeatMs);
