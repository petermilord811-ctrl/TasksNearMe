import { expect, test, type Page } from '@playwright/test';

/**
 * Booking an offer (UI-010) with the development payment stand-in. Chris books Jordan's hourly offer on
 * the seeded moving task; the seed clears its bookings before each run.
 */

async function devSignIn(page: Page, email: string) {
  await page.goto('/dev/sign-in');
  await page.locator('form', { has: page.locator(`input[name="email"][value="${email}"]`) }).getByRole('button').click();
  await expect(page).toHaveURL(/\/app$/);
}

test('a poster books an hourly offer after a declined card and a bank check', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  await devSignIn(page, 'chris@example.test');

  await page.goto('/app/tasks/tsk_moving/offers/off_moving_jordan');
  await page.getByRole('button', { name: 'Book helper' }).click();
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_moving\/offers\/off_moving_jordan\/confirm$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Confirm and pay' })).toBeVisible();
  // $35/h with a 4-hour cap: $140 + $14.00 today.
  const pay = page.getByRole('button', { name: 'Book and pay $154.00' });
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

  // Booked: the booking link lands on the task page for now (the booking page arrives with UI-011).
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_moving$/, { timeout: 30_000 });
  await page.goto('/app/tasks/tsk_moving/offers/off_moving_jordan/confirm');
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_moving$/, { timeout: 30_000 });
});

test("other people can't open someone's confirmation page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks/tsk_moving/offers/off_moving_jordan/confirm');
  await expect(page.getByText(/could not be found/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Book and pay/ })).toHaveCount(0);
});
