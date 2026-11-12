import { expect, test, type Page } from '@playwright/test';
import { confirmedBooking } from './support/scenarios';
import { devSignIn } from './support/sign-in';

/**
 * T-28, staff limits: an agent's $120 refund (their limit is $100) waits for a lead, who approves it with a
 * note; the refund then shows on the booking. The booking is written for this test (a $150 job).
 */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('an agent asks for a refund above their limit and a lead approves it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(240_000);
  const scenario = await confirmedBooking('refund', 15_000);

  await staffSignIn(page, 'alex@example.test');
  await page.goto(`/admin/bookings/${scenario.bookingId}`);
  await expect(page.getByRole('heading', { level: 1, name: scenario.title })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Refund' }).first().click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('Refund amount (USD)').fill('120');
  await dialog.getByLabel('Refund reason').selectOption('goodwill');
  await dialog.getByLabel('Refund note').fill('The helper left two hours early.');
  await dialog.getByRole('button', { name: 'Ask for approval' }).click();
  await expect(page.getByText('Sent for approval. A lead or finance will review it.').first()).toBeVisible({ timeout: 30_000 });
  const requests = page.getByRole('region', { name: 'Refund requests' });
  await expect(requests.getByText('Waiting for approval')).toBeVisible();
  await expect(requests.getByRole('button', { name: /Approve/ })).toHaveCount(0);

  await staffSignIn(page, 'morgan@example.test');
  await page.goto(`/admin/bookings/${scenario.bookingId}`);
  await page.getByRole('region', { name: 'Refund requests' }).getByRole('button', { name: 'Approve the $120.00 refund' }).click();
  const decide = page.getByRole('alertdialog', { name: 'Approve a $120.00 refund' });
  await decide.getByRole('textbox', { name: 'Note' }).fill('Checked the timeline: the helper left early.');
  await decide.getByRole('button', { name: 'Approve and refund' }).click();
  await expect(page.getByRole('region', { name: 'Refund requests' }).getByText('Approved', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Refund history' }).getByText('$120.00')).toBeVisible();
});
