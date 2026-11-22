import { expect, test, type Page } from '@playwright/test';
import shellEn from '../../messages/en/ui/shell.json';
import shellEs from '../../messages/es/ui/shell.json';
import publicPagesEn from '../../messages/en/ui/publicPages.json';

/**
 * What stays put when the page switches (owner, 2026-11-22): a public page reached from the landing keeps its own
 * layout (Next keeps the landing mounted but hidden, and its mark used to lay /pricing out full width under the top
 * bar); the saved theme survives a language switch; a season a link names stays for the browser session. Read-only.
 */

test.skip(({ isMobile }) => isMobile, 'the top bar’s links and the theme switch are in the phone’s menu; the layout under test is the desktop one');

/** `<main>`'s box: a public page sits in the content column under the top bar; the landing runs full width. */
async function mainBox(page: Page) {
  return page.locator('main#main').evaluate((main) => {
    const style = getComputedStyle(main);
    return { paddingTop: parseFloat(style.paddingTop), maxWidth: style.maxWidth };
  });
}

test('pricing and how it works keep their own layout after the landing, and the landing its own after Back', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-landing-page]')).toHaveCount(1);
  expect((await mainBox(page)).maxWidth).toBe('none');

  const bar = page.getByRole('banner');
  await bar.getByRole('link', { name: shellEn.nav.pricing }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  // By name: during the switch the landing's own h1 is still showing for a moment (then the router hides it).
  const heading = page.getByRole('heading', { level: 1, name: publicPagesEn.pricing.title });
  await expect(heading).toBeVisible();
  // The landing's hidden copy no longer carries its mark, so the page has its column and its top padding back.
  await expect.poll(async () => (await mainBox(page)).maxWidth).not.toBe('none');
  expect((await mainBox(page)).paddingTop).toBeGreaterThan(64);
  // Its heading starts below the top bar, not under it.
  const barBottom = (await bar.boundingBox())!.y + (await bar.boundingBox())!.height;
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(barBottom);

  await bar.getByRole('link', { name: shellEn.nav.howItWorks }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole('heading', { level: 1, name: publicPagesEn.howItWorks.title })).toBeVisible();
  await expect.poll(async () => (await mainBox(page)).maxWidth).not.toBe('none');
  expect((await mainBox(page)).paddingTop).toBeGreaterThan(64);

  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(async () => (await mainBox(page)).maxWidth).toBe('none');
});

test('the saved theme stays when the language switches in place', async ({ page }) => {
  await page.goto('/pricing');
  await page.getByRole('banner').getByRole('button', { name: shellEn.theme.toDark }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('contentinfo').getByRole('navigation', { name: shellEn.footer.language }).getByRole('link', { name: 'Español' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // And on the next page the router brings in.
  await page.getByRole('banner').getByRole('link', { name: shellEs.homeLink }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/(es)?$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Back to English for the other tests in this browser.
  await page.getByRole('contentinfo').getByRole('link', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('a season a link names stays between pages for the session, and auto goes back to the calendar', async ({ page }) => {
  await page.goto('/');
  const own = await page.locator('[data-season]').first().getAttribute('data-season');
  const other = own === 'winter' ? 'summer' : 'winter';

  await page.goto(`/?season=${other}`);
  await expect(page.locator(`[data-season="${other}"]`).first()).toBeAttached();
  await page.goto('/pricing');
  await page.goto('/');
  await expect(page.locator(`[data-season="${other}"]`).first()).toBeAttached();

  // `autumn` names fall.
  await page.goto('/?season=autumn');
  await expect(page.locator('[data-season="fall"]').first()).toBeAttached();

  await page.goto('/?season=auto');
  await expect(page.locator(`[data-season="${own}"]`).first()).toBeAttached();
  await page.goto('/');
  await expect(page.locator(`[data-season="${own}"]`).first()).toBeAttached();
});
