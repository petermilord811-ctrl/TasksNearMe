#!/usr/bin/env node
/**
 * Claude's full gate: `check`, `test:db`, `e2e`, `build`, one after another, each logged to its own file.
 * Takes the heavy-work lock first (scripts/lib/heavy-lock.mjs), so it never runs at the same time as
 * Codex's independent `check:ui`.
 *
 *   node scripts/gate.mjs [--logs <dir>] [--only check,test:db]
 *
 * Prints `<step> exit <code>` for each step. Exit code: 0 when every step passed, else 1.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { acquireHeavyLock } from './lib/heavy-lock.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const logs = path.resolve(flag('--logs') ?? 'automation/logs/gate');
const steps = (flag('--only') ?? 'check,test:db,e2e,build').split(',').map((step) => step.trim()).filter(Boolean);
fs.mkdirSync(logs, { recursive: true });

const release = await acquireHeavyLock('claude-gate', { log: (line) => console.log(line) });
let failed = false;
try {
  for (const step of steps) {
    const logFile = path.join(logs, `gate-${step.replace(':', '-')}.log`);
    const fd = fs.openSync(logFile, 'w');
    const extra = step === 'e2e' ? ' -- --reporter=line' : '';
    const result = spawnSync(`npm run ${step}${extra}`, { shell: true, stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    const code = result.status ?? 1;
    console.log(`${step} exit ${code}`);
    if (code !== 0) failed = true;
  }
} finally {
  release();
}
process.exit(failed ? 1 : 0);
