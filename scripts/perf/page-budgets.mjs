// Public page budgets (blueprint 07 §6, completion plan 5.7): LCP under 2.5 s on a mid-range Android phone over 4G,
// and a JS budget per route. Measures a running production build (not the dev server):
//
//   node scripts/perf/page-budgets.mjs http://localhost:3101 [--runs 3] [--json out.json]
//
// The phone is Lighthouse's mobile profile: a 412 × 823 screen at 1.75×, the CPU slowed 4×, and "slow 4G" (150 ms
// round trips, 1.6 Mbit/s down, 750 kbit/s up). Each page loads cold (a new browser context, nothing cached) `runs`
// times; the median LCP counts. Bytes are what went over the wire (compressed), from Resource Timing.
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const base = (args.find((arg) => !arg.startsWith('--') && /^https?:/.test(arg)) ?? 'http://localhost:3101').replace(/\/$/, '');
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const runs = Number(option('runs', 3));

/** Budgets: LCP from blueprint 07 §6; JS per route (compressed) so the phone stays within it. */
export const BUDGETS = { lcpMs: 2500, jsKb: 350 };

const browser = await chromium.launch();
async function measure(path) {
  const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, locale: 'en-US', userAgent: 'Mozilla/5.0 (Linux; Android 14; Moto G Power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    window.__lcp = { time: 0, element: '' };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const element = entry.element;
        window.__lcp = { time: entry.startTime, element: element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''} ${(element.getAttribute('src') ?? element.textContent ?? '').trim().slice(0, 60)}` : '' };
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  const response = await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 120_000 });
  // LCP settles once the page is idle; input would stop it, so none is sent.
  await page.waitForTimeout(3000);
  const result = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource');
    const [navigation] = performance.getEntriesByType('navigation');
    const sum = (filter) => resources.filter(filter).reduce((total, entry) => total + (entry.transferSize || entry.encodedBodySize || 0), 0);
    return {
      lcp: window.__lcp,
      ttfb: navigation ? navigation.responseStart : 0,
      htmlBytes: navigation ? navigation.transferSize || navigation.encodedBodySize : 0,
      jsBytes: sum((entry) => entry.initiatorType === 'script' || /\.m?js(\?|$)/.test(entry.name)),
      cssBytes: sum((entry) => /\.css(\?|$)/.test(entry.name)),
      imageBytes: sum((entry) => entry.initiatorType === 'img' || /\.(webp|avif|png|jpe?g|svg)(\?|$)/.test(entry.name)),
      requests: resources.length + 1,
    };
  });
  await context.close();
  return { status: response?.status() ?? 0, ...result };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const pages = ['/', '/austin', '/austin/furniture-assembly', '/austin/tasks', '/pricing', '/how-it-works', '/become-a-helper', '/trust-and-safety', '/help', '/sign-in', '/waitlist'];
// A public task page and a helper profile, found on the board and the market page.
const discover = async (path, pattern) => {
  const html = await (await fetch(`${base}${path}`)).text();
  return html.match(pattern)?.[1];
};
const task = await discover('/austin/tasks', /href="(\/tasks\/[a-z0-9-]+)"/);
const helper = await discover('/austin', /href="(\/helpers\/[a-z0-9-]+)"/);
if (task) pages.push(task);
if (helper) pages.push(helper);

const report = [];
for (const path of pages) {
  const samples = [];
  for (let run = 0; run < runs; run++) samples.push(await measure(path));
  const lcp = median(samples.map((sample) => sample.lcp.time));
  const pick = samples.find((sample) => sample.lcp.time === lcp) ?? samples[0];
  const row = { path, status: pick.status, lcpMs: Math.round(lcp), lcpElement: pick.lcp.element, ttfbMs: Math.round(median(samples.map((s) => s.ttfb))), htmlKb: +(pick.htmlBytes / 1024).toFixed(1), jsKb: +(pick.jsBytes / 1024).toFixed(1), cssKb: +(pick.cssBytes / 1024).toFixed(1), imageKb: +(pick.imageBytes / 1024).toFixed(1), requests: pick.requests };
  row.pass = row.status === 200 && row.lcpMs <= BUDGETS.lcpMs && row.jsKb <= BUDGETS.jsKb;
  report.push(row);
  console.log(`${row.pass ? 'ok  ' : 'OVER'} ${path.padEnd(34)} LCP ${String(row.lcpMs).padStart(5)} ms  TTFB ${String(row.ttfbMs).padStart(4)}  HTML ${String(row.htmlKb).padStart(6)} KB  JS ${String(row.jsKb).padStart(6)} KB  CSS ${String(row.cssKb).padStart(5)} KB  img ${String(row.imageKb).padStart(6)} KB  (${row.lcpElement})`);
}
await browser.close();
if (option('json')) fs.writeFileSync(option('json'), `${JSON.stringify({ base, runs, budgets: BUDGETS, report }, null, 2)}\n`);
process.exit(report.every((row) => row.pass) ? 0 : 1);
