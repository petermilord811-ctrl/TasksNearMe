import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * The bookings list and the booking page (UI-011), read-only, on the seeded booking: Ben's TV with
 * Jordan ($80; $88.00 charged; Jordan earns $72.00), in a few days.
 */

test('the client finds the booking with their address and the charge', async ({ page }) => {
  await devSignIn(page, 'ben@example.test');
  await page.goto('/app/bookings');
  await expect(page.getByRole('heading', { level: 1, name: 'Bookings' })).toBeVisible();
  await page.getByRole('link', { name: 'Anchor a tall bookshelf to the wall' }).first().click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_tv$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Anchor a tall bookshelf to the wall' })).toBeVisible();
  await expect(page.getByText('88 Sample Street').first()).toBeVisible();
  await expect(page.getByText('$88.00').first()).toBeVisible();
});

test('the helper sees the address and earnings; check-in opens on the day', async ({ page }) => {
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/bookings/bkg_tv');
  await expect(page.getByRole('heading', { level: 1, name: 'Anchor a tall bookshelf to the wall' })).toBeVisible();
  await expect(page.getByText('88 Sample Street').first()).toBeVisible();
  await expect(page.getByText('$72.00').first()).toBeVisible();
  await expect(page.getByRole('button', { name: "I'm on my way" })).toBeDisabled();

  const calendar = await page.request.get('/app/bookings/bkg_tv/calendar.ics');
  expect(calendar.status()).toBe(200);
  expect(calendar.headers()['content-type']).toContain('text/calendar');
  const ics = await calendar.text();
  expect(ics).toContain('SUMMARY:TasksNearMe: Anchor a tall bookshelf to the wall');
  expect(ics).not.toContain('88 Sample Street');
});

test('other people get not found', async ({ page }) => {
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/bookings/bkg_tv');
  await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible();
  expect(await page.content()).not.toContain('88 Sample Street');
  expect((await page.request.get('/app/bookings/bkg_tv/calendar.ics')).status()).toBe(404);
});
