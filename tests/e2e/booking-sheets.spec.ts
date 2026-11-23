import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Booking sheets (UI-012) on the seeded booking (Ben's TV with Jordan, in a few days). The cancel sheet
 * is opened and closed without cancelling, so other tests can keep reading the booking; cancelling
 * itself is covered by integration tests. A safety report only opens a support case, which staff then see as
 * urgent on their queues.
 */

async function openAction(page: Page, name: string) {
  await expect(page.getByRole('heading', { level: 1, name: 'Anchor a tall bookshelf to the wall' })).toBeVisible({ timeout: 30_000 });
  const more = page.getByRole('button', { name: 'More' });
  if (await more.isVisible()) await more.click();
  // Phones keep the rest of the actions under "More" (a menu).
  await page.getByRole('menuitem', { name }).or(page.getByRole('button', { name })).first().click();
}

test('the cancel sheet shows the refund from the policy', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'one project is enough');
  await devSignIn(page, 'ben@example.test');
  await page.goto('/app/bookings/bkg_tv');
  await openAction(page, 'Cancel booking');
  // Days before the start: everything back.
  await expect(page.getByText('$84.00').last()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Go back' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Anchor a tall bookshelf to the wall' })).toBeVisible();
});

test('a safety report puts 911 first and reaches support', async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'one project is enough');
  test.setTimeout(150_000);
  await devSignIn(page, 'ben@example.test');
  await page.goto('/app/bookings/bkg_tv');
  await openAction(page, 'Report a safety concern');
  await expect(page.getByRole('link', { name: /Call 911/ })).toHaveAttribute('href', 'tel:911');
  await page.getByRole('radio').first().click();
  await page.getByRole('textbox').last().fill('Someone was waiting outside and would not leave.');
  await page.getByRole('button', { name: 'Send safety report' }).click();
  await expect(page.getByText('Support will contact you shortly').first()).toBeVisible({ timeout: 30_000 });

  // Staff see it at once: the safety queue stands out with its urgent count (a safety report opens an urgent case).
  const staff = await (await browser.newContext()).newPage();
  await devSignIn(staff, 'alex@example.test', { landing: /\/admin\/verify$/ });
  await staff.getByLabel('Code').fill('123456');
  await staff.getByRole('button', { name: 'Verify' }).click();
  await expect(staff).toHaveURL(/\/admin$/, { timeout: 30_000 });
  const safety = staff.locator('a[href="/admin/cases?queue=safety&status=active"]');
  await expect(safety.getByText(/^\d+ urgent$/)).toBeVisible({ timeout: 30_000 });
  await staff.context().close();
});

// UI-030 fixed the bottom tab bar covering the booking page's action bar on phones.
test('phones can reach the booking actions under More (UI-030)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'phones only');
  await devSignIn(page, 'ben@example.test');
  await page.goto('/app/bookings/bkg_tv');
  await openAction(page, 'Report a safety concern');
  // The sheets' code loads on first open (speed on a phone): the sheet still opens, in its open state, with focus inside.
  const sheet = page.getByRole('dialog').or(page.getByRole('alertdialog')).filter({ visible: true }).first();
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await expect.poll(() => sheet.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(page.getByRole('link', { name: /Call 911/ })).toBeVisible();
});
