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

  test('signed in, sign-in sends you on only within the site, however `next` is written (sweep 2026-11-18)', async ({ page }) => {
    await devSignIn(page, 'maya@example.test');
    const host = new URL(page.url()).host;
    // Dot segments the URL parser resolves into a protocol-relative "//evil.example" (fd84388).
    for (const next of ['/.//evil.example/x', '/%2e//evil.example', '/app/..//evil.example']) {
      await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
      await expect(page).toHaveURL(/\/app$/);
      expect(new URL(page.url()).host).toBe(host);
    }
  });

  test('members never see the admin area', async ({ page }) => {
    await devSignIn(page, 'maya@example.test');
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible();
    await expect(page.getByText('Staff area')).toHaveCount(0);
  });

  test('staff pass the two-step check, then see the admin shell', async ({ page }) => {
    await devSignIn(page, 'alex@example.test', { landing: /\/admin\/verify$/ });
    await page.getByLabel('Code').fill('123456');
    await page.getByRole('button', { name: 'Verify' }).click();
    // The admin home may compile on first use (as in admin.spec's staffSignIn).
    await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Queues' })).toBeVisible({ timeout: 30_000 });
  });
});
