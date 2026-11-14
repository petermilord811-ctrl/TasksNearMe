import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Completion plan 5.14 on the dev data, read only: a support lead sees the Account section on a person page and
 * the staff cancel on a booking page, and each opens its reason dialog (closed again without acting). Loading the
 * real pages is the point: they're server components handing Server Actions to the client dialog.
 */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('a support lead finds the account and booking controls, each behind a reason dialog', async ({ page }) => {
  test.setTimeout(150_000);
  await staffSignIn(page, 'morgan@example.test');

  await page.goto('/admin/users/usr_priya');
  const account = page.getByRole('region', { name: 'Account' });
  await expect(account.getByText('Active', { exact: true })).toBeVisible({ timeout: 45_000 });
  await account.getByRole('button', { name: 'Suspend account' }).click();
  const suspend = page.getByRole('alertdialog', { name: 'Suspend this account' });
  await expect(suspend.getByLabel('Reason')).toBeVisible();
  await suspend.getByRole('button', { name: 'Cancel' }).click();
  await expect(suspend).toBeHidden();

  await page.goto('/admin/bookings/bkg_tv');
  const cancel = page.getByRole('region', { name: 'Cancel this booking' });
  await expect(cancel.getByText(/the client gets \$\d+\.\d{2} back/)).toBeVisible({ timeout: 45_000 });
  await cancel.getByRole('button', { name: 'Cancel booking' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Cancel this booking' });
  await expect(dialog.getByLabel('Reason')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
});
