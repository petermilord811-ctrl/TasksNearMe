import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * B-067 on the dev data: finance reads the market metrics with money (reward spend, contribution) and changes
 * the period; a support agent reads the same page without money figures.
 */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('finance reads the market metrics, reward spend included, and changes the period', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const desktop = testInfo.project.name === 'app-desktop';
  await staffSignIn(page, 'casey@example.test');
  // On phones the staff navigation sits in a menu; the desktop sidebar has the link.
  if (desktop) await page.getByRole('navigation', { name: 'Staff navigation' }).getByRole('link', { name: 'Metrics' }).click();
  else await page.goto('/admin/metrics');
  await expect(page).toHaveURL(/\/admin\/metrics$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Market metrics' })).toBeVisible();
  await expect(page.getByRole('link', { name: '30 days' })).toHaveAttribute('aria-current', 'page');

  const targets = page.getByRole('region', { name: 'Launch targets' });
  await expect(targets.getByRole('heading', { name: 'Tasks with an offer within 2 h' })).toBeVisible();
  await expect(targets.getByRole('heading', { name: 'Contribution per held booking, before rewards' })).toBeVisible();
  await expect(targets.getByText('Money figures are shown to finance and admins.')).toHaveCount(0);
  await expect(targets.getByRole('heading', { name: 'Address exposure incidents' })).toBeVisible();

  await expect(page.getByRole('region', { name: 'From posting to booking again' }).getByText('Got an offer')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Day by day' }).getByText('Rewards delivered', { exact: true }).first()).toBeVisible();
  const rewards = page.getByRole('region', { name: 'Reward spend' });
  await expect(rewards.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await expect(rewards.getByText(/Each helper can earn up to \$75\.00 a calendar month/)).toBeVisible();

  await page.getByRole('link', { name: '7 days' }).click();
  await expect(page).toHaveURL(/\/admin\/metrics\?days=7$/, { timeout: 30_000 });
  await expect(page.getByRole('link', { name: '7 days' })).toHaveAttribute('aria-current', 'page');
  // Every day of the week, newest first.
  await page.getByText('Show every day').click();
  if (desktop) await expect(page.getByRole('table', { name: 'Daily figures, newest first' }).getByRole('row')).toHaveCount(8);
});

test('a support agent reads the metrics without money figures', async ({ page }) => {
  test.setTimeout(120_000);
  await staffSignIn(page, 'alex@example.test');
  await page.goto('/admin/metrics?days=90');
  await expect(page.getByRole('heading', { level: 1, name: 'Market metrics' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: '90 days' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Money figures are shown to finance and admins.')).toBeVisible();
  await expect(page.getByText('Reward spend is shown to finance and admins.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Reward spend' }).getByRole('heading', { name: 'Welcome' })).toHaveCount(0);
  await expect(page.getByText('Rewards delivered', { exact: true })).toHaveCount(0);
});
