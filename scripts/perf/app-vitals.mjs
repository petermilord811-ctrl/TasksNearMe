// The signed-in app's speed on a phone (speed pass, 2026-11-21): LCP, CLS, INP and the JavaScript each route loads, on a
// running production build (not the dev server) with the phone profile of page-budgets.mjs: Lighthouse's mobile
// device (412 × 823 at 1.75×), the CPU slowed 4× and "slow 4G" (150 ms round trips, 1.6 Mbit/s down, 750 kbit/s up).
//
//   node scripts/perf/app-vitals.mjs http://localhost:3300 [--runs 3] [--json out.json] [--only home,task]
//
// It signs in once through /dev/sign-in (e2e and development builds) as Jordan, a helper of the seed, then loads each
// route cold `runs` times (a new browser context with the session cookie and nothing cached), and reports medians.
// INP comes from one tap per route, made after the page settles (the account menu, or the route's own control); a
// lab INP from one interaction is a floor, not the field's 75th percentile. Bytes are Resource Timing's: over the
// wire (compressed) and raw (decoded).
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const base = (args.find((arg) => /^https?:/.test(arg)) ?? 'http://localhost:3300').replace(/\/$/, '');
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const runs = Number(option('runs', 3));
const only = option('only', '')?.split(',').filter(Boolean) ?? [];
const EMAIL = option('email', 'jordan@example.test');

const PHONE = {
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
  locale: 'en-US',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Moto G Power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
};

/** The routes, each with the tap that measures INP once it has settled. */
const ROUTES = [
  { name: 'home', path: '/app', tap: (page) => page.getByRole('button', { name: /account menu|open menu/i }).first() },
  { name: 'find-work-list', path: '/app/find-work', tap: (page) => page.getByRole('button', { name: /account menu|open menu/i }).first() },
  { name: 'find-work-map', path: '/app/find-work?view=map', tap: (page) => page.getByRole('button', { name: /account menu|open menu/i }).first() },
  { name: 'task', path: '/app/find-work/tsk_shelves', tap: (page) => page.getByLabel('Message to the client'), type: 'Hi' },
  { name: 'booking', path: '/app/bookings/bkg_tv', tap: (page) => page.getByRole('button', { name: 'More' }).filter({ visible: true }).first() },
  { name: 'messages', path: '/app/messages', tap: (page) => page.getByRole('button', { name: /account menu|open menu/i }).first() },
  { name: 'account', path: '/app/account', tap: (page) => page.getByRole('button', { name: /account menu|open menu/i }).first() },
].filter((route) => only.length === 0 || only.includes(route.name));

const browser = await chromium.launch();

async function signIn() {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await page.goto(`${base}/dev/sign-in`, { timeout: 120_000 });
  const form = page.getByRole('form', { name: 'Sign in by email' });
  await form.getByLabel('Email').fill(EMAIL);
  await form.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 120_000 });
  const state = await context.storageState();
  await context.close();
  return state;
}

