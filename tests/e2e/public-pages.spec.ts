import { expect, test } from '@playwright/test';

/** Public marketing pages, wired to the seeded Austin market, people, and launch policy. */
test.describe('public pages', () => {
  test('home: categories, verified helpers, and coverage from the database', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/everyday help from people near you in Austin/);
    await expect(page.getByRole('heading', { level: 1, name: 'A little help. A lighter to-do list.' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Furniture assembly/ }).first()).toBeVisible();
    // Featured helpers are active helpers only: Priya's profile is still a draft.
    await expect(page.getByText('Sam K.').first()).toBeVisible();
    await expect(page.getByText('Priya')).toHaveCount(0);
    await expect(page.getByText('Travis Heights').first()).toBeVisible();
  });

  test('market and category pages', async ({ page }) => {
    await page.goto('/austin');
    await expect(page.getByRole('heading', { level: 1, name: 'Everyday help in Austin' })).toBeVisible();

    await page.goto('/austin/furniture-assembly');
    await expect(page).toHaveTitle('Furniture assembly in Austin · TasksNearMe');
    await expect(page.getByRole('heading', { level: 1, name: 'Furniture assembly in Austin' })).toBeVisible();
  });

  test('pricing: every number comes from the fee engine and the published policy', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const amount of ['$66.00', '$54.00', '$28.00', '$154.00', '$134.75', '$19.25', '$86.00', '$74.00']) {
      await expect(page.getByText(amount, { exact: true }).first()).toBeVisible();
    }
  });

  test('become a helper: reward cards follow the flags and the founding cohort', async ({ page }) => {
    await page.goto('/become-a-helper');
    await expect(page.getByRole('heading', { level: 1, name: 'Put your everyday skills to work nearby' })).toBeVisible();
    // One founding number is taken in the seed (Jordan, #63).
    await expect(page.getByText('99 spots left')).toBeVisible();
    await expect(page.getByText('$54.00').first()).toBeVisible();
  });

  test('how it works and trust and safety', async ({ page }) => {
    await page.goto('/how-it-works');
    await expect(page.getByRole('heading', { level: 1, name: 'A clear plan, from start to finish' })).toBeVisible();
    await page.goto('/trust-and-safety');
    await expect(page.getByRole('heading', { level: 1, name: 'Trust starts with clear information' })).toBeVisible();
  });

  test('unknown markets and categories are not found', async ({ page }) => {
    await page.goto('/nowhere');
    await expect(page.getByText(/could not be found/i)).toBeVisible();
    await page.goto('/austin/underwater-welding');
    await expect(page.getByText(/could not be found/i)).toBeVisible();
  });
});
