import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * T-20, address privacy: a helper who offered but isn't booked never gets the exact address (pages, the
 * public page and its meta tags); the booked helper sees it after confirmation; staff see it
 * only after giving a reason, and the access is in the audit log. On the seeded data: Maya's desk (offers
 * from Jordan, Sam and Lee) and Ben's TV (Jordan, confirmed).
 */

const DESK_SECRETS = ['1234 Example Lane', 'Apt 2B', 'Buzz 2B'];
const TV_ADDRESS = '88 Sample Street';

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test("a helper who offered but isn't booked never gets the address", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  test.setTimeout(150_000);
  await devSignIn(page, 'sam@example.test');
  for (const path of ['/app/find-work/tsk_desk', '/app/find-work', '/app/offers', '/app/notifications', '/app/messages']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    const html = await page.content();
    for (const secret of DESK_SECRETS) expect(html, `${path} shows ${secret}`).not.toContain(secret);
  }
  // The public page as a search engine or a link preview reads it: the HTML with its title and description
  // meta tags (the app has no JSON-LD).
  const response = await page.request.get('/tasks/assemble-a-desk-mueller-7f3k');
  expect(response.ok()).toBe(true);
  const publicHtml = await response.text();
  expect(publicHtml).toMatch(/<meta name="description" content="[^"]+"/);
  for (const secret of DESK_SECRETS) expect(publicHtml).not.toContain(secret);
});

test('the booked helper sees the address once the booking is confirmed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/bookings/bkg_tv');
  await expect(page.getByRole('heading', { level: 1, name: 'Mount a TV on the wall' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(TV_ADDRESS).first()).toBeVisible();
});

test('staff see the address only after giving a reason, and the access is logged', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'writes to the audit log; desktop only');
  test.setTimeout(180_000);
  const reason = `Checking the access notes for a support call (${Date.now().toString(36)}).`;
  await staffSignIn(page, 'alex@example.test');
  await page.goto('/admin/bookings/bkg_tv');
  await expect(page.getByRole('heading', { level: 1, name: 'Mount a TV on the wall' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(TV_ADDRESS)).toHaveCount(0);
  await page.getByRole('button', { name: 'Show the address' }).click();
  const dialog = page.getByRole('dialog', { name: 'Show the address' });
  await dialog.getByRole('textbox', { name: 'Reason for access' }).fill('Too short');
  await dialog.getByRole('button', { name: 'Log access and open' }).click();
  await expect(dialog.getByText('Give a reason of at least 10 characters.')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Reason for access' }).fill(reason);
  await dialog.getByRole('button', { name: 'Log access and open' }).click();
  await expect(page.getByText(TV_ADDRESS).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Access logged').first()).toBeVisible();

  // A support lead finds it in the audit log, with the reason.
  await staffSignIn(page, 'morgan@example.test');
  await page.goto('/admin/audit');
  await expect(page.getByText(reason).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('booking.view_address').first()).toBeVisible();
});
