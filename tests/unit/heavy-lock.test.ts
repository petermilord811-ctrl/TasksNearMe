import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquireHeavyLock, lockIsStale, readLock } from '../../scripts/lib/heavy-lock.mjs';

/**
 * The heavy-work lock (scripts/lib/heavy-lock.mjs) that the sessions sharing the VPS take for gates, e2e runs,
 * DB tests, builds and Codex's check:ui. A live holder keeps it however long it runs: a full gate takes well
 * over an hour, and losing the lock mid-run once let two e2e runs share one dev server.
 */

const minute = 60_000;
const now = Date.parse('2026-11-14T03:00:00.000Z');
const ago = (ms: number) => new Date(now - ms).toISOString();
const alive = () => true;
const gone = () => false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Above Linux's pid_max (2^22), so no process can have it. */
const DEAD_PID = 2 ** 22 + 4321;

describe('lockIsStale', () => {
  it('keeps a lock that still beats, however long it has been held, up to the 4-hour cap', () => {
    const lock = { owner: 'claude-gate', pid: 42, startedAt: ago(90 * minute), heartbeatAt: ago(30_000) };
    expect(lockIsStale(lock, { now, alive })).toBe(false);
    expect(lockIsStale({ ...lock, startedAt: ago(4 * 60 * minute + 1) }, { now, alive })).toBe(true);
  });

  it('frees the lock when its holder is gone or its heartbeat stopped', () => {
    const lock = { owner: 'heavy: npm run e2e', pid: 42, startedAt: ago(5 * minute), heartbeatAt: ago(30_000) };
    expect(lockIsStale(lock, { now, alive: gone })).toBe(true);
    expect(lockIsStale({ ...lock, heartbeatAt: ago(11 * minute) }, { now, alive })).toBe(true);
  });

  it('keeps the 45-minute rule for a lock written without a heartbeat', () => {
    expect(lockIsStale({ owner: 'old script', pid: 42, startedAt: ago(44 * minute) }, { now, alive })).toBe(false);
    expect(lockIsStale({ owner: 'old script', pid: 42, startedAt: ago(46 * minute) }, { now, alive })).toBe(true);
  });

  it('frees a cut-off lock file once it has not changed for a minute, and never frees an absent one', () => {
    expect(lockIsStale({ unreadable: true, mtimeMs: now - 30_000 }, { now })).toBe(false);
    expect(lockIsStale({ unreadable: true, mtimeMs: now - 61_000 }, { now })).toBe(true);
    expect(lockIsStale(null, { now })).toBe(false);
  });
});

describe('acquireHeavyLock', () => {
  let dir: string;
  let lockFile: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-lock-'));
    lockFile = path.join(dir, 'heavy.lock');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('beats while held, even while the main thread is blocked', async () => {
    const release = await acquireHeavyLock('claude-gate', { lockFile, heartbeatMs: 20 });
    const taken = readLock(lockFile);
    expect(taken).toMatchObject({ owner: 'claude-gate', pid: process.pid });
    const until = Date.now() + 400;
    while (Date.now() < until) {
      // Blocked, as scripts/codex-run.mjs is inside execSync('npm run check:ui').
    }
    const beaten = readLock(lockFile);
    expect(Date.parse(beaten.heartbeatAt)).toBeGreaterThan(Date.parse(taken.heartbeatAt));
    expect(beaten.startedAt).toBe(taken.startedAt);
    release();
    expect(readLock(lockFile)).toBeNull();
  });

  it('makes a second job wait until the first releases, then hands it over', async () => {
    const releaseFirst = await acquireHeavyLock('first', { lockFile, heartbeatMs: 20, pollMs: 10 });
    let handedOver = false;
    const waiting = acquireHeavyLock('second', { lockFile, heartbeatMs: 20, pollMs: 10 }).then((release) => {
      handedOver = true;
      return release;
    });
    await sleep(120);
    expect(handedOver).toBe(false);
    expect(readLock(lockFile).owner).toBe('first');
    releaseFirst();
    const releaseSecond = await waiting;
    expect(readLock(lockFile).owner).toBe('second');
    releaseSecond();
    expect(readLock(lockFile)).toBeNull();
  });

  it('hands the lock over in arrival order, and a job that asks again right after releasing goes to the back', async () => {
    const options = { lockFile, heartbeatMs: 20, pollMs: 10, headPollMs: 5 };
    const releaseA = await acquireHeavyLock('a', options);
    const order: string[] = [];
    const queued = (owner: string) =>
      acquireHeavyLock(owner, options).then((release) => {
        order.push(owner);
        return release;
      });
    const b = queued('b');
    await sleep(5);
    const c = queued('c');
    await sleep(40);
    releaseA();
    // The screenshot loop of 2026-11-18: release, ask again at once. It must wait behind b and c.
    const aAgain = queued('a again');
    const releaseB = await b;
    await sleep(40);
    expect(order).toEqual(['b']);
    releaseB();
    (await c)();
    (await aAgain)();
    expect(order).toEqual(['b', 'c', 'a again']);
    expect(fs.readdirSync(`${lockFile}.queue`)).toEqual([]);
  });

  it("doesn't wait behind a ticket whose waiter is gone or stopped touching it", async () => {
    const queueDir = `${lockFile}.queue`;
    fs.mkdirSync(queueDir, { recursive: true });
    fs.writeFileSync(path.join(queueDir, `000000000000001-${DEAD_PID}-000001.ticket`), '{}');
    const frozen = path.join(queueDir, `000000000000002-${process.pid}-000001.ticket`);
    fs.writeFileSync(frozen, '{}');
    const old = new Date(Date.now() - 3 * minute);
    fs.utimesSync(frozen, old, old);
    const release = await acquireHeavyLock('next', { lockFile, heartbeatMs: 20, pollMs: 10, headPollMs: 5 });
    expect(readLock(lockFile)).toMatchObject({ owner: 'next', pid: process.pid });
    expect(fs.readdirSync(queueDir)).toEqual([]);
    release();
  });

  it('takes over the lock of a holder that crashed, and a late release leaves the new holder alone', async () => {
    const stamp = new Date().toISOString();
    fs.writeFileSync(lockFile, JSON.stringify({ owner: 'crashed', pid: DEAD_PID, startedAt: stamp, heartbeatAt: stamp }));
    const release = await acquireHeavyLock('next', { lockFile, heartbeatMs: 20, pollMs: 10 });
    expect(readLock(lockFile)).toMatchObject({ owner: 'next', pid: process.pid });

    // Someone took it over (say, after a freeze): our release must not remove their lock, nor our heartbeat touch it.
    const theirs = { owner: 'theirs', pid: process.pid, startedAt: '2026-11-14T00:00:00.000Z', heartbeatAt: '2026-11-14T00:00:00.000Z' };
    fs.writeFileSync(lockFile, JSON.stringify(theirs));
    await sleep(80);
    expect(readLock(lockFile)).toEqual(theirs);
    release();
    expect(readLock(lockFile)).toEqual(theirs);
  });
});
