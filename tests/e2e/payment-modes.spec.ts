import { expect, test, type Page } from '@playwright/test';
import { closeTask, openTask } from './support/scenarios';
import { devSignIn } from './support/sign-in';

/**
 * No service fees (owner, 2026-11-23): the helper says how they're paid on each offer. Paid directly (the default), the
 * client books with no payment step and pays the helper after the task; paid upfront, the client pays the price and the
 * hold fee when booking, and TasksNearMe holds it. Each test offers on a $60 desk of its own (Chris's), as Jordan.
 */

test.skip(({ isMobile }) => isMobile, 'books shared people; desktop only');

async function sendOffer(page: Page, taskId: string, upfront = false) {
  await devSignIn(page, 'jordan@example.test');
  await page.goto(`/app/find-work/${taskId}`);
  const message = page.getByLabel('Message to the client');
  await expect(message).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Task price ($)').fill('60');
  // Paid directly is the default; upfront is a choice.
  await expect(page.getByRole('radio', { name: 'Directly by the client' })).toBeChecked();
  if (upfront) await page.getByRole('radio', { name: 'Upfront, held by TasksNearMe' }).check();
  await message.fill('I can come on the day with my own drill and a level.');
  await page.getByRole('button', { name: 'Send offer' }).click();
  await expect(page.getByRole('heading', { name: 'Your offer' })).toBeVisible({ timeout: 30_000 });
}

/** Chris opens the offer from his task, where its card says how it's paid, and starts booking it. */
async function startBooking(page: Page, taskId: string, paymentLine: string) {
  await devSignIn(page, 'chris@example.test');
  await page.goto(`/app/tasks/${taskId}`);
  await expect(page.getByText(paymentLine).first()).toBeVisible({ timeout: 30_000 });
  const offer = page.locator(`a[href*="/app/tasks/${taskId}/offers/off_"]`).first();
  await offer.click();
  await expect(page).toHaveURL(new RegExp(`/app/tasks/${taskId}/offers/off_`), { timeout: 30_000 });
  await page.getByRole('button', { name: 'Book helper' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/tasks/${taskId}/offers/off_[^/]+/confirm$`), { timeout: 30_000 });
}

test('an offer paid directly books with no payment step, and both people see who pays whom', async ({ page }) => {
  test.setTimeout(180_000);
  const task = await openTask('pay-direct');
  try {
    await sendOffer(page, task.taskId);
    await startBooking(page, task.taskId, 'Pay Jordan T. directly after the task. No fee.');
    const dialog = page.getByRole('dialog', { name: 'Confirm your booking' });
    await expect(dialog.getByRole('heading', { name: 'You pay Jordan T. directly' })).toBeVisible({ timeout: 30_000 });
    // Nothing to pay here: no card, no fee.
    await expect(dialog.getByRole('radio', { name: 'Success' })).toHaveCount(0);
    await expect(dialog.getByText('Hold fee')).toHaveCount(0);
    await dialog.getByRole('checkbox', { name: /I agree to the/ }).click();
    await dialog.getByRole('button', { name: 'Book Jordan T.' }).click();

    await expect(page).toHaveURL(/\/app\/bookings\/bkg_/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: task.title })).toBeVisible();
    await expect(page.getByText(/^You pay Jordan T\. directly after the task/).first()).toBeVisible();
    const booking = new URL(page.url()).pathname;
    await devSignIn(page, 'jordan@example.test');
    await page.goto(booking);
    await expect(page.getByText(/^Chris D\. pays you directly after the task/).first()).toBeVisible({ timeout: 30_000 });
  } finally {
    await closeTask(task.taskId);
  }
});

test('an offer paid upfront: the client pays the price and the hold fee, held by TasksNearMe', async ({ page }) => {
  test.setTimeout(180_000);
  const task = await openTask('pay-held');
  try {
    await sendOffer(page, task.taskId, true);
    await startBooking(page, task.taskId, 'Paid upfront: TasksNearMe holds it until you say the task is done.');
    const dialog = page.getByRole('dialog', { name: 'Confirm and pay' });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    // $60 and the 5% hold fee; Jordan gets the whole $60.
    await expect(dialog.getByText('Hold fee')).toBeVisible();
    await expect(dialog.getByText('$3.00').first()).toBeVisible();
    const pay = dialog.getByRole('button', { name: 'Book and pay $63.00' });
    await expect(pay).toBeVisible();
    const success = dialog.getByRole('radio', { name: 'Success' });
    if (await success.count()) await success.click();
    await dialog.getByRole('checkbox', { name: /I agree to the/ }).click();
    await pay.click();

    await expect(page).toHaveURL(/\/app\/bookings\/bkg_/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: task.title })).toBeVisible();
    await expect(page.getByText('$63.00').first()).toBeVisible();
  } finally {
    await closeTask(task.taskId);
  }
});
