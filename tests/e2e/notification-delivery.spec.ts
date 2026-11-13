import { expect, test, type Page } from '@playwright/test';
import { notifyNow } from './support/scenarios';
import { devSignIn } from './support/sign-in';

/**
 * T-29: notifications go out by email and text per the person's preferences, through the dev outbox
 * (/dev/outbox). The job runner sends them (every minute), so this waits for it. Quiet hours and retries
 * are covered by tests/integration/notification-delivery.test.ts.
 */

const CHRIS_EMAIL = 'chris@example.test';
const CHRIS_PHONE = '+15125550102';

async function outboxText(page: Page, to: string): Promise<string> {
  await page.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
  return (await page.locator('main').textContent()) ?? '';
}

test('a booking update arrives by email, and not by text once booking texts are off', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(240_000);
  await devSignIn(page, CHRIS_EMAIL);
  await page.goto('/app/account');
  const texts = page.getByRole('switch', { name: 'Bookings by Text message (SMS)' });
  await expect(texts).toBeChecked({ timeout: 30_000 });
  // A click before the page hydrates does nothing on a busy dev server: click again until it takes.
  await expect(async () => {
    if (await texts.isChecked()) await texts.click({ timeout: 5_000 });
    await expect(texts).not.toBeChecked({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await expect(page.getByText(/your preference was saved/).first()).toBeVisible();
  try {
    const title = `Assemble a desk (e2e notify ${Date.now().toString(36)})`;
    await notifyNow('usr_chris', 'helper_on_the_way', title);
    // The runner sends within a minute.
    await expect.poll(() => outboxText(page, CHRIS_EMAIL), { timeout: 150_000, intervals: [5_000] }).toContain(`Jordan T. is on the way for ${title}.`);
    expect(await outboxText(page, CHRIS_PHONE)).not.toContain(title);
  } finally {
    await page.goto('/app/account');
    const reset = page.getByRole('switch', { name: 'Bookings by Text message (SMS)' });
    await expect(async () => {
      if (!(await reset.isChecked())) await reset.click({ timeout: 5_000 });
      await expect(reset).toBeChecked({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
  }
});
