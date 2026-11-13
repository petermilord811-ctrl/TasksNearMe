import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Completion plan 6.4 on the dev data (the seed stores badges from its bookings): Jordan is founding helper #63,
 * Sam finished Maya's wardrobe (his first task, her first booking). Read only.
 */

test('helpers show their badges on the public profile', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/helpers/jordan-t');
  const jordan = page.getByRole('list', { name: 'Badges' });
  await expect(jordan.getByText('Founding helper')).toBeVisible({ timeout: 45_000 });
  await expect(jordan.getByText(/#63/)).toBeVisible();

  await page.goto('/helpers/sam-k');
  await expect(page.getByRole('list', { name: 'Badges' }).getByText('Tasks done')).toBeVisible({ timeout: 45_000 });
});

test('a client sees their badges and what’s next on the account page', async ({ page }) => {
  test.setTimeout(120_000);
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/account');
  await expect(page.getByRole('heading', { name: 'Badges', exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Good neighbor')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: /for the next level/ }).first()).toBeVisible();
});
