import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/** Completion plan 5.11 on the dev data: finance opens the webhook inbox from the staff navigation; an agent can't. */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('finance reads the webhook inbox; a support agent can’t open it', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await staffSignIn(page, 'casey@example.test');
  if (testInfo.project.name === 'app-desktop') await page.getByRole('navigation', { name: 'Staff navigation' }).getByRole('link', { name: 'Webhooks' }).click();
  else await page.goto('/admin/webhooks');
  await expect(page.getByRole('heading', { level: 1, name: 'Webhooks' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'The last 24 hours' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Failing events' })).toBeVisible();

  await page.context().clearCookies();
  await staffSignIn(page, 'alex@example.test');
  // The page streams, so a refusal shows the not-found page rather than a 404 status.
  await page.goto('/admin/webhooks');
  await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Webhooks' })).toHaveCount(0);
});
