import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Next.js dev tools button; hidden so it doesn't cover content in screenshots. */
const HIDE_DEV_OVERLAY = 'nextjs-portal { display: none !important; }';

/** Previews are split into shards that run in parallel; each shard's timeout grows with its size. */
const SHARDS = 4;
const PER_PREVIEW_MS = 15_000;

/**
 * Each shard moves to a fresh page after this many previews. A new page gets a new renderer process. One page
 * kept for a whole shard grew its renderer by about 16 MB a preview, and four such pages ran the 7.7 GB VPS
 * out of memory (2026-11-14). Measured on the same 120 previews: one page peaked at 2.2 GB, a fresh page every
 * 25 at 973 MB, every 10 at 689 MB, all at the same speed.
 */
const PREVIEWS_PER_PAGE = 10;

const fileFor = (id: string) => `${id.replaceAll('/', '__')}.png`;

/**
 * `UI_PREVIEW_LOCALE=es` renders every preview in Spanish (from /es/dev/ui; screenshots in
 * artifacts/ui-previews/<project>-es). Spanish runs longer than English, so that pass also fails on a
 * page that scrolls sideways at the viewport's width.
 */
const LOCALE = process.env.UI_PREVIEW_LOCALE === 'es' ? 'es' : null;
const BASE = LOCALE ? `/${LOCALE}` : '';

async function listPreviewIds(page: Page): Promise<string[]> {
  await page.goto(`${BASE}/dev/ui`);
  return page
    .locator('[data-preview-id]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('data-preview-id') ?? ''));
}

/** Deletes screenshots of previews that no longer exist. Safe to run from every shard at once. */
function removeStaleScreenshots(outDir: string, ids: string[]) {
  if (!fs.existsSync(outDir)) return;
  const current = new Set(ids.map(fileFor));
  for (const file of fs.readdirSync(outDir)) {
    if (file.endsWith('.png') && !current.has(file)) fs.rmSync(path.join(outDir, file), { force: true });
  }
}

/**
 * Owned by Claude. Renders every preview registered in src/ui/previews/registry.ts,
 * fails on runtime errors or serious/critical axe violations, and saves a full-page
 * screenshot per preview and viewport to artifacts/ui-previews/<project>/<id>.png.
 */
for (let shard = 0; shard < SHARDS; shard += 1) {
  test(`UI previews render, pass axe, and are captured (part ${shard + 1} of ${SHARDS})`, async ({ page: firstPage, context }, testInfo) => {
    let page = firstPage;
    const ids = await listPreviewIds(page);
    test.skip(ids.length === 0, 'No previews registered yet');
    const mine = ids.filter((_, index) => index % SHARDS === shard);
    test.setTimeout(30_000 + mine.length * PER_PREVIEW_MS);

    const outDir = `artifacts/ui-previews/${testInfo.project.name}${LOCALE ? `-${LOCALE}` : ''}`;
    removeStaleScreenshots(outDir, ids);

    let errors: string[] = [];
    const collectErrors = (target: Page) => {
      target.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      target.on('console', (message) => {
        // The machine's network changing mid-run is not an app error.
        if (message.type() === 'error' && !message.text().includes('net::ERR_NETWORK_CHANGED')) {
          errors.push(`console.error: ${message.text()}`);
        }
      });
    };
    collectErrors(page);

    for (const [index, id] of mine.entries()) {
      if (index > 0 && index % PREVIEWS_PER_PAGE === 0) {
        await page.close();
        page = await context.newPage();
        collectErrors(page);
      }
      await test.step(id, async () => {
        errors = [];
        await page.goto(`${BASE}/dev/ui/${id.split('/').map(encodeURIComponent).join('/')}`);
        const root = page.locator(`[data-preview-root="${id}"]`);
        await expect(root, `preview ${id} should render`).toBeVisible();

        const results = await new AxeBuilder({ page }).include(`[data-preview-root="${id}"]`).analyze();
        const serious = results.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`);
        expect(serious, `axe violations in ${id}`).toEqual([]);

        if (LOCALE) {
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, `${id} scrolls sideways in ${LOCALE}`).toBeLessThanOrEqual(1);
        }

        await page.addStyleTag({ content: HIDE_DEV_OVERLAY });
        await page.screenshot({ path: `${outDir}/${fileFor(id)}`, fullPage: true });
        expect(errors, `runtime errors in ${id}`).toEqual([]);
      });
    }
  });
}
