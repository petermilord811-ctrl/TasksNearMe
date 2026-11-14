import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Real time (completion plan 7.1–7.2): Ruth and Lee have the same conversation open, each in their own browser.
 * Lee's typing shows on Ruth's screen and his message appears without a reload. Once both have written, each sees
 * the other as active, and Ruth sees "Seen" when Lee has read her reply (presence waits for a real conversation:
 * the research report's rule 10).
 *
 * Ruth's laptop task and Lee's offer on it (`off_lee_computer`) belong to this spec alone: other specs decline
 * or book the desk task's offers, and a shard that runs one of them first would leave no "Message helper" here.
 */
test('a conversation updates live: typing, new messages, then presence and Seen', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  const ruthContext = await browser.newContext();
  const leeContext = await browser.newContext();
  const ruth = await ruthContext.newPage();
  const lee = await leeContext.newPage();
  try {
    await devSignIn(ruth, 'ruth@example.test');
    await ruth.goto('/app/tasks/tsk_computer/offers/off_lee_computer');
    await ruth.getByRole('button', { name: 'Message helper' }).first().click({ timeout: 30_000 });
    await expect(ruth).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });
    const threadUrl = ruth.url();

    await devSignIn(lee, 'lee@example.test');
    await lee.goto(threadUrl);
    await expect(lee.getByRole('textbox', { name: 'Message' })).toBeVisible();
    // Nobody has written yet: no presence.
    await expect(lee.getByText('Active now')).toHaveCount(0);

    // A marker that a full reload would wipe: messages must arrive without one.
    await ruth.evaluate(() => {
      (window as unknown as { liveMarker: boolean }).liveMarker = true;
    });
    await lee.getByRole('textbox', { name: 'Message' }).pressSequentially('On my way at ten', { delay: 30 });
    await expect(ruth.getByText('typing…')).toBeVisible({ timeout: 10_000 });
    await lee.getByRole('button', { name: 'Send' }).click();
    await expect(ruth.getByRole('log').getByText('On my way at ten')).toBeVisible({ timeout: 10_000 });
    expect(await ruth.evaluate(() => (window as unknown as { liveMarker?: boolean }).liveMarker)).toBe(true);

    // Ruth answers: now it's a conversation, so presence and Seen start.
    await ruth.getByRole('textbox', { name: 'Message' }).fill('Perfect, see you then');
    await ruth.getByRole('button', { name: 'Send' }).click();
    await expect(lee.getByRole('log').getByText('Perfect, see you then')).toBeVisible({ timeout: 10_000 });
    await expect(ruth.getByText('Seen', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(lee.getByText('Active now')).toBeVisible({ timeout: 15_000 });
  } finally {
    await ruthContext.close();
    await leeContext.close();
  }
});
