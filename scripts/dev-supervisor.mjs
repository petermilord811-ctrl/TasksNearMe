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
 * - Restarts it at once when the heavy-lock holder asks (automation/dev-restart.request, written by
 *   scripts/lib/dev-restart.mjs): `heavy.mjs --fresh-dev` does so before a test run, the gate before each
 *   shard against the dev server. Writes its pid to automation/dev-supervisor.pid so callers can tell it's running.
 * - Keeps it stopped while the heavy-lock holder has paused it (automation/dev-pause.request, with the holder's
 *   pid): the gate does so for its e2e build and the `next start` run against it. The pause ends when the
 *   request is removed or that process exits.
 *
 *   node scripts/dev-supervisor.mjs        (logs to automation/logs/dev-server.log)
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { PAUSE_REQUEST, RESTART_REQUEST, SUPERVISOR_PID } from './lib/dev-restart.mjs';

const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT ?? 3000);
const restartAtMb = Number(process.env.DEV_RESTART_AT_MB ?? 3000);
const memoryMax = process.env.DEV_MEMORY_MAX ?? '5G';
const swapMax = process.env.DEV_SWAP_MAX ?? '1G';
const heapMb = Number(process.env.DEV_HEAP_MB ?? 2560);
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

/** The pid that paused the server (automation/dev-pause.request) while it lives; a dead one's request is removed. */
function pausedBy() {
  let pid;
  try {
    pid = Number(fs.readFileSync(PAUSE_REQUEST, 'utf8'));
  } catch {
    return null;
  }
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    fs.rmSync(PAUSE_REQUEST, { force: true });
    return null;
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

/**
 * Starts `npm run dev` with this Node's npm first on PATH, in a capped scope when systemd is there.
 * `next dev` sets its server's JS heap limit to half the machine's RAM (node_modules/next/dist/cli/next-dev.js),
 * about 3.9 GB here, without regard to the scope's cap; DEV_HEAP_MB (default 2560) sets it lower through
 * NODE_OPTIONS, so V8 collects before the heap and Turbopack together reach the cap.
 */
function startServer() {
  const nodeOptions = [process.env.NODE_OPTIONS, `--max-old-space-size=${heapMb}`].filter(Boolean).join(' ');
  const env = { ...process.env, NODE_OPTIONS: nodeOptions, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` };
  const log = fs.openSync(logPath, 'a');
  const [command, args] = hasSystemdRun()
    ? ['systemd-run', ['--user', '--scope', '--quiet', `--unit=tnm-dev-${Date.now()}`, '-p', `MemoryMax=${memoryMax}`, '-p', `MemorySwapMax=${swapMax}`, '--', 'npm', 'run', 'dev']]
    : ['npm', ['run', 'dev']];
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  say(`started pid ${child.pid} (${command === 'npm' ? 'no memory cap' : `cap ${memoryMax} + ${swapMax} swap`}, JS heap ${heapMb} MB)`);
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
    fs.rmSync(SUPERVISOR_PID, { force: true });
    process.exit(0);
  });
}

fs.writeFileSync(SUPERVISOR_PID, String(process.pid));
say(`supervisor up: restart at ${restartAtMb} MB when no heavy job runs, or when the lock holder asks`);
let lastMemoryCheck = 0;
let pausedFor = null;
for (;;) {
  // A pause from the heavy-lock holder (a gate's e2e build run): the server stays stopped until it ends.
  const pauser = pausedBy();
  if (pauser) {
    if (pausedFor !== pauser) say(`pausing the server for pid ${pauser}`);
    pausedFor = pauser;
    if (child && !exited) {
      stopChild();
      while (!exited) await pause(500);
    }
    await pause(2000);
    continue;
  }
  if (pausedFor) {
    say(`pause for pid ${pausedFor} ended`);
    pausedFor = null;
  }
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
    fs.rmSync(RESTART_REQUEST, { force: true }); // a fresh start answers any pending request
    await pause(5000);
    continue;
  }
  // A restart request comes from the heavy-lock holder (the gate between e2e shards, heavy.mjs --fresh-dev),
  // so it is honored even while the lock is held. Memory restarts wait for the lock to be free.
  let reason = fs.existsSync(RESTART_REQUEST) ? 'requested by the heavy-lock holder' : null;
  if (!reason && Date.now() - lastMemoryCheck > 20_000) {
    lastMemoryCheck = Date.now();
    const pid = listenerPid();
    const used = pid ? memoryMb(pid) : 0;
    if (used > restartAtMb && !heavyJobRunning()) reason = `${used} MB with no heavy job running`;
  }
  if (reason) {
    say(`restarting: ${reason}`);
    stopChild();
    while (!exited) await pause(500);
    while (await portBusy()) await pause(500);
    fs.rmSync(RESTART_REQUEST, { force: true }); // tells the requester the old server is gone
    continue;
  }
  await pause(2000);
}