async function measure(route, storageState) {
  const context = await browser.newContext({ ...PHONE, storageState });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const vitals = { lcp: 0, lcpElement: '', cls: 0, events: [], shifts: [] };
    window.__vitals = vitals;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const element = entry.element;
        vitals.lcp = entry.startTime;
        vitals.lcpElement = element ? `${element.tagName.toLowerCase()} ${(element.getAttribute('src') ?? element.textContent ?? '').trim().slice(0, 50)}` : '';
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        vitals.cls += entry.value;
        const describe = (node) => !node ? '' : node.nodeType === 1 ? `${node.tagName.toLowerCase()}.${String(node.className?.baseVal ?? node.className ?? '').split(' ').slice(0, 3).join('.')} "${(node.textContent ?? '').trim().slice(0, 30)}"` : `#text "${(node.textContent ?? '').trim().slice(0, 30)}"`;
        vitals.shifts.push({ at: Math.round(entry.startTime), value: Number(entry.value.toFixed(4)), sources: (entry.sources ?? []).slice(0, 3).map((source) => describe(source.node)) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.interactionId) vitals.events.push({ name: entry.name, duration: entry.duration });
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  });
  const started = Date.now();
  await page.goto(`${base}${route.path}`, { waitUntil: 'load', timeout: 180_000 });
  // LCP settles once larger content stops painting; input would stop it, so none is sent until it has stayed the same
  // for 4 s (or 20 s passed).
  for (let waited = 0, last = -1, stableFor = 0; waited < 20_000 && stableFor < 4000; waited += 500) {
    await page.waitForTimeout(500);
    const now = await page.evaluate(() => window.__vitals.lcp);
    stableFor = now === last ? stableFor + 500 : 0;
    last = now;
  }
  const loaded = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource');
    const [navigation] = performance.getEntriesByType('navigation');
    const scripts = resources.filter((entry) => entry.initiatorType === 'script' || /\.m?js(\?|$)/.test(entry.name));
    const images = resources.filter((entry) => entry.initiatorType === 'img' || /\.(png|jpe?g|webp|avif|svg)(\?|$)/.test(entry.name) || entry.name.includes('/_next/image'));
    const tiles = resources.filter((entry) => /tiles?|\.pbf|\.mvt|maplibre|openfreemap|protomaps/i.test(entry.name));
    const sum = (list, key) => list.reduce((total, entry) => total + (entry[key] || 0), 0);
    return {
      ttfb: navigation ? navigation.responseStart : 0,
      domContentLoaded: navigation ? navigation.domContentLoadedEventEnd : 0,
      requests: resources.length,
      jsWire: sum(scripts, 'transferSize'),
      jsRaw: sum(scripts, 'decodedBodySize'),
      jsFiles: scripts.length,
      imgWire: sum(images, 'transferSize'),
      tileRequests: tiles.length,
      tileWire: sum(tiles, 'transferSize'),
      largestScripts: scripts.sort((a, b) => (b.decodedBodySize || 0) - (a.decodedBodySize || 0)).slice(0, 5).map((entry) => ({ url: entry.name.replace(location.origin, '').slice(0, 90), raw: entry.decodedBodySize, wire: entry.transferSize })),
    };
  });
  let inp = 0;
  try {
    const target = route.tap(page);
    await target.waitFor({ state: 'visible', timeout: 15_000 });
    if (route.type) {
      await target.tap();
      await page.keyboard.type(route.type, { delay: 120 });
    } else {
      await target.tap();
    }
    await page.waitForTimeout(1500);
    inp = await page.evaluate(() => Math.max(0, ...window.__vitals.events.map((event) => event.duration)));
  } catch (error) {
    inp = -1;
    console.error(`  ${route.name}: no INP tap (${String(error).split('\n')[0].slice(0, 120)})`);
  }
  const vitals = await page.evaluate(() => ({ lcp: window.__vitals.lcp, lcpElement: window.__vitals.lcpElement, cls: window.__vitals.cls, shifts: window.__vitals.shifts.slice(0, 6), slowEvents: [...window.__vitals.events].sort((a, b) => b.duration - a.duration).slice(0, 4) }));
  await context.close();
  return { ...vitals, inp, ...loaded, wallMs: Date.now() - started };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const kb = (bytes) => Math.round(bytes / 1024);

const storageState = await signIn();
const results = {};
for (const route of ROUTES) {
  const samples = [];
  for (let run = 0; run < runs; run += 1) samples.push(await measure(route, storageState));
  const pick = (key) => median(samples.map((sample) => sample[key]));
  const summary = {
    path: route.path,
    lcpMs: Math.round(pick('lcp')),
    lcpElement: samples[samples.length - 1].lcpElement,
    cls: Number(pick('cls').toFixed(3)),
    inpMs: Math.round(pick('inp')),
    ttfbMs: Math.round(pick('ttfb')),
    jsWireKb: kb(pick('jsWire')),
    jsRawKb: kb(pick('jsRaw')),
    jsFiles: pick('jsFiles'),
    imgWireKb: kb(pick('imgWire')),
    tileRequests: pick('tileRequests'),
    tileWireKb: kb(pick('tileWire')),
    requests: pick('requests'),
    largestScripts: samples[samples.length - 1].largestScripts,
    slowEvents: samples.map((sample) => sample.slowEvents),
    shifts: samples[samples.length - 1].shifts,
  };
  results[route.name] = summary;
  console.log(`${route.name.padEnd(15)} LCP ${String(summary.lcpMs).padStart(5)} ms  CLS ${summary.cls.toFixed(3)}  INP ${String(summary.inpMs).padStart(4)} ms  JS ${String(summary.jsWireKb).padStart(4)} KB wire / ${String(summary.jsRawKb).padStart(5)} KB raw (${summary.jsFiles} files)  img ${summary.imgWireKb} KB  tiles ${summary.tileRequests} (${summary.tileWireKb} KB)  reqs ${summary.requests}  [${summary.lcpElement}]`);
}
await browser.close();
const out = option('json', '');
if (out) fs.writeFileSync(out, JSON.stringify(results, null, 2));
