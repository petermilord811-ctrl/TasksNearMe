import { expect, test } from '@playwright/test';
import { moveClock, resetClock } from './support/clock';
import { submittedBooking } from './support/scenarios';
import { devSignIn } from './support/sign-in';

/**
 * Time travel with the test clock (blueprint 10 §3.1). T-02: the client doesn't answer after the work is
 * sent; reminders 24 h and 4 h before, then it's approved automatically at 72 h. The booking is written
 * for this test (support/scenarios.ts); the clock moves for this browser only.
 */

const HOUR = 3_600_000;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('T-02: reminders 24 h and 4 h before, then the work is approved automatically at 72 h', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  const scenario = await submittedBooking('approve');
  const reminder = (hours: string) => page.getByRole('link', { name: new RegExp(`Approve ${escape(scenario.title)} or report a problem\\. It's approved automatically in ${hours}`) });
  await devSignIn(page, 'chris@example.test');
  try {
    await page.goto(`/app/bookings/${scenario.bookingId}`);
    await expect(page.getByRole('heading', { level: 1, name: scenario.title })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Approve task' }).first()).toBeVisible();

    await moveClock(page, 48 * HOUR + 60_000);
    await page.goto('/app/notifications');
    await expect(reminder('24 hours')).toBeVisible({ timeout: 30_000 });

    await moveClock(page, 68 * HOUR + 60_000);
    await page.goto('/app/notifications');
    await expect(reminder('4 hours')).toBeVisible({ timeout: 30_000 });

    await moveClock(page, 72 * HOUR + 60_000);
    await page.goto(`/app/bookings/${scenario.bookingId}`);
    await expect(page.getByText('The completed task was approved automatically.').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Approve task' })).toHaveCount(0);
  } finally {
    await resetClock(page);
  }
});

test('the test clock needs its secret', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  const response = await page.request.post('/dev/clock', { data: { offsetMs: HOUR }, headers: { 'x-test-clock-secret': 'wrong' } });
  expect(response.status()).toBe(403);
});
