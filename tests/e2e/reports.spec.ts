import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/** Report buttons on tasks, profiles and reviews (backlog B-059), on the seeded data. */

test('reporting from a public page asks visitors to sign in first', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await page.goto('/tasks/assemble-a-desk-mueller-7f3k');
  await page.getByRole('link', { name: 'Report this task' }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Freport%2Ftask%2Ftsk_desk/, { timeout: 30_000 });
});

test('a helper reports a profile from the public page and goes back to it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'opens a support case; desktop only');
  test.setTimeout(150_000);
  await devSignIn(page, 'lee@example.test');
  await page.goto('/helpers/sam-k');
  await page.getByRole('link', { name: 'Report this profile' }).click();
  await expect(page).toHaveURL(/\/app\/report\/helper\/sam-k$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Report a helper' })).toBeVisible();
  await page.getByRole('radio', { name: 'Something else' }).check();
  await page.getByRole('textbox', { name: 'Details' }).fill('The profile photo shows someone else entirely.');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Thanks. Support will review this.').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/helpers\/sam-k$/, { timeout: 30_000 });

  // Reviews have their own link.
  await expect(page.getByRole('link', { name: /^Report the review by / }).first()).toBeVisible();
});
