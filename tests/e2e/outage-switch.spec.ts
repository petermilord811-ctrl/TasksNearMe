import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Completion plan 5.15 on the dev data, read only: an admin finds the outage switch on the config page (the first
 * city's, Gainesville's, bookings open) and its reason dialog, closed again without pausing (a pause would hold
 * other specs' bookings while it ran; tests/integration/outage.test.ts pauses and reopens). Loading the real page is the
 * point: a server screen hands the Server Action to the client dialog. A client's pages carry no notice.
 */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('an admin finds the outage switch with bookings open, behind a reason dialog', async ({ page }) => {
  test.setTimeout(150_000);
  await staffSignIn(page, 'riley@example.test');
  await page.goto('/admin/config');
  const outage = page.getByRole('region', { name: 'Outage switch' });
  await expect(outage.getByText('Bookings open', { exact: true })).toBeVisible({ timeout: 45_000 });
  await outage.getByRole('button', { name: 'Pause bookings' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Pause new bookings in Gainesville?' });
  await expect(dialog.getByLabel('Reason')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(outage.getByText('Bookings open', { exact: true })).toBeVisible();
});

test('a client sees no paused notice while bookings are open', async ({ page }) => {
  test.setTimeout(120_000);
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/bookings');
  await expect(page.getByRole('main')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('region', { name: 'New bookings are paused for now' })).toHaveCount(0);
});
