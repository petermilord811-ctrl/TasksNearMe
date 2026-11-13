#!/usr/bin/env node
/**
 * Runs one heavy command under the heavy-work lock (scripts/lib/heavy-lock.mjs), the same lock the
 * gate and Codex's `check:ui` take. Sessions that share this machine use it so that no two full checks,
 * e2e runs, DB test runs or builds ever run at once (e2e reseeds the shared dev database).
 *
 *   node scripts/heavy.mjs npm run typecheck
 *   node scripts/heavy.mjs npx playwright test tests/e2e/booking.spec.ts --project=app-desktop --workers=1
 *
 * Waits while another job holds the lock, runs the command, and exits with its exit code.
 */
import { spawn } from 'node:child_process';
import { acquireHeavyLock } from './lib/heavy-lock.mjs';

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error('Usage: node scripts/heavy.mjs <command> [args...]');
  process.exit(2);
}

const release = await acquireHeavyLock(`heavy: ${command.join(' ')}`.slice(0, 120), { log: (line) => console.error(line) });
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
