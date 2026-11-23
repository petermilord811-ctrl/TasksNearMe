import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/** Money pages (UI-016), read-only, on the seeded bookings: Ben paid $84.00 for the TV; Jordan helps. */

test('the client sees the receipt for the booking, and only theirs', async ({ page }) => {
  await devSignIn(page, 'ben@example.test');
  await page.goto('/app/payments');
  await expect(page.getByRole('heading', { level: 1, name: 'Payments' })).toBeVisible();
  await page.getByRole('link', { name: 'Anchor a tall bookshelf to the wall' }).first().click();
  await expect(page).toHaveURL(/\/app\/payments\/bkg_tv$/);
  // Over the payments list (2026-11-23), whose own rows carry the amount too.
  await expect(page.getByRole('dialog', { name: 'Receipt' }).getByText('$84.00').first()).toBeVisible({ timeout: 30_000 });

  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/payments/bkg_tv');
  await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible();
});

test('the helper sees earnings and the payout account', async ({ page }) => {
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/earnings');
  await expect(page.getByRole('heading', { level: 1, name: 'Earnings' })).toBeVisible();
  await expect(page.getByText(/6789/).first()).toBeVisible();
});
