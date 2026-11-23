import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Booking an offer (UI-010) with the development payment stand-in. Chris books Jordan's hourly offer on
 * the seeded moving task; the seed clears its bookings before each run.
 */

test('a poster books an hourly offer after a declined card and a bank check', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  await devSignIn(page, 'chris@example.test');

  await page.goto('/app/tasks/tsk_moving/offers/off_moving_jordan');
  await page.getByRole('button', { name: 'Book helper' }).click();
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_moving\/offers\/off_moving_jordan\/confirm$/, { timeout: 30_000 });
  // A dialog over the offer (src/app/[locale]/@modal); paying in it opens the new booking.
  await expect(page.getByRole('dialog', { name: 'Confirm and pay' }).getByRole('heading', { level: 1, name: 'Confirm and pay' })).toBeVisible();
  // Paid upfront and held (the seeded offer): $35/h with a 4-hour cap, $140 + the $7.00 hold fee today.
  const pay = page.getByRole('button', { name: 'Book and pay $147.00' });
  await expect(pay).toBeVisible();

  // No saved cards, so the development test card is selected. First, a declined card.
  await page.getByRole('radio', { name: 'Declined' }).click();
  await page.getByRole('checkbox', { name: /I agree to the/ }).click();
  await pay.click();
  await expect(page.getByText("Your payment didn't go through.").first()).toBeVisible();

  // Then a card that asks for the bank check, approved.
  await page.getByRole('radio', { name: 'Bank verification' }).click();
  await pay.click();
  const bank = page.getByRole('dialog').or(page.getByRole('alertdialog'));
  await expect(bank.getByText('Your bank wants to confirm it’s you')).toBeVisible();
  await bank.getByRole('button', { name: 'Approve' }).click();

  // Booked: the booking page, with the charge.
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Help loading a moving truck' })).toBeVisible();
  await expect(page.getByText('$147.00').first()).toBeVisible();
  // The confirmation page now sends Chris to the booking.
  await page.goto('/app/tasks/tsk_moving/offers/off_moving_jordan/confirm');
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_/, { timeout: 30_000 });
});

test("other people can't open someone's confirmation page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks/tsk_moving/offers/off_moving_jordan/confirm');
  await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Book and pay/ })).toHaveCount(0);
});
