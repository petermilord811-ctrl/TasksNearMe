import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Pages that aren't there (sweep 2026-11-18; they were Next's bare, unstyled default with no language on <html>):
 * the site's own page in the site's shell, a real 404 with noindex, the page's language, and the ways on. Signed in,
 * the app's own shell and the app's ways on.
 */

const ways = (page: Page, name = 'Where to go next') => page.getByRole('navigation', { name });

for (const [what, path] of [
  ['an address no route matches', '/no/such/page/here'],
  ['an unknown city address (one segment)', '/no-such-city'],
  ['an unknown category, from notFound() in its page', '/gainesville/no-such-category'],
] as const) {
  test(`${what} is a real 404 in the site's shell`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1, name: 'This page could not be found' })).toBeVisible();
    await expect(page).toHaveTitle('Page not found · TasksNearMe');
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
    // The site's shell: its logo link home and its footer.
    await expect(page.getByRole('link', { name: 'TasksNearMe home' }).first()).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeAttached();
    await expect(ways(page).getByRole('link', { name: /^Home/ })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'See where we are' })).toHaveAttribute('href', '/cities');
  });
}

test('in Spanish under /es: the language on <html> and the copy', async ({ page }) => {
  const response = await page.goto('/es/no/existe/aqui');
  expect(response?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { level: 1, name: 'No pudimos encontrar esta página' })).toBeVisible();
  await expect(ways(page, 'Adónde ir ahora').getByRole('link', { name: /^Inicio/ })).toHaveAttribute('href', '/es');
});

test("signed in, an app address that isn't there keeps the app's shell and ways on", async ({ page }) => {
  await devSignIn(page, 'maya@example.test');
  for (const path of ['/app/no-such-page', '/app/bookings/bkg_does_not_exist']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'This page could not be found' })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    // One app shell on screen. (For /app/no-such-page the production build also leaves React's streamed copy of the
    // shell in a hidden <div hidden id="S:0">: notFound() before streaming takes Next's 404 path. It is inert, with no #main.)
    await expect(page.locator('[data-app-shell]:visible')).toHaveCount(1);
    await expect(page.locator('#main:visible')).toHaveCount(1);
    await expect(ways(page).getByRole('link', { name: /^Your dashboard/ })).toHaveAttribute('href', '/app');
  }
});
