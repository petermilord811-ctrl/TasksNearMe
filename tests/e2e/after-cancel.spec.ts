import { expect, test, type Page } from '@playwright/test';
import { canceledBooking, closeTask } from './support/scenarios';
import { devSignIn } from './support/sign-in';

/**
 * After a cancellation (blueprint 10 §3.2 T-10 and T-11): the client finds a replacement and an earlier
 * offerer can offer again; the helper reported as a no-show contests it. Each test writes its own canceled
 * booking (support/scenarios.ts), so the seeded bookings stay as other tests expect them.
 */

const DAY = 24 * 3_600_000;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A booking action: a button on desktops, or under "More" when the bar is full. */
async function runAction(page: Page, name: string) {
  const direct = page.getByRole('button', { name, exact: true });
  if (!(await direct.first().isVisible())) {
    const more = page.getByRole('button', { name: 'More' });
    if (await more.isVisible()) await more.click();
  }
  await page.getByRole('menuitem', { name }).or(direct).first().click();
}

test('the client finds a replacement after the helper cancels; an earlier offerer can offer again', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  const scenario = await canceledBooking('replace', 'helper', 5 * DAY);
  try {
    await devSignIn(page, 'chris@example.test');
    await page.goto(`/app/bookings/${scenario.bookingId}`);
    await expect(page.getByRole('heading', { level: 1, name: scenario.title })).toBeVisible({ timeout: 30_000 });
    await runAction(page, 'Find a replacement');
    await expect(page).toHaveURL(new RegExp(`/app/tasks/${scenario.taskId}$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: scenario.title })).toBeVisible();
    await expect(page.getByText('No offers yet').first()).toBeVisible();

    // Sam offered before and was declined at booking: he hears about it and can offer again.
    await devSignIn(page, 'sam@example.test');
    await page.goto('/app/notifications');
    const told = page.getByRole('link', { name: new RegExp(`looking for a new helper for ${escape(scenario.title)}`) });
    await expect(told).toBeVisible({ timeout: 30_000 });
    await told.click();
    await expect(page).toHaveURL(new RegExp(`/app/find-work/${scenario.taskId}$`), { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Send offer' })).toBeVisible({ timeout: 30_000 });
  } finally {
    // Off the board again for the tests that list open tasks.
    await closeTask(scenario.taskId);
  }
});

test('the helper reported as a no-show contests it, which opens a support case', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  const scenario = await canceledBooking('noshow', 'helper_no_show', -40 * 60_000);
  await devSignIn(page, 'jordan@example.test');
  await page.goto(`/app/bookings/${scenario.bookingId}`);
  await expect(page.getByRole('heading', { level: 1, name: scenario.title })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('The booking was canceled after you were reported as not arriving.').first()).toBeVisible();
  await runAction(page, 'Contest no-show report');
  await expect(page).toHaveURL(/\/app\/support\/case_/, { timeout: 30_000 });
  await expect(page.getByText("I'm contesting the no-show report on this booking.").first()).toBeVisible();

  // Back on the booking, it's done: no second case.
  await page.goto(`/app/bookings/${scenario.bookingId}`);
  await expect(page.getByRole('heading', { level: 1, name: scenario.title })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Contest no-show report' })).toHaveCount(0);
});
