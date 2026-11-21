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
const GRACE_EMAIL = 'grace@example.test';
const GRACE_PHONE = '+13525550110';

async function outboxText(page: Page, to: string): Promise<string> {
  await page.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
  // The list streams in after the page's shell; read it, not its loading line.
  await expect(page.getByText('Loading messages…')).toHaveCount(0, { timeout: 30_000 });
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

test("a text's short link opens the page it's about, and a code that isn't one is not found (messages pass J-M9)", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(240_000);
  // Grace, whom no other spec uses: the test above turns Chris's booking texts off while it runs (in parallel).
  await devSignIn(page, GRACE_EMAIL);
  const title = `Assemble a desk (e2e short ${Date.now().toString(36)})`;
  await notifyNow('usr_grace', 'helper_on_the_way', title);
  // The runner sends within a minute. The text carries /n/<code> in place of the page's address.
  let texts = '';
  await expect.poll(async () => (texts = await outboxText(page, GRACE_PHONE)), { timeout: 150_000, intervals: [5_000] }).toContain(title);
  // Exactly 10 characters: the page's text runs straight on into the next message.
  const code = texts.slice(texts.indexOf(title)).match(/\/n\/([0-9A-Za-z]{10})/)?.[1];
  expect(code, 'the text carries a short link').toBeTruthy();
  // The email keeps the page's full address.
  await expect.poll(() => outboxText(page, GRACE_EMAIL), { timeout: 150_000, intervals: [5_000] }).toContain(title);
  expect(await outboxText(page, GRACE_EMAIL)).toContain('/app/messages');
  // Through the real proxy and route: the short link opens the page, signed in.
  await page.goto(`/n/${code}`);
  await expect(page).toHaveURL(/\/app\/messages$/);
  for (const path of ['/n/AAAAAAAAAA', '/n/short']) expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
});
