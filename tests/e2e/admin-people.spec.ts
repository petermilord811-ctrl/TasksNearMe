import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Reward reviews and people (UI-020): a lead approves Sam's seeded welcome reward (in review); an agent
 * finds Sam without the suspend action, which trust and safety has.
 */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('a lead approves a reward in review, with a note', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  await staffSignIn(page, 'morgan@example.test');
  await page.goto('/admin/rewards');
  await expect(page.getByRole('heading', { level: 1, name: 'Rewards' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Sam K.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).first().click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('Decision note').fill('No links between the two accounts.');
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Reward decision saved.').first()).toBeVisible({ timeout: 30_000 });
});

test('people: an agent finds a helper without the suspend action; trust and safety has it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  test.setTimeout(150_000);
  await staffSignIn(page, 'alex@example.test');
  await page.goto('/admin/users?q=sam');
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: /Sam K\./ }).first().click();
  await expect(page).toHaveURL(/\/admin\/users\/usr_sam$/, { timeout: 30_000 });
  await expect(page.getByText('Helper status').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suspend helper' })).toHaveCount(0);

  await staffSignIn(page, 'taylor@example.test');
  await page.goto('/admin/users/usr_sam');
  await expect(page.getByRole('button', { name: 'Suspend helper' })).toBeVisible({ timeout: 30_000 });
});
