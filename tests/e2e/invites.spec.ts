import { expect, test } from '@playwright/test';
import { clearOpenInvites } from './support/scenarios';
import { devSignIn } from './support/sign-in';

/**
 * Direct invites (UI-025) on the seeded open task "Assemble two nightstands" (Maya's, no offers): Maya asks
 * Jordan to do it at his listed $45 ($49.50 held on her saved card); Jordan accepts from his offers, the hold
 * is captured, and the booking is confirmed (blueprint 02 J3, 04 §4).
 */

test('a client requests a helper, who accepts: the booking is confirmed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  // A retry starts clean: an earlier attempt may have sent the invite before failing.
  await clearOpenInvites('tsk_nightstands');

  await devSignIn(page, 'maya@example.test');
  await page.goto('/helpers/jordan-t');
  await expect(page.getByRole('link', { name: 'Request Jordan T.' }).first()).toHaveAttribute('href', '/app/helpers/jordan-t/request');
  await page.goto('/app/helpers/jordan-t/request');
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Jordan T. to help' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('radio', { name: /Assemble two nightstands/ }).click();
  // Jordan's listed $45 plus the 10% fee, from the server's quote.
  await expect(page.getByText('$49.50').first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('checkbox', { name: /I agree to the/ }).click();
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_nightstands$/, { timeout: 30_000 });
  await expect(page.getByText('Request for Jordan T.').first()).toBeVisible();

  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/offers');
  await page.getByRole('button', { name: 'View invite for Assemble two nightstands' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Request from Maya R.').first()).toBeVisible();
  await sheet.getByRole('button', { name: 'Accept', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Assemble two nightstands' })).toBeVisible();
});

test("helpers can't request their own help; an unknown invite link still opens their offers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'jordan@example.test');
  // A helper can't request their own help.
  await page.goto('/app/helpers/jordan-t/request');
  await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible({ timeout: 30_000 });
  await page.goto('/app/offers?invite=inv_unknown');
  await expect(page.getByRole('heading', { level: 1, name: 'My offers' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Invites' })).toBeVisible();
});
