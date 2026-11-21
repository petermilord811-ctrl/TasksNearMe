// Load test of a local production build (load pass, 2026-11-21; docs/ui/sweep-2026-11-18.md, "Load"): N visitors at once,
// each loading the home page, a market's task board, a task page from the board's links and Find work (signed in as a
// helper), over and over, for a set time per level. Meanwhile, once a second, it samples the server's memory, the
// database's connections by state, the box's load and free memory, and how long a tiny request takes (the event loop).
// After each level it reads /admin/jobs, to see whether the job runner kept its minute.
//
// Never against the live site. This VPS also serves live sites, so: a level stops at once below --min-free-mb (600) of
// free memory, and the next level runs only if this one kept --next-if-free-mb (1500) free. Run the server on a scratch
// database (scripts/perf/scratch-db.ts) with the email and text keys empty (RESEND_API_KEY= POSTMARK_SERVER_TOKEN=
// TWILIO_AUTH_TOKEN=), and bind it to localhost (`next start --hostname localhost`).
//
//   node scripts/perf/load.mjs http://localhost:3400 --sign-in [--helpers 20] --cookies <file>
//   node scripts/perf/load.mjs http://localhost:3400 --pid <next-server pid> --db tasksnearme_perf --cookies <file> \
//     [--levels 50,200] [--seconds 60] [--market austin] [--json out.json]
//
// --sign-in signs in through /dev/sign-in (e2e builds) as Jordan and his copies in a multiplied database
// (jordan+c<n>@example.test, one session per visitor in turn on Find work) and as Casey (finance, code 123456), and writes
// the cookies to <file>. The proxy's own database connection, which an e2e build never uses, has its own check:
// scripts/perf/proxy-lookups.ts.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { promisify } from 'node:util';

const run = promisify(execFile);
const args = process.argv.slice(2);
const base = (args.find((arg) => /^https?:/.test(arg)) ?? 'http://localhost:3400').replace(/\/$/, '');
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
// The box also serves live sites: below this much free memory the test stops at once.
const FLOOR_MB = Number(option('min-free-mb', '600'));
const abort = { reason: null };
const freeMb = () => Math.round(Number(/MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))?.[1] ?? 0) / 1024);

