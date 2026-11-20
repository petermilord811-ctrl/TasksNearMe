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

/** Sweep SS5: find work saves its own view (with the distance), and a saved search is renamed and its filters changed. */
test('find work saves its view, and the saved search is edited and opened again', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/find-work?category=furniture-assembly&distance=within_5_mi');
  await page.getByRole('link', { name: 'Save this search' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Save this search' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Back to find work' })).toBeVisible();
  const form = page.getByRole('form', { name: 'Save this search' });
  await expect(form.getByText('Within 5 miles', { exact: true })).toBeVisible();
  const name = `Desks near me ${Date.now().toString(36)}`;
  await form.getByLabel('Name').fill(name);
  await form.getByRole('button', { name: 'Save search' }).click();

  await expect(page).toHaveURL(/\/app\/saved-searches$/, { timeout: 30_000 });
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card.getByText('Find work', { exact: true })).toBeVisible();
  await card.getByRole('link', { name: `Edit ${name}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Edit saved search' })).toBeVisible({ timeout: 30_000 });
  // The form on screen (the page before can stay in the document, hidden, for Back).
  const edit = page.getByRole('form', { name: 'Edit saved search' });
  const renamed = `${name} again`;
  await edit.getByLabel('Name').fill(renamed);
  await edit.getByLabel('Category').selectOption('moving-help');
  await edit.getByLabel('Distance').selectOption('within_10_mi');
  await edit.getByText('Evening (after 5 pm)', { exact: true }).click();
  await edit.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(/\/app\/saved-searches$/, { timeout: 30_000 });
  const edited = page.getByRole('listitem').filter({ hasText: renamed });
  await expect(edited.getByText('Moving help', { exact: true })).toBeVisible();
  await expect(edited.getByText('Within 10 miles', { exact: true })).toBeVisible();
  await expect(edited.getByText('Evening (after 5 pm)', { exact: true })).toBeVisible();
  await edited.getByRole('link', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/app\/find-work\?.*category=moving-help.*distance=within_10_mi/, { timeout: 30_000 });

  // Leave the shared data as it was.
  await page.goto('/app/saved-searches');
  await page.getByRole('listitem').filter({ hasText: renamed }).getByRole('button', { name: `Delete ${renamed}` }).click();
  await expect(page.getByRole('listitem').filter({ hasText: renamed })).toHaveCount(0, { timeout: 15_000 });
});
