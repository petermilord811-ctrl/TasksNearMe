import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Change requests (UI-027) on the seeded TV booking (Ben ↔ Jordan, $80 charged $88). The client proposes a
 * higher price and sees the server's quote; the helper declines, so the terms other specs read stay as
 * they are (accepting and paying are covered by tests/integration/changes.test.ts).
 */

test('the client proposes a change with a quote, and the helper declines it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  await devSignIn(page, 'ben@example.test');
  await page.goto('/app/bookings/bkg_tv');
  await page.getByRole('link', { name: 'Propose a change' }).first().click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_tv\/changes\/new$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Propose a change' })).toBeVisible();
  await page.getByLabel('Task price (USD)').fill('100');
  await page.getByLabel('Message').fill('Could you also hang the soundbar under the TV?');
  // $80 → $100: the client's total goes from $88.00 to $110.00.
  await expect(page.getByText('$22.00').first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Send change' }).click();
  // The form asks first.
  await page.getByRole('alertdialog', { name: 'Send this change?' }).getByRole('button', { name: /Send/ }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_tv\/changes\/chg_/, { timeout: 30_000 });
  const changeUrl = page.url();

  await devSignIn(page, 'jordan@example.test');
  await page.goto(changeUrl);
  await page.getByRole('button', { name: 'Decline change' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /Decline/ }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_tv$/, { timeout: 30_000 });
});
