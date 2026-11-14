import { expect, test, type Page } from '@playwright/test';
import { notifyNow } from './support/scenarios';

/**
 * Notification email (UI-049): the job runner emails a new notification within a minute (through the dev
 * outbox here), designed with a button to the page and a signed unsubscribe link. The link's page asks
 * first; a mail app's one-click unsubscribe posts to the same link. Each step is undone, so the seeded
 * preferences stay as they were.
 */

const SAM = 'sam@example.test';

async function outboxMessage(page: Page, to: string, contains: string) {
  await page.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
  return page.locator('[data-testid="outbox-message"]', { hasText: contains }).first();
}

test('a message email is designed, and its unsubscribe link and one-click unsubscribe work', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(240_000);
  const title = `Assemble a desk (e2e email ${Date.now().toString(36)})`;
  await notifyNow('usr_sam', 'message_received', title);

  // The runner sends within a minute.
  await expect.poll(async () => (await (await outboxMessage(page, SAM, title)).count()) > 0, { timeout: 150_000, intervals: [5_000] }).toBe(true);
  const message = await outboxMessage(page, SAM, title);
  await expect(message.frameLocator('iframe').getByRole('link', { name: /Open your messages/ })).toHaveAttribute('href', /\/app\/messages$/);
  const text = (await message.locator('pre').textContent()) ?? '';
  const sent = /Unsubscribe: (\S+)/.exec(text)?.[1];
  expect(sent).toMatch(/\/email\/unsubscribe\?token=/);
  // Followed on the server under test: the dev server's job runner shares the database and may be the one that
  // sent the email, with its own address in the link (5.19). The signed token works on either.
  const url = new URL(sent!);
  const link = `${url.pathname}${url.search}`;

  // The page asks first, then offers the way back.
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'Stop message emails?' })).toBeVisible();
  await page.getByRole('button', { name: 'Unsubscribe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: "You won't get message emails anymore" })).toBeVisible();
  await page.getByRole('button', { name: 'Turn them back on' }).click();
  await expect(page.getByText('Message emails are back on.')).toBeVisible();

  // One-click from a mail app: a POST to the header's address.
  const oneClick = link.replace('/email/unsubscribe', '/api/email/unsubscribe');
  expect((await request.post(oneClick, { form: { 'List-Unsubscribe': 'One-Click' } })).status()).toBe(200);
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: "You won't get message emails anymore" })).toBeVisible();
  await page.getByRole('button', { name: 'Turn them back on' }).click();
  await expect(page.getByText('Message emails are back on.')).toBeVisible();

  // A changed link does nothing.
  expect((await request.post(oneClick.replace('usr_sam', 'usr_maya'))).status()).toBe(404);
});
