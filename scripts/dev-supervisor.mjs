#!/usr/bin/env node
/**
 * Keeps one dev server on localhost:3000 for every session sharing this machine (the VPS has 7.7 GB of
 * RAM and also runs live sites). Linux only: it reads /proc and uses `ss` and, when present, `systemd-run`.
 *
 * - Starts `npm run dev` whenever nothing listens on :3000. A server someone else started (Playwright's
 *   webServer does this when the port is free) is left alone; this one takes over once it exits.
 * - Runs it in a systemd user scope capped at DEV_MEMORY_MAX (default 5G) and DEV_SWAP_MAX (default 1G),
 *   so it can never push the rest of the machine into swap.
 * - Restarts it at a safe point (the heavy-work lock is free) once its memory passes DEV_RESTART_AT_MB
 *   (default 3000), and after it exits for any reason.
 *
 *   node scripts/dev-supervisor.mjs        (logs to automation/logs/dev-server.log)
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT ?? 3000);
const restartAtMb = Number(process.env.DEV_RESTART_AT_MB ?? 3000);
const memoryMax = process.env.DEV_MEMORY_MAX ?? '5G';
const swapMax = process.env.DEV_SWAP_MAX ?? '1G';
const lockPath = path.join(root, 'automation/heavy.lock');
const logPath = path.join(root, 'automation/logs/dev-server.log');
fs.mkdirSync(path.dirname(logPath), { recursive: true });

const say = (line) => fs.appendFileSync(logPath, `[supervisor ${new Date().toISOString()}] ${line}\n`);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function portBusy() {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });
}

/** The process listening on the port, from `ss`. */
function listenerPid() {
  try {
    const out = execFileSync('ss', ['-ltnpH', `sport = :${port}`], { encoding: 'utf8' });
    return Number(/pid=(\d+)/.exec(out)?.[1]) || null;
  } catch {
    return null;
  }
}

/** Resident plus swapped memory of a process, in MB. */
function memoryMb(pid) {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const kb = (key) => Number(new RegExp(`${key}:\\s+(\\d+)`).exec(status)?.[1] ?? 0);
    return Math.round((kb('VmRSS') + kb('VmSwap')) / 1024);
  } catch {
    return 0;
  }
}

/** True while a live gate, e2e run or other heavy job holds the lock. */
function heavyJobRunning() {
  try {
    const { pid } = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function hasSystemdRun() {
  try {
    execFileSync('systemd-run', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Starts `npm run dev` with this Node's npm first on PATH, in a capped scope when systemd is there. */
function startServer() {
  const env = { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` };
  const log = fs.openSync(logPath, 'a');
  const [command, args] = hasSystemdRun()
    ? ['systemd-run', ['--user', '--scope', '--quiet', `--unit=tnm-dev-${Date.now()}`, '-p', `MemoryMax=${memoryMax}`, '-p', `MemorySwapMax=${swapMax}`, '--', 'npm', 'run', 'dev']]
    : ['npm', ['run', 'dev']];
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  say(`started pid ${child.pid} (${command === 'npm' ? 'no memory cap' : `cap ${memoryMax} + ${swapMax} swap`})`);
  return child;
}

let child = null;
let exited = false;
const stopChild = (signal = 'SIGTERM') => {
  if (!child) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    /* already gone */
  }
};
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    say(`supervisor stopping (${signal})`);
    stopChild();
    process.exit(0);
  });
}

say(`supervisor up: restart at ${restartAtMb} MB when no heavy job runs`);
for (;;) {
  if (!child || exited) {
    if (await portBusy()) {
      await pause(2000); // someone else's server (Playwright's) is serving; wait for it to exit
      continue;
    }
    child = startServer();
    exited = false;
    child.on('exit', (code, signal) => {
      exited = true;
      say(`server exited (${signal ?? `code ${code}`})`);
    });
    await pause(20_000);
    continue;
  }
  const pid = listenerPid();
  const used = pid ? memoryMb(pid) : 0;
  if (used > restartAtMb && !heavyJobRunning()) {
    say(`restarting: ${used} MB with no heavy job running`);
    stopChild();
    while (!exited) await pause(500);
    while (await portBusy()) await pause(500);
  }
  await pause(20_000);
}
