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
 * `--e2e-build` is for e2e runs: it pauses the dev server while it makes the e2e production build (`npm run e2e:build`,
 * which needs its memory), lets the dev server start again, then runs the command with E2E_TARGET=build, so
 * Playwright serves that build on :3300 (playwright.config.ts).
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
/**
 * Runs `args` in its own process group, so a stop signal reaches npm, node and the browsers under it. Several
 * arguments run exactly as given, never re-read by a shell, so paths like 'src/app/[locale]/(app)/page.tsx' pass
 * through. A single argument is a shell command line ('a && b', pipes), as before. For a variable, use
 * `env NAME=value <command>` (a bare `NAME=value` argument is no longer read by a shell).
 */
function run(args, env = process.env) {
  return new Promise((resolve) => {
    const options = { stdio: 'inherit', detached: true, env };
    const child = args.length === 1 ? spawn(args[0], { ...options, shell: true }) : spawn(args[0], args.slice(1), options);
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
    code = await run(['npm', 'run', 'e2e:build']);
    if (code !== 0) log(`The e2e build failed (exit ${code}), so the command didn't run.`);
    // Only the build needs the dev server's memory; the run's `next start` holds about 0.4 GB. Letting the dev
    // server come back now keeps dev.tasksnearme.com usable while e2e runs queue one after another.
    resume();
    resume = () => {};
  }
  if (code === undefined || code === 0) code = await run(command, mode === '--e2e-build' ? { ...process.env, E2E_TARGET: 'build' } : process.env);
} catch (error) {
  log(String(error));
  code = 1;
} finally {
  resume();
  release();
}
process.exit(code);
