#!/usr/bin/env node
/**
 * Runs one heavy command under the heavy-work lock (scripts/lib/heavy-lock.mjs), the same lock the
 * gate and Codex's `check:ui` take. Sessions that share this machine use it so that no two full checks,
 * e2e runs, DB test runs or builds ever run at once (e2e reseeds the shared dev database).
 *
 *   node scripts/heavy.mjs npm run typecheck
 *   node scripts/heavy.mjs --fresh-dev npx playwright test tests/e2e/booking.spec.ts --project=app-desktop --workers=1
 *
 * Waits while another job holds the lock, runs the command, and exits with its exit code. `--fresh-dev`
 * first asks the dev-server supervisor for a fresh dev server (scripts/lib/dev-restart.mjs), for e2e and
 * preview runs, so they don't start on a server that's about to hit its memory cap.
 */
import { spawn } from 'node:child_process';
import { restartDevServer } from './lib/dev-restart.mjs';
import { acquireHeavyLock } from './lib/heavy-lock.mjs';

const freshDev = process.argv[2] === '--fresh-dev';
const command = process.argv.slice(freshDev ? 3 : 2);
if (command.length === 0) {
  console.error('Usage: node scripts/heavy.mjs [--fresh-dev] <command> [args...]');
  process.exit(2);
}

const release = await acquireHeavyLock(`heavy: ${command.join(' ')}`.slice(0, 120), { log: (line) => console.error(line) });
if (freshDev) {
  try {
    await restartDevServer({ log: (line) => console.error(line) });
  } catch (error) {
    console.error(String(error));
    release();
    process.exit(1);
  }
}
// Its own process group, so a stop signal reaches npm, node and the browsers under it, not just the shell.
const child = spawn(command.join(' '), { shell: true, stdio: 'inherit', detached: true });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      /* already gone */
    }
  });
}
const code = await new Promise((resolve) => child.on('exit', (status, signal) => resolve(status ?? (signal ? 143 : 1))));
release();
process.exit(code);
