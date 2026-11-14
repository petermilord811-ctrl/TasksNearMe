#!/usr/bin/env node
/**
 * Runs one heavy command under the heavy-work lock (scripts/lib/heavy-lock.mjs), the same lock the
 * gate and Codex's `check:ui` take. Sessions that share this machine use it so that no two full checks,
 * e2e runs, DB test runs or builds ever run at once (e2e reseeds the shared dev database).
 *
 *   node scripts/heavy.mjs npm run typecheck
 *   node scripts/heavy.mjs --e2e-build npx playwright test tests/e2e/booking.spec.ts --project=app-desktop
 *   node scripts/heavy.mjs --fresh-dev npx playwright test tests/ui-previews/booking.spec.ts --project=ui-mobile
 *
 * Waits while another job holds the lock, runs the command, and exits with its exit code.
 * `--e2e-build` is for e2e runs: it pauses the dev server (its memory is needed), makes the e2e production build
 * (`npm run e2e:build`), runs the command with E2E_TARGET=build, so Playwright serves that build on :3300
 * (playwright.config.ts), and lets the dev server start again afterwards.
 * `--fresh-dev` first asks the dev-server supervisor for a fresh dev server (scripts/lib/dev-restart.mjs), for
 * preview runs, which need the dev server.
 */
import { spawn } from 'node:child_process';
import { pauseDevServer, restartDevServer } from './lib/dev-restart.mjs';
import { acquireHeavyLock } from './lib/heavy-lock.mjs';

const modes = new Set(['--fresh-dev', '--e2e-build']);
const mode = modes.has(process.argv[2]) ? process.argv[2] : null;
const command = process.argv.slice(mode ? 3 : 2);
if (command.length === 0) {
  console.error('Usage: node scripts/heavy.mjs [--e2e-build | --fresh-dev] <command> [args...]');
  process.exit(2);
}
const log = (line) => console.error(line);

let running = null;
// Each command in its own process group, so a stop signal reaches npm, node and the browsers under it.
function run(line, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(line, { shell: true, stdio: 'inherit', detached: true, env });
    running = child;
    child.on('error', () => resolve(1));
    child.on('exit', (status, signal) => {
      running = null;
      resolve(status ?? (signal ? 143 : 1));
    });
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try {
      if (running) process.kill(-running.pid, signal);
      else process.exit(1);
    } catch {
      /* already gone */
    }
  });
}

const release = await acquireHeavyLock(`heavy: ${command.join(' ')}`.slice(0, 120), { log });
let resume = () => {};
let code;
try {
  if (mode === '--fresh-dev') await restartDevServer({ log });
  if (mode === '--e2e-build') {
    try {
      resume = await pauseDevServer({ log });
    } catch (error) {
      log(`${error} Building with the dev server still up.`);
    }
    code = await run('npm run e2e:build');
    if (code !== 0) log(`The e2e build failed (exit ${code}), so the command didn't run.`);
  }
  if (code === undefined || code === 0) code = await run(command.join(' '), mode === '--e2e-build' ? { ...process.env, E2E_TARGET: 'build' } : process.env);
} catch (error) {
  log(String(error));
  code = 1;
} finally {
  resume();
  release();
}
process.exit(code);
