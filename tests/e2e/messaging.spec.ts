import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Messages (UI-014): Maya and Sam talk about Sam's offer on the desk before booking. Contact details
 * stay hidden from the other person until a booking is confirmed. The seed empties offer threads.
 */

test('the client and the helper talk before booking, with contact details hidden', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks/tsk_desk/offers/off_sam');
  await page.getByRole('button', { name: 'Message helper' }).first().click();
  await expect(page).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });
  const threadUrl = page.url();
  await page.getByRole('textbox', { name: 'Message' }).fill('Could you come at 11 instead?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('log').getByText('Could you come at 11 instead?')).toBeVisible();

  await devSignIn(page, 'sam@example.test');
  await page.goto('/app/messages');
  await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
  await page.goto(threadUrl);
  await expect(page.getByRole('log').getByText('Could you come at 11 instead?')).toBeVisible();
  await page.getByRole('textbox', { name: 'Message' }).fill('Sure. Text me at 512-555-0177 when you are ready.');
  await page.getByRole('button', { name: 'Send' }).click();
  // Sam always sees his own words. (Lookups stay inside the conversation: on wide screens the list beside it
  // shows each one's last message too.)
  await expect(page.getByRole('log').getByText(/512-555-0177/)).toBeVisible();

  await devSignIn(page, 'maya@example.test');
  await page.goto(threadUrl);
  await expect(page.getByRole('log').getByText(/Sure\. Text me at/)).toBeVisible();
  expect(await page.content()).not.toContain('512-555-0177');
});

test('other people cannot open a conversation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'chris@example.test');
  await page.goto('/app/messages/thr_does_not_exist');
  await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible();
  await page.goto('/app/messages');
  await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
});
