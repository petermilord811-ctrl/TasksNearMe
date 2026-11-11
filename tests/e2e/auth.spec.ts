import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

test.describe('sign-in and page shells', () => {
  test('signed-out visitors are sent to sign-in from the app', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp$/);
  });

  test('a member signs in and lands in the app shell', async ({ page }) => {
    await devSignIn(page, 'maya@example.test');
    await expect(page).toHaveURL(/\/app$/);
    // The home greets by first name (UI-023).
    await expect(page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening), Maya/ })).toBeVisible();
    await expect(page.getByText('MR', { exact: true }).first()).toBeVisible();
  });

  test('members never see the admin area', async ({ page }) => {
    await devSignIn(page, 'maya@example.test');
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/admin');
    await expect(page.getByText(/could not be found/i)).toBeVisible();
    await expect(page.getByText('Staff area')).toHaveCount(0);
  });

  test('staff pass the two-step check, then see the admin shell', async ({ page }) => {
    await devSignIn(page, 'alex@example.test', { landing: /\/admin\/verify$/ });
    await page.getByLabel('Code').fill('123456');
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Queues' })).toBeVisible();
  });
});
