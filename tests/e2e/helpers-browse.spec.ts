import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/** Find helpers (`/app/helpers`) on the seeded Austin helpers. */

test('a client finds helpers by category, saves one, and finds them in saved helpers', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  await devSignIn(page, 'chris@example.test');
  await page.goto('/app/helpers');
  await expect(page.getByRole('heading', { level: 1, name: 'Find helpers' })).toBeVisible({ timeout: 30_000 });
  const filters = page.getByRole('form', { name: 'Filter helpers' });
  await filters.getByLabel('Category').selectOption('computer-help');
  await filters.getByRole('button', { name: 'Show helpers' }).click();
  await expect(page).toHaveURL(/\/app\/helpers\?.*category=computer-help/, { timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Ask Lee M.' })).toHaveAttribute('href', '/app/helpers/lee-m/request');
  await expect(page.getByRole('link', { name: 'Ask Sam K.' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Save Lee M.' }).click();
  await expect(page.getByText('Lee M. is in your saved helpers.')).toBeVisible({ timeout: 30_000 });
  await page.goto('/app/saved');
  await expect(page.getByText('Lee M.').first()).toBeVisible();
});

test('find helpers is a signed-in page in the client navigation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await page.goto('/app/helpers');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fhelpers/, { timeout: 30_000 });
});
