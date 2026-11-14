import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Real time (completion plan 7.1–7.2): Maya and Lee have the same conversation open, each in their own browser.
 * Lee's typing shows on Maya's screen and his message appears without a reload. Once both have written, each sees
 * the other as active, and Maya sees "Seen" when Lee has read her reply (presence waits for a real conversation:
 * the research report's rule 10).
 */
test('a conversation updates live: typing, new messages, then presence and Seen', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  const mayaContext = await browser.newContext();
  const leeContext = await browser.newContext();
  const maya = await mayaContext.newPage();
  const lee = await leeContext.newPage();
  try {
    await devSignIn(maya, 'maya@example.test');
    await maya.goto('/app/tasks/tsk_desk/offers/off_lee');
    await maya.getByRole('button', { name: 'Message helper' }).first().click();
    await expect(maya).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });
    const threadUrl = maya.url();

    await devSignIn(lee, 'lee@example.test');
    await lee.goto(threadUrl);
    await expect(lee.getByRole('textbox', { name: 'Message' })).toBeVisible();
    // Nobody has written yet: no presence.
    await expect(lee.getByText('Active now')).toHaveCount(0);

    // A marker that a full reload would wipe: messages must arrive without one.
    await maya.evaluate(() => {
      (window as unknown as { liveMarker: boolean }).liveMarker = true;
    });
    await lee.getByRole('textbox', { name: 'Message' }).pressSequentially('On my way at ten', { delay: 30 });
    await expect(maya.getByText('typing…')).toBeVisible({ timeout: 10_000 });
    await lee.getByRole('button', { name: 'Send' }).click();
    await expect(maya.getByText('On my way at ten')).toBeVisible({ timeout: 10_000 });
    expect(await maya.evaluate(() => (window as unknown as { liveMarker?: boolean }).liveMarker)).toBe(true);

    // Maya answers: now it's a conversation, so presence and Seen start.
    await maya.getByRole('textbox', { name: 'Message' }).fill('Perfect, see you then');
    await maya.getByRole('button', { name: 'Send' }).click();
    await expect(lee.getByText('Perfect, see you then')).toBeVisible({ timeout: 10_000 });
    await expect(maya.getByText('Seen', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(lee.getByText('Active now')).toBeVisible({ timeout: 15_000 });
  } finally {
    await mayaContext.close();
    await leeContext.close();
  }
});
