import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/** Rewards for helpers (UI-028) on the seeded data: Jordan's phone, ID and background checks earned the welcome gift card. */

test("a verified helper's welcome gift card is on its way, with no booking behind it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/rewards');
  await expect(page.getByRole('heading', { level: 1, name: 'Rewards' })).toBeVisible();
  // Earned by the checks (2026-11-14): the page leads with it, and his founding badge's number.
  const gift = page.getByRole('region', { name: 'Your $50 gift card is yours' });
  await expect(gift).toBeVisible();
  await expect(gift.getByText('Founding helper #63')).toBeVisible();
  await expect(page.getByText('$50.00').first()).toBeVisible();
});

test('people who are not set up as helpers are pointed to helper setup', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'read-only; one project is enough');
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/rewards');
  await expect(page.getByRole('heading', { level: 1, name: 'Rewards' })).toBeVisible();
  await expect(page.locator('a[href^="/app/helper/onboarding"]').first()).toBeVisible();
});
