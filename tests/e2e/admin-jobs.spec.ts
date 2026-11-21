import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * When things break (J-O13) on the e2e build, whose server runs the job runner: finance opens /admin/jobs from the staff
 * navigation and reads what the runner did since this server started; a support agent can't open it.
 */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('finance reads what the job runner did on this server; a support agent can’t open it', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await staffSignIn(page, 'casey@example.test');
  if (testInfo.project.name === 'app-desktop') await page.getByRole('navigation', { name: 'Staff navigation' }).getByRole('link', { name: 'Jobs' }).click();
  else await page.goto('/admin/jobs');
  await expect(page.getByRole('heading', { level: 1, name: 'Background jobs' })).toBeVisible({ timeout: 30_000 });
  // Since this server started: a deploy or restart starts the history over.
  await expect(page.getByText(/^Since .*, when this server started\./)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Runner' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Jobs' }).getByText('offers.expire', { exact: true })).toBeVisible();

  await page.context().clearCookies();
  await staffSignIn(page, 'alex@example.test');
  // The page streams, so a refusal shows the not-found page rather than a 404 status.
  await page.goto('/admin/jobs');
  await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Background jobs' })).toHaveCount(0);
});
