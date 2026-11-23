import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * A problem report end to end on the seeded dispute (Ana's dresser with Jordan, $60 charged $66): Ana sees it on
 * her booking page; support settles it at $45 from the case page (a server preview first); Ana sees the
 * decision and her $15.75 refund (blueprint 04 §6).
 */

async function staffSignIn(page: Page) {
  await devSignIn(page, 'alex@example.test', { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('a problem report: the client sees it, support settles it, the client sees the refund', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);

  await devSignIn(page, 'ana@example.test');
  await page.goto('/app/bookings/bkg_dresser');
  await expect(page.getByRole('heading', { name: 'Problem reported' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View the case' })).toHaveAttribute('href', '/app/support/case_seed_dresser');

  await staffSignIn(page);
  await page.goto('/admin/cases/case_seed_dresser');
  await page.getByRole('button', { name: 'Resolve' }).first().click();
  const dialog = page.getByRole('alertdialog', { name: 'Resolve case' });
  await dialog.getByRole('radio', { name: 'Settle at a lower price' }).check();
  await dialog.getByLabel('New task price (USD)').fill('45');
  await dialog.getByLabel('Resolution summary').fill('Settled at $45 because two drawers still stick.');
  // The server's preview: $15.75 back to Ana, $45.00 to Jordan.
  await expect(dialog.getByText('$15.75').first()).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByText('$45.00').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Save resolution' }).click();
  await expect(page.getByText('Resolution saved.').first()).toBeVisible({ timeout: 30_000 });

  await devSignIn(page, 'ana@example.test');
  await page.goto('/app/bookings/bkg_dresser');
  await expect(page.getByRole('heading', { name: 'Problem resolved' })).toBeVisible();
  await expect(page.getByText('$15.75 was refunded to your card')).toBeVisible();
});
