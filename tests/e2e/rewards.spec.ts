import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/** Rewards for helpers (UI-028) on the seeded data: Jordan's first paid booking earned the welcome reward. */

test("a founding helper's welcome reward is pending after a paid booking", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/rewards');
  await expect(page.getByRole('heading', { level: 1, name: 'Rewards' })).toBeVisible();
  await expect(page.getByText('$50.00').first()).toBeVisible();
  // The welcome reward goes to Jordan's earliest paid booking (one of the seeded ones).
  await expect(page.getByRole('link', { name: /Assemble a (bookcase|dresser)|Mount a TV on the wall/ }).first()).toHaveAttribute('href', /\/app\/bookings\/bkg_(bookcase|dresser|tv)$/);
});

test('people who are not set up as helpers are pointed to helper setup', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'read-only; one project is enough');
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/rewards');
  await expect(page.getByRole('heading', { level: 1, name: 'Rewards' })).toBeVisible();
  await expect(page.locator('a[href^="/app/helper/onboarding"]').first()).toBeVisible();
});
