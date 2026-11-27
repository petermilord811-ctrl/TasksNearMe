import { expect, test } from '@playwright/test';
import { moveClock, resetClock } from './support/clock';

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
    // The card's button, and on phones also the one that stays in reach at the bottom (audit L19): both to the request.
    const requests = page.getByRole('link', { name: 'Request Sam K.' });
    await expect(requests.first()).toHaveAttribute('href', '/app/helpers/sam-k/request');
    for (const request of await requests.all()) await expect(request).toHaveAttribute('href', '/app/helpers/sam-k/request');
    // First name and last initial only: never the last name or contact details.
    const html = await page.content();
    for (const secret of ['Kim', 'sam@example.test', '+15125550202']) expect(html).not.toContain(secret);
  });

  test('the account age reads like Reddit’s, with a cake on the anniversary of the day they joined', async ({ page }) => {
    // Sam joined on May 20, 2024 (db/seeds/data/people.ts): "2 y" or more, with the day as its tip.
    await page.goto('/helpers/sam-k');
    const age = page.locator('div[title$="Joined May 20, 2024"]').filter({ hasText: 'Account age' });
    // What it shows ("2 y"); screen readers hear "2 years".
    await expect(age.locator('dd > [aria-hidden="true"]')).toHaveText(/^\d+ y$/, { timeout: 30_000 });
    await expect(age.locator('dd > .sr-only')).toHaveText(/^\d+ years$/);
    // No cake on other days (the e2e may run on May 20 itself).
    if (!new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()).endsWith('-05-20')) await expect(page.getByRole('img', { name: 'Cake day' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Details' })).toContainText('May 20, 2024');

    // His next anniversary, at noon in Austin: his cake day.
    const now = Date.now();
    const year = new Date(now).getUTCFullYear();
    const anniversary = [year, year + 1].map((y) => Date.UTC(y, 4, 20, 17)).find((at) => at > now)!;
    await moveClock(page, anniversary - now);
    try {
      await page.goto('/helpers/sam-k');
      await expect(page.getByRole('img', { name: 'Cake day' })).toBeVisible({ timeout: 30_000 });
      await expect(age).toHaveAttribute('title', /^Cake day today: \d+ years on TasksNearMe · Joined May 20, 2024$/);
    } finally {
      await resetClock(page);
    }
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
