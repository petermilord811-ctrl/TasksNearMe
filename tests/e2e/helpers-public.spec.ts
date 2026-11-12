import { expect, test } from '@playwright/test';

/** Public helper profiles, wired to the seeded helpers, reviews, and work samples. */
test.describe('helper profiles', () => {
  test('a featured helper opens to a full profile with reviews and work samples', async ({ page }) => {
    // Category pages list their top helpers (the landing page shows helpers only as decoration on wide screens).
    await page.goto('/austin/furniture-assembly');
    await page.getByRole('link', { name: 'Sam K.' }).first().click();
    await expect(page).toHaveURL(/\/helpers\/sam-k$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sam K.' })).toBeVisible();
    await expect(page.getByText('Sam had the bookshelf up in under an hour')).toBeVisible();
    await expect(page.getByRole('img', { name: 'An assembled desk with a monitor and drawer unit' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request Sam K.' })).toHaveAttribute('href', '/app/helpers/sam-k/request');
    // First name and last initial only: never the last name or contact details.
    const html = await page.content();
    for (const secret of ['Kim', 'sam@example.test', '+15125550202']) expect(html).not.toContain(secret);
  });

  test('a new founding helper shows no reviews yet', async ({ page }) => {
    await page.goto('/helpers/jordan-t');
    await expect(page.getByRole('heading', { level: 1, name: 'Jordan T.' })).toBeVisible();
    await expect(page.getByText('No reviews yet')).toBeVisible();
  });

  test('unknown profiles are not found', async ({ page }) => {
    // Draft profiles are checked in helper-onboarding.spec.ts, before Priya is onboarded.
    expect((await page.goto('/helpers/nobody'))?.status()).toBe(404);
  });
});
