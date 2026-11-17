#!/usr/bin/env node
/**
 * Renders the hero town's still pictures (public/ui/landing/town-<flora>-<layout>-<theme>-<season>.webp): the picture
 * browsers without a GPU see, and what previews and tests show. Each is drawn by the dev page /dev/town-still
 * on the town's own renderer, so it matches the live town; software WebGL (this VPS) is slow but draws the same.
 *
 *   node scripts/heavy.mjs node scripts/render-town-stills.mjs                              all 32
 *   node scripts/render-town-stills.mjs --only florida-wide-light-winter,texas-band-dark-fall   some
 *   node scripts/render-town-stills.mjs --flora florida                                     one region's 16
 *   node scripts/render-town-stills.mjs --out /some/folder                         somewhere else (to compare)
 *
 * Needs the dev server (npm run dev) on --base (default http://localhost:3000).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const base = option('base', 'http://localhost:3000');
const out = resolve(option('out', 'public/ui/landing'));
const floraOnly = option('flora', '');
const only = option('only', '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const FLORAS = ['texas', 'florida'];
const LAYOUTS = ['wide', 'band'];
const THEMES = ['light', 'dark'];
const SEASONS = ['fall', 'winter', 'spring', 'summer'];
const wanted = FLORAS.flatMap((flora) =>
  LAYOUTS.flatMap((layout) => THEMES.flatMap((theme) => SEASONS.map((season) => ({ flora, layout, theme, season, name: `${flora}-${layout}-${theme}-${season}` })))),
).filter((still) => (only.length === 0 || only.includes(still.name)) && (!floraOnly || still.flora === floraOnly));
if (wanted.length === 0) {
  console.error(`Nothing matches --only ${only.join(',')}`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
let failed = 0;
try {
  for (const still of wanted) {
    // A fresh page each time: a big WebGL context is let go at once, and memory stays flat.
    const page = await browser.newPage({ viewport: { width: 1400, height: 640 } });
    const started = Date.now();
    try {
      await page.goto(`${base}/dev/town-still?flora=${still.flora}&layout=${still.layout}&theme=${still.theme}&season=${still.season}`, { waitUntil: 'load', timeout: 180_000 });
      await page.waitForFunction(() => window.__townStill || window.__townStillError, null, { timeout: 300_000, polling: 500 });
      const { url, error } = await page.evaluate(() => ({ url: window.__townStill, error: window.__townStillError }));
      if (!url || !url.startsWith('data:image/webp;base64,')) throw new Error(error ?? `no WebP (got ${String(url).slice(0, 30)})`);
      const file = resolve(out, `town-${still.name}.webp`);
      const bytes = Buffer.from(url.slice('data:image/webp;base64,'.length), 'base64');
      writeFileSync(file, bytes);
      console.log(`${still.name}: ${Math.round(bytes.length / 1024)} KB in ${((Date.now() - started) / 1000).toFixed(1)} s → ${file}`);
    } catch (error) {
      failed++;
      console.error(`${still.name}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
