#!/usr/bin/env node
/**
 * Claude's full gate: `check`, `test:db`, `e2e`, `build`, one after another, each logged to its own file.
 * Takes the heavy-work lock first (scripts/lib/heavy-lock.mjs), so it never runs at the same time as another
 * session's heavy job or Codex's independent `check:ui`.
 *
 *   node scripts/gate.mjs [--logs <dir>] [--only check,test:db] [--e2e-shards 3]
 *
 * e2e runs in shards (Playwright's --shard), each on a fresh dev server when the dev-server supervisor
 * runs (scripts/dev-supervisor.mjs). `--e2e-shards 1` runs it in one go. Each shard keeps its Playwright output
 * (traces, screenshots, error context) in <logs>/e2e-results/shard-<n> rather than test-results/, so the gate
 * neither wipes another run's results nor has its own wiped.
 *
 * SIGINT or SIGTERM stops the running step (its whole process group) and releases the lock.
 * Prints `<step> exit <code>` for each step. Exit code: 0 when every step passed, else 1.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { restartDevServer } from './lib/dev-restart.mjs';
import { acquireHeavyLock } from './lib/heavy-lock.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const logs = path.resolve(flag('--logs') ?? 'automation/logs/gate');
const steps = (flag('--only') ?? 'check,test:db,e2e,build').split(',').map((step) => step.trim()).filter(Boolean);
const shards = Math.max(1, Number(flag('--e2e-shards') ?? 3));
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
      for (let shard = 1; shard <= shards && !stopping; shard += 1) {
        try {
          await restartDevServer({ log: note });
        } catch (error) {
          note(`${error} Running the shard on the current dev server.`);
        }
        const output = path.join(logs, 'e2e-results', shards > 1 ? `shard-${shard}` : 'all');
        note(`e2e shard ${shard}/${shards} (output in ${path.relative(process.cwd(), output)})`);
        const sharding = shards > 1 ? ` --shard=${shard}/${shards}` : '';
        const shardCode = await run(`npm run e2e -- --reporter=line${sharding} --output=${JSON.stringify(output)}`, fd);
        if (shards > 1) console.log(`e2e shard ${shard}/${shards} exit ${shardCode}`);
        if (shardCode !== 0) code = shardCode;
      }
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
