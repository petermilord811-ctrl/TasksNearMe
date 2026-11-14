#!/usr/bin/env node
/**
 * Claude's full gate: `check`, `test:db`, `e2e`, `build`, one after another, each logged to its own file.
 * Takes the heavy-work lock first (scripts/lib/heavy-lock.mjs), so it never runs at the same time as another
 * session's heavy job or Codex's independent `check:ui`.
 *
 *   node scripts/gate.mjs [--logs <dir>] [--only check,test:db] [--e2e-target build|dev] [--e2e-shards n]
 *
 * e2e runs against the e2e production build by default (`--e2e-target build`): the dev server is paused
 * (scripts/lib/dev-restart.mjs) to free its memory, `npm run e2e:build` makes the build, and Playwright serves it
 * with `npm run e2e:serve` on :3300 (playwright.config.ts, src/shared/dev-helpers.ts). That build also stands in
 * for the `build` step, so the default steps are check, test:db, e2e. `--e2e-target dev` runs against the dev
 * server as before, in shards (default 3), each on a fresh server, and the default steps add `build`.
 * Playwright output (traces, screenshots, error context) goes to <logs>/e2e-results/<all|shard-n> rather than
 * test-results/, so the gate neither wipes another run's results nor has its own wiped.
 *
 * SIGINT or SIGTERM stops the running step (its whole process group) and releases the lock.
 * Prints `<step> exit <code>` for each step. Exit code: 0 when every step passed, else 1.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { e2eDatabaseUrl } from './e2e-db.mjs';
import { pauseDevServer, restartDevServer } from './lib/dev-restart.mjs';
import { acquireHeavyLock } from './lib/heavy-lock.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const logs = path.resolve(flag('--logs') ?? 'automation/logs/gate');
const target = flag('--e2e-target') === 'dev' ? 'dev' : 'build';
const steps = (flag('--only') ?? (target === 'build' ? 'check,test:db,e2e' : 'check,test:db,e2e,build')).split(',').map((step) => step.trim()).filter(Boolean);
const shards = Math.max(1, Number(flag('--e2e-shards') ?? (target === 'build' ? 1 : 3)));
fs.mkdirSync(logs, { recursive: true });
const clock = () => new Date().toISOString().slice(11, 19);

let release = null;
let running = null;
let stopping = null;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!release) process.exit(1); // still waiting for the lock: nothing to stop
    stopping = signal;
    try {
      if (running) process.kill(-running.pid, signal);
    } catch {
      /* already gone */
    }
  });
}

/** Runs a shell command in its own process group (so a stop reaches npm, node and the browsers), output to `fd`. */
function run(command, fd) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: ['ignore', fd, fd], detached: true });
    running = child;
    child.on('error', () => resolve(1));
    child.on('exit', (code, signal) => {
      running = null;
      resolve(code ?? (signal ? 143 : 1));
    });
  });
}

release = await acquireHeavyLock('claude-gate', { log: (line) => console.log(line) });
let failed = false;
try {
  for (const step of steps) {
    if (stopping) break;
    const fd = fs.openSync(path.join(logs, `gate-${step.replace(':', '-')}.log`), 'w');
    const note = (line) => fs.writeSync(fd, `[gate ${clock()}] ${line}\n`);
    let code = 0;
    if (step === 'e2e') {
      let resume = () => {};
      if (target === 'build') {
        try {
          resume = await pauseDevServer({ log: note });
        } catch (error) {
          note(`${error} Building with the dev server still up.`);
        }
        // Locally the e2e build has its own database (scripts/e2e-db.mjs); CI's jobs bring theirs.
        if (!process.env.CI) {
          note('e2e database (node scripts/e2e-db.mjs prepare)');
          code = await run('node scripts/e2e-db.mjs prepare', fd);
          process.env.DATABASE_URL = e2eDatabaseUrl();
        }
        note('e2e build (npm run e2e:build)');
        if (code === 0) code = await run('npm run e2e:build', fd);
        if (code !== 0) note(`the e2e build failed (exit ${code}), so the e2e run is skipped`);
        // Only the build needs the dev server's memory (next start holds about 0.4 GB): let it come back for the run.
        resume();
        resume = () => {};
      }
      for (let shard = 1; shard <= shards && !stopping && code === 0; shard += 1) {
        if (target === 'dev') {
          try {
            await restartDevServer({ log: note });
          } catch (error) {
            note(`${error} Running the shard on the current dev server.`);
          }
        }
        const output = path.join(logs, 'e2e-results', shards > 1 ? `shard-${shard}` : 'all');
        note(`e2e ${shards > 1 ? `shard ${shard}/${shards} ` : ''}against the ${target === 'build' ? 'e2e build' : 'dev server'} (output in ${path.relative(process.cwd(), output)})`);
        const sharding = shards > 1 ? ` --shard=${shard}/${shards}` : '';
        const environment = target === 'build' ? 'E2E_TARGET=build ' : '';
        const shardCode = await run(`${environment}npm run e2e -- --reporter=line${sharding} --output=${JSON.stringify(output)}`, fd);
        if (shards > 1) console.log(`e2e shard ${shard}/${shards} exit ${shardCode}`);
        if (shardCode !== 0) code = shardCode;
      }
      resume();
    } else {
      code = await run(`npm run ${step}`, fd);
    }
    fs.closeSync(fd);
    console.log(`${step} exit ${code}`);
    if (code !== 0) failed = true;
  }
} finally {
  release();
}
if (stopping) console.log(`gate stopped (${stopping})`);
process.exit(failed || stopping ? 1 : 0);