async function signIn(file) {
  const require = createRequire(`${process.cwd()}/package.json`);
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch();
  const cookies = {};
  try {
    const helpers = Number(option('helpers', '1'));
    // Jordan, then his copies in a multiplied scratch database (scripts/perf/multiply.ts): jordan+c<n>@example.test.
    const people = Array.from({ length: helpers }, (_, n) => ['helper', n === 0 ? 'jordan@example.test' : `jordan+c${n}@example.test`, null]);
    cookies.helpers = [];
    for (const [role, email, code] of [...people, ['staff', 'casey@example.test', '123456']]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${base}/dev/sign-in`);
      const form = page.getByRole('form', { name: 'Sign in by email' });
      await form.getByLabel('Email').fill(email);
      await form.getByRole('button', { name: 'Sign in' }).click();
      if (code) {
        await page.waitForURL(/\/admin\/verify$/, { timeout: 60_000 });
        await page.getByLabel('Code').fill(code);
        await page.getByRole('button', { name: 'Verify' }).click();
        await page.waitForURL(/\/admin$/, { timeout: 60_000 });
      } else await page.waitForURL(/\/app$/, { timeout: 60_000 });
      const header = (await context.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
      if (role === 'helper') cookies.helpers.push(header);
      else cookies[role] = header;
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(file, JSON.stringify(cookies), { mode: 0o600 });
  console.log(`signed in ${cookies.helpers.length} helpers and staff; cookies in ${file}`);
}

const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN);
const ms = (value) => (Number.isFinite(value) ? `${Math.round(value)}` : '-');

async function samples(pid, db, stop) {
  const rows = [];
  while (!stop.done) {
    const at = Date.now();
    const sample = { at, load1: os.loadavg()[0], freeMb: freeMb() };
    if (sample.freeMb < FLOOR_MB && !abort.reason) abort.reason = `only ${sample.freeMb} MB of memory left on the box`;
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      sample.rssMb = Math.round(Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0) / 1024);
    } catch {
      sample.rssMb = null;
    }
    const health = performance.now();
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(10_000) });
      sample.health = { status: response.status, body: (await response.text()).slice(0, 200), ms: performance.now() - health };
    } catch (error) {
      sample.health = { status: 0, body: error.name, ms: performance.now() - health };
    }
    try {
      const { stdout } = await run('docker', ['exec', 'tasksnearme-db', 'psql', '-U', 'tnm', '-d', 'postgres', '-At', '-F', ',', '-c',
        `select coalesce(state, '?'), count(*) from pg_stat_activity where datname = '${db}' group by 1`]);
      sample.db = Object.fromEntries(stdout.trim().split('\n').filter(Boolean).map((line) => line.split(',')).map(([state, count]) => [state, Number(count)]));
    } catch {
      sample.db = null;
    }
    rows.push(sample);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1000 - (Date.now() - at))));
  }
  return rows;
}

async function jobsPage(cookie) {
  const response = await fetch(`${base}/admin/jobs`, { headers: { cookie }, signal: AbortSignal.timeout(30_000) });
  const html = await response.text();
  return { status: response.status, text: html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
}

async function level(visitors, seconds, cookies, taskPaths, boardPath, pid, db) {
  const steps = [
    { name: 'home', path: () => '/' },
    { name: 'board', path: () => boardPath },
    { name: 'task', path: () => taskPaths[Math.floor(Math.random() * taskPaths.length)] },
    { name: 'find work', path: () => '/app/find-work', helper: true },
  ];
  const stats = Object.fromEntries(steps.map((step) => [step.name, { times: [], statuses: {} }]));
  const stop = { done: false };
  const sampling = samples(pid, db, stop);
  const started = performance.now();
  const until = started + seconds * 1000;
  await Promise.all(
    Array.from({ length: visitors }, async (_, index) => {
      let at = index % steps.length;
      while (performance.now() < until && !abort.reason) {
        const step = steps[at];
        at = (at + 1) % steps.length;
        const begin = performance.now();
        let status;
        try {
          const response = await fetch(`${base}${step.path()}`, {
            headers: step.helper ? { cookie: cookies.helpers[index % cookies.helpers.length] } : {},
            redirect: 'manual',
            signal: AbortSignal.timeout(30_000),
          });
          await response.arrayBuffer();
          status = String(response.status);
        } catch (error) {
          status = error.name === 'TimeoutError' ? 'timeout' : `error ${error.code ?? error.name}`;
        }
        const entry = stats[step.name];
        entry.times.push(performance.now() - begin);
        entry.statuses[status] = (entry.statuses[status] ?? 0) + 1;
      }
    }),
  );
  const elapsed = (performance.now() - started) / 1000;
  stop.done = true;
  const sampled = await sampling;
  const jobs = cookies.staff ? await jobsPage(cookies.staff) : null;
  const pages = Object.fromEntries(
    Object.entries(stats).map(([name, entry]) => {
      const sorted = [...entry.times].sort((a, b) => a - b);
      return [name, { requests: sorted.length, p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), p99: quantile(sorted, 0.99), max: sorted.at(-1), statuses: entry.statuses }];
    }),
  );
  const total = Object.values(pages).reduce((sum, page) => sum + page.requests, 0);
  return { visitors, seconds: elapsed, perSecond: total / elapsed, pages, samples: sampled, jobs, stopped: abort.reason };
}

function report(result) {
  console.log(`\n${result.visitors} visitors for ${result.seconds.toFixed(0)} s: ${result.perSecond.toFixed(1)} pages/s`);
  console.log('  page        requests   p50    p95    p99    max (ms)   statuses');
  for (const [name, page] of Object.entries(result.pages)) {
    console.log(`  ${name.padEnd(10)} ${String(page.requests).padStart(8)} ${ms(page.p50).padStart(6)} ${ms(page.p95).padStart(6)} ${ms(page.p99).padStart(6)} ${ms(page.max).padStart(6)}     ${JSON.stringify(page.statuses)}`);
  }
  const rss = result.samples.map((sample) => sample.rssMb).filter((value) => value !== null);
  const health = result.samples.map((sample) => sample.health.ms).sort((a, b) => a - b);
  const connections = result.samples.map((sample) => Object.values(sample.db ?? {}).reduce((sum, count) => sum + count, 0));
  const active = result.samples.map((sample) => sample.db?.active ?? 0);
  const healthStates = [...new Set(result.samples.map((sample) => `${sample.health.status} ${sample.health.body}`))];
  console.log(`  server memory ${Math.min(...rss)}-${Math.max(...rss)} MB; box load up to ${Math.max(...result.samples.map((sample) => sample.load1)).toFixed(1)}, free memory down to ${Math.min(...result.samples.map((sample) => sample.freeMb))} MB`);
  if (result.stopped) console.log(`  STOPPED EARLY: ${result.stopped}`);
  console.log(`  database connections up to ${Math.max(...connections)} (active up to ${Math.max(...active)})`);
  console.log(`  /api/health took p50 ${ms(quantile(health, 0.5))} ms, max ${ms(health.at(-1))} ms; answers: ${healthStates.slice(0, 3).join(' | ')}`);
  if (result.jobs) console.log(`  /admin/jobs ${result.jobs.status}: ${result.jobs.text.slice(0, 600)}`);
}

async function main() {
  const cookieFile = option('cookies', 'load-cookies.json');
  if (has('sign-in')) return signIn(cookieFile);
  const pid = Number(option('pid', '0'));
  const db = option('db', 'tasksnearme_perf');
  const levels = option('levels', '50,200').split(',').map(Number);
  const seconds = Number(option('seconds', '60'));
  const market = option('market', 'austin');
  const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
  const boardPath = `/${market}/tasks`;
  const board = await (await fetch(`${base}${boardPath}`)).text();
  const taskPaths = [...new Set([...board.matchAll(/href="(\/tasks\/[a-z0-9-]+)"/g)].map((match) => match[1]))];
  if (taskPaths.length === 0) throw new Error(`No task links on ${boardPath}: check --market and the link pattern.`);
  console.log(`board ${boardPath}: ${taskPaths.length} task pages to rotate through`);
  const results = [];
  for (const visitors of levels) {
    const result = await level(visitors, seconds, cookies, taskPaths, boardPath, pid, db);
    report(result);
    results.push(result);
    if (abort.reason) break;
    // The next, bigger level runs only if this one left headroom on a box that also serves live sites.
    const minFree = Math.min(...result.samples.map((sample) => sample.freeMb));
    const needed = Number(option('next-if-free-mb', '1500'));
    if (visitors !== levels.at(-1) && minFree < needed) {
      console.log(`  the next level is skipped: free memory fell to ${minFree} MB here (it needs ${needed} MB of headroom)`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  const json = option('json', '');
  if (json) fs.writeFileSync(json, JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(`load failed: ${error.stack ?? error}`);
  process.exitCode = 1;
});
