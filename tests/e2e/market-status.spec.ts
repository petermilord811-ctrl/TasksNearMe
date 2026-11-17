import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Completion plan 8.2 on the dev data, read only: the config page's Markets section lists each market (status, ZIP
 * prefixes, time zone, waiting helpers, waitlist). An admin opens a market's confirm step and closes it again without
 * changing anything: other specs rely on Austin's and Gainesville's statuses, and opening Gainesville would work once
 * dates follow each market's zone (plan 8.1). The status changes and the waitlist emails are DB tests
 * (tests/integration/admin-markets.test.ts, city-open.test.ts). A support agent reads the section, with no buttons.
 * Loading the real page is the point: a server screen hands the Server Action to the client dialog.
 */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('an admin sees every market and its confirm step, and closes it without changing anything', async ({ page }) => {
  test.setTimeout(150_000);
  await staffSignIn(page, 'riley@example.test');
  await page.goto('/admin/config');
  const section = page.getByRole('region', { name: 'Markets' });
  const austin = section.getByRole('listitem', { name: 'Austin, TX' });
  await expect(austin.getByText('786, 787')).toBeVisible({ timeout: 45_000 });
  await expect(austin.getByText('America/Chicago')).toBeVisible();
  // Gainesville's status follows plan 8.6 (paused until it opens), so only what doesn't change is checked.
  const gainesville = section.getByRole('listitem', { name: 'Gainesville, FL' });
  await expect(gainesville.getByText('326', { exact: true })).toBeVisible();
  await expect(gainesville.getByText('America/New_York')).toBeVisible();
  const status = (await austin.getByText(/^(Pre-launch|Live|Paused)$/).first().textContent()) ?? '';

  // Pause is offered whatever Austin's status: its confirm step asks for a reason, and Cancel changes nothing.
  await austin.getByRole('button', { name: 'Pause Austin' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Pause Austin?' });
  await expect(dialog.getByText(/^Austin closes for now/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Pause Austin' }).click();
  await expect(dialog.getByText('Write why, in at least 10 characters.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(austin.getByText(status, { exact: true })).toBeVisible();
});

test('a support agent reads the markets, with no buttons and nothing else of config', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await staffSignIn(page, 'alex@example.test');
  // Config is in every staff role's navigation now (phones keep it in the menu sheet).
  if (testInfo.project.name === 'app-desktop') await expect(page.getByRole('navigation', { name: 'Staff navigation' }).getByRole('link', { name: 'Config' })).toHaveAttribute('href', '/admin/config');
  await page.goto('/admin/config');
  await expect(page.getByRole('heading', { level: 1, name: 'Config' })).toBeVisible();
  const section = page.getByRole('region', { name: 'Markets' });
  await expect(section.getByText("Only admins can change a market's status.")).toBeVisible();
  await expect(section.getByRole('listitem', { name: 'Gainesville, FL' })).toBeVisible();
  await expect(section.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Market policy' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Outage switch' })).toHaveCount(0);
});
