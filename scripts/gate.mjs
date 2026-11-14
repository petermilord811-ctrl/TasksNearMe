#!/usr/bin/env node
/**
 * Claude's full gate: `check`, `test:db`, `e2e`, `build`, one after another, each logged to its own file.
 * Takes the heavy-work lock first (scripts/lib/heavy-lock.mjs), so it never runs at the same time as
 * Codex's independent `check:ui`.
 *
 *   node scripts/gate.mjs [--logs <dir>] [--only check,test:db] [--e2e-shards 3]
 *
 * e2e runs in shards (Playwright's --shard), each on a fresh dev server when the dev-server supervisor
 * runs (scripts/dev-supervisor.mjs): on the 7.7 GB VPS one server outgrows its memory cap within a full
 * e2e run. `--e2e-shards 1` runs it in one go.
 *
 * Prints `<step> exit <code>` for each step. Exit code: 0 when every step passed, else 1.
 */
import { spawnSync } from 'node:child_process';
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

const release = await acquireHeavyLock('claude-gate', { log: (line) => console.log(line) });
let failed = false;
try {
  for (const step of steps) {
    const logFile = path.join(logs, `gate-${step.replace(':', '-')}.log`);
    const fd = fs.openSync(logFile, 'w');
    let code = 0;
    if (step === 'e2e') {
      for (let shard = 1; shard <= shards; shard += 1) {
        await restartDevServer({ log: (line) => fs.writeSync(fd, `[gate] ${line}\n`) });
        const sharding = shards > 1 ? ` --shard=${shard}/${shards}` : '';
        fs.writeSync(fd, `\n[gate] e2e shard ${shard}/${shards}\n`);
        const result = spawnSync(`npm run e2e -- --reporter=line${sharding}`, { shell: true, stdio: ['ignore', fd, fd] });
        const shardCode = result.status ?? 1;
        if (shards > 1) console.log(`e2e shard ${shard}/${shards} exit ${shardCode}`);
        if (shardCode !== 0) code = shardCode;
      }
    } else {
      code = spawnSync(`npm run ${step}`, { shell: true, stdio: ['ignore', fd, fd] }).status ?? 1;
    }
    fs.closeSync(fd);
    console.log(`${step} exit ${code}`);
    if (code !== 0) failed = true;
  }
} finally {
  release();
}
process.exit(failed ? 1 : 0);
