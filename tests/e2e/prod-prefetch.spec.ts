import { expect, test } from '@playwright/test';

/**
 * Completion plan 5.7: after a visit to /es (the explicit Spanish URL), the router's segment prefetches for the
 * public pages' links (/es/how-it-works, /es/pricing, /es/become-a-helper) must not 404. The router learned "/[locale]
 * is the landing page" from /es and read those paths as locales, until the root layout declared `locale` a closed
 * parameter (`unstable_paramMatching`). Spanish pages link with the /es prefix since (LocaleLink); this waited for
 * un-prefixed links, which no longer exist there, until 2026-11-21. It also covers the root layout's dialog slot
 * (src/app/[locale]/@modal), whose segments come with every prefetch.
 *
 * Dev never prefetches, so this runs only against a production server: set PROD_BASE_URL (for example
 * http://localhost:3300 after `next build && next start -p 3300 --hostname localhost`, or the preview site).
 */

const base = process.env.PROD_BASE_URL;

test('Spanish visitors prefetch the public pages without 404s', async ({ page }, testInfo) => {
  test.skip(!base, 'needs a production server (PROD_BASE_URL)');
  // On a phone those links are in the closed menu: nothing to hover, so nothing is prefetched.
  test.skip(testInfo.project.name !== 'app-desktop', 'hover prefetching; desktop only');
  test.setTimeout(120_000);
  const failed: string[] = [];
  const prefetched = new Set<string>();
  page.on('response', (response) => {
    const request = response.request();
    const segment = request.headers()['next-router-segment-prefetch'];
    if (!segment) return;
    const path = new URL(request.url()).pathname;
    prefetched.add(path);
    if (response.status() >= 400) failed.push(`${response.status()} ${path} ${segment}`);
  });
  await page.goto(`${base}/es`, { waitUntil: 'load' });
  const pages = ['/es/how-it-works', '/es/pricing', '/es/become-a-helper'];
  for (const href of pages) await page.locator(`a[href="${href}"]`).first().hover().catch(() => {});
  await expect.poll(() => pages.every((path) => prefetched.has(path)), { timeout: 30_000 }).toBe(true);
  // Let the segment requests after each route tree finish.
  await page.waitForTimeout(3_000);
  expect(failed).toEqual([]);
});
