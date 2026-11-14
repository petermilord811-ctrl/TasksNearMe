import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Saved searches (completion plan 7.10): from a filtered board, "Save this search" names it after its filters,
 * saves it with a morning digest, lists it with its open count, changes the alerts, and opens the same view again.
 */
test('a board view is saved with alerts, listed, changed and opened again', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  await devSignIn(page, 'ana@example.test');
  await page.goto('/austin/tasks?category=furniture-assembly&area=mueller');
  await page.getByRole('link', { name: 'Save this search' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Save this search' })).toBeVisible({ timeout: 30_000 });
  const form = page.getByRole('form', { name: 'Save this search' });
  await expect(form.getByText('Furniture assembly', { exact: true })).toBeVisible();
  await expect(form.getByText('Mueller', { exact: true })).toBeVisible();
  const name = `Desks in Mueller ${Date.now().toString(36)}`;
  await form.getByLabel('Name').fill(name);
  await form.getByRole('radio', { name: 'Morning digest' }).check();
  await form.getByRole('button', { name: 'Save search' }).click();

  await expect(page).toHaveURL(/\/app\/saved-searches$/, { timeout: 30_000 });
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card.getByRole('radio', { name: 'Morning digest' })).toHaveAttribute('aria-checked', 'true');
  await expect(card.getByText(/open tasks?$|No open tasks right now/)).toBeVisible();
  await card.getByRole('radio', { name: 'Off' }).click();
  await expect(card.getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });

  await card.getByRole('link', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/austin\/tasks\/furniture-assembly\?.*area=mueller/, { timeout: 30_000 });
});
