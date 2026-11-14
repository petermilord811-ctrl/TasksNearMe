import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Completion plan 6.5 on the dev data: the welcome gift card (every helper whose phone, ID and background checks
 * pass, 2026-11-14) and the verification steps on the first onboarding page, and the verification section of
 * the account page for a helper and a client. Read only.
 */

test('a new helper sees the welcome gift card and every verification step on the first page', async ({ page }) => {
  test.setTimeout(120_000);
  await devSignIn(page, 'priya@example.test');
  await page.goto('/app/helper/onboarding/profile');
  const card = page.getByRole('region', { name: 'Get verified, get $50' });
  await expect(card).toBeVisible({ timeout: 45_000 });
  await expect(card.getByRole('list', { name: 'The checks that earn it' }).getByRole('listitem')).toHaveCount(3);
  await expect(card.getByText(/spots? left/)).toHaveCount(0);
  await expect(card.getByText('One per person. Rewards never depend on reviews or ratings.')).toBeVisible();
  const checklist = page.getByRole('region', { name: 'Your verification' });
  await expect(checklist.getByText('ID check', { exact: true })).toBeVisible();
  await expect(checklist.getByText('Home address', { exact: true })).toBeVisible();
  // The profile form is still right below.
  await expect(page.getByRole('heading', { name: 'Introduce yourself' })).toBeVisible();
});

test('the account page shows a helper’s checks and a client’s phone', async ({ page }) => {
  test.setTimeout(120_000);
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/account');
  await expect(page.getByRole('heading', { name: 'Verification', exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Each check you've passed, and what's left before you can take tasks.")).toBeVisible();
  await expect(page.getByText('ID check', { exact: true })).toBeVisible();

  await page.context().clearCookies();
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/account');
  await expect(page.getByRole('heading', { name: 'Verification', exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Your verified phone, and any ID check our team asked for.')).toBeVisible();
});
