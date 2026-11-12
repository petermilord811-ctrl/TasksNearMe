import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Rebooking (UI-032, blueprint 02 J8) on the seeded completed booking "Assemble a wardrobe" (Maya's, done
 * with Sam three weeks ago for $90): Sam proposes the same task again from My clients; Maya sees it on her
 * home, accepts and pays with her saved card ($99.00), and it's booked.
 */

test('a helper proposes a past client’s task again; the client pays and it is booked', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(240_000);

  await devSignIn(page, 'sam@example.test');
  await page.goto('/app/clients');
  await expect(page.getByRole('heading', { level: 1, name: 'My clients' })).toBeVisible({ timeout: 30_000 });
  const row = page.getByRole('listitem').filter({ hasText: 'Maya R.' });
  await expect(row.getByText('Assemble a wardrobe').first()).toBeVisible();
  await row.getByRole('link', { name: 'Propose a booking' }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_wardrobe\/rebook$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Propose a booking' })).toBeVisible();

  // Tomorrow at 10:00 in Austin: within the 14 days, and more than 3 hours away.
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  await page.getByLabel('Date').fill(tomorrow);
  await page.getByLabel('Start time').fill('10:00');
  // The last price ($90) is filled in; the server's quote shows what Sam earns after the 10% fee.
  await expect(page.getByText('$81.00').first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Send proposal' }).click();
  await expect(page).toHaveURL(/\/app\/clients$/, { timeout: 30_000 });
  await expect(page.getByText('Waiting for your client').first()).toBeVisible();

  await devSignIn(page, 'maya@example.test');
  await page.getByRole('link', { name: /Sam K\. proposed a booking: Assemble a wardrobe/ }).click();
  await expect(page).toHaveURL(/\/app\/proposals\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Sam K. proposed a booking' })).toBeVisible();
  // $90 plus the 10% client fee.
  await expect(page.getByText('$99.00').first()).toBeVisible();
  await page.getByRole('checkbox', { name: /I agree to the/ }).click();
  await page.getByRole('button', { name: 'Accept and pay' }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Assemble a wardrobe' })).toBeVisible();
});

test('only the helper of a completed booking can propose it again', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/bookings/bkg_wardrobe/rebook');
  await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible();
  await page.goto('/app/clients');
  await expect(page.getByRole('heading', { level: 1, name: 'My clients' })).toBeVisible();
  await expect(page.getByText('Maya R.')).toHaveCount(0);
});
