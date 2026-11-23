import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * How page switches move (owner, 2026-11-23: "Even some skeletons are appeared in top of action bar … Deep analyze and
 * upgrade all switch animations"; src/ui/theme/transitions.css): the tab dock is captured apart from the page and drawn
 * above it, a tap on the dock during a switch still reaches its tab (not the page under it), and each switch moves by
 * where the new page lives. Read-only, on the seeded data.
 */

test.skip(({ isMobile }) => !isMobile, 'the tab dock is the phone’s');

const dock = (page: Page) => page.locator('[data-mobile-bottom-nav]');
const switching = (page: Page) => page.evaluate(() => document.documentElement.matches(':active-view-transition'));
const motion = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-page-motion'));

test('the dock stays above a page switch, and a tap on it during the switch still switches', async ({ page }) => {
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/find-work');
  await expect(page.getByRole('heading', { level: 1, name: 'Find work' })).toBeVisible();
  // Ten times slower, so the switch is still running when the second tap lands.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
  try {
    await dock(page).getByRole('link', { name: /^Neighbors/ }).click();
    // The dock is a picture of its own over the pages, not part of the page underneath them. (Polled: the transition
    // counts as running a moment before its pictures are taken and start moving.)
    const pictures = () => page.evaluate(() => document.getAnimations().map((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement).filter(Boolean));
    await expect.poll(pictures, { timeout: 10_000 }).toContain('::view-transition-group(app-dock)');

    const bookings = (await dock(page).getByRole('link', { name: /^Bookings/ }).boundingBox())!;
    await page.touchscreen.tap(bookings.x + bookings.width / 2, bookings.y + bookings.height / 2);
    expect(await switching(page)).toBe(true);
  } finally {
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
  }
  await expect(page).toHaveURL(/\/app\/bookings$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bookings' })).toBeVisible();
});

test('a switch moves by where the page lives: deeper, back up, or across the tabs', async ({ page }) => {
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/bookings');
  await expect(page.getByRole('heading', { level: 1, name: 'Bookings' })).toBeVisible();

  await page.locator('main a[href*="/app/bookings/bkg_"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_/);
  expect(await motion(page)).toBe('forward');

  await page.locator('main a[href$="/app/bookings"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/app\/bookings$/);
  expect(await motion(page)).toBe('back');

  await dock(page).getByRole('link', { name: /^Find work/ }).click();
  await expect(page).toHaveURL(/\/app\/find-work$/);
  expect(await motion(page)).toBe('lateral');
});
