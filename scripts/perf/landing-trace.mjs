// What the landing page waits on (completion plan 5.7): on a running production build, with the phone profile of
// page-budgets.mjs, the LCP element and when it painted, whether the hero copy starts hidden until scripts run,
// and every request in the first 30 s, grouped (scripts, map tiles, the 3D town, images, data, polling).
//
//   node scripts/perf/landing-trace.mjs http://localhost:3101 [/path]
import { chromium } from 'playwright';

const [base = 'http://localhost:3101', path = '/'] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, locale: 'en-US' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

const started = Date.now();
const requests = [];
const sizes = new Map();
cdp.on('Network.requestWillBeSent', (event) => requests.push({ id: event.requestId, url: event.request.url, at: Date.now() - started, type: event.type }));
cdp.on('Network.loadingFinished', (event) => sizes.set(event.requestId, event.encodedDataLength));
await page.addInitScript(() => {
  window.__lcp = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const element = entry.element;
      window.__lcp.push({ time: Math.round(entry.startTime), size: entry.size, element: element ? `${element.tagName.toLowerCase()} ${(element.textContent ?? element.getAttribute('src') ?? '').trim().slice(0, 50)}` : '' });
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  // When the hero heading first became visible (opacity above 0 and not hidden), polled until scripts take over.
  window.__heroVisibleAt = null;
  const check = () => {
    const hero = document.querySelector('main h1');
    if (hero && window.__heroVisibleAt === null) {
      const style = getComputedStyle(hero);
      if (Number(style.opacity) > 0.01 && style.visibility !== 'hidden') window.__heroVisibleAt = Math.round(performance.now());
    }
    if (window.__heroVisibleAt === null) requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
});
const response = await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 120_000 });
const loadAt = Date.now() - started;
await page.waitForTimeout(30_000);
const timings = await page.evaluate(() => {
  const [navigation] = performance.getEntriesByType('navigation');
  const scripts = performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'script');
  return {
    lcp: window.__lcp,
    heroVisibleAt: window.__heroVisibleAt,
    domContentLoaded: Math.round(navigation.domContentLoadedEventEnd),
    lastScriptEnd: Math.round(Math.max(0, ...scripts.map((entry) => entry.responseEnd))),
    heroInitialStyle: (() => {
      const hero = document.querySelector('main h1');
      return hero ? { inlineStyle: hero.getAttribute('style'), dataMotion: hero.closest('[data-motion], [style*="opacity"]')?.getAttribute('style') ?? null } : null;
    })(),
  };
});
await browser.close();

const group = (url) => {
  if (/tiles\.openfreemap|\/tiles\/|\.pbf|\.mvt/.test(url)) return 'map tiles';
  if (/maplibre|style\.json|sprite|glyphs|fonts\/.*\.pbf/.test(url)) return 'map assets';
  if (/\.(glb|gltf|ktx2|hdr|bin)(\?|$)|\/town\/|three/.test(url)) return '3D town';
  if (/\/_next\/static\/.*\.js/.test(url)) return 'scripts';
  if (/\.css(\?|$)/.test(url)) return 'styles';
  if (/\.(webp|png|jpe?g|svg|avif)(\?|$)/.test(url)) return 'images';
  if (/_rsc=|\/api\//.test(url)) return 'data and prefetches';
  return 'other';
};
const rows = requests.map((request) => ({ ...request, kb: (sizes.get(request.id) ?? 0) / 1024, group: group(request.url) }));
const byGroup = new Map();
for (const row of rows) {
  const entry = byGroup.get(row.group) ?? { count: 0, kb: 0, afterLoad: 0, last: 0 };
  entry.count += 1;
  entry.kb += row.kb;
  if (row.at > loadAt) entry.afterLoad += 1;
  entry.last = Math.max(entry.last, row.at);
  byGroup.set(row.group, entry);
}
console.log(`${path}: status ${response?.status()}, load event at ${loadAt} ms`);
console.log(`LCP candidates: ${JSON.stringify(timings.lcp)}`);
console.log(`hero heading visible at ${timings.heroVisibleAt} ms; DOMContentLoaded ${timings.domContentLoaded} ms; last script finished ${timings.lastScriptEnd} ms`);
console.log(`hero styles once settled: ${JSON.stringify(timings.heroInitialStyle)}`);
for (const [name, entry] of [...byGroup].sort((a, b) => b[1].kb - a[1].kb)) console.log(`  ${name.padEnd(20)} ${String(entry.count).padStart(4)} requests ${entry.kb.toFixed(1).padStart(8)} KB  ${entry.afterLoad} after load, last at ${entry.last} ms`);
const late = rows.filter((row) => row.at > loadAt + 5000);
console.log(`requests more than 5 s after load: ${late.length}`);
for (const row of late.slice(0, 15)) console.log(`  +${row.at} ms ${row.group}: ${row.url.replace(base, '').slice(0, 110)}`);
