// The JavaScript each page loads (completion plan 5.7), on a running production build: compressed and raw bytes,
// and the largest files. No throttling; this is about weight, not timing (page-budgets.mjs does timing).
//
//   node scripts/perf/page-js.mjs http://localhost:3101 / /pricing /austin
import { chromium } from 'playwright';

const [base = 'http://localhost:3101', ...paths] = process.argv.slice(2);
const browser = await chromium.launch();
for (const path of paths.length ? paths : ['/', '/pricing', '/austin']) {
  const context = await browser.newContext({ viewport: { width: 412, height: 823 }, isMobile: true });
  const page = await context.newPage();
  const files = [];
  page.on('response', async (response) => {
    if (!/\/_next\/static\/.*\.js(\?|$)/.test(response.url())) return;
    try {
      const body = await response.body();
      const sizes = await response.request().sizes();
      files.push({ url: response.url().replace(base, ''), raw: body.length, wire: sizes.responseBodySize });
    } catch {
      // A response that went away with the page.
    }
  });
  await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(4000);
  await context.close();
  const kb = (bytes) => (bytes / 1024).toFixed(1);
  const wire = files.reduce((total, file) => total + file.wire, 0);
  const raw = files.reduce((total, file) => total + file.raw, 0);
  console.log(`${path}: ${files.length} scripts, ${kb(wire)} KB over the wire, ${kb(raw)} KB raw`);
  for (const file of files.sort((a, b) => b.raw - a.raw).slice(0, 6)) console.log(`   ${kb(file.raw).padStart(7)} KB raw  ${kb(file.wire).padStart(6)} KB wire  ${file.url.slice(0, 70)}`);
}
await browser.close();
