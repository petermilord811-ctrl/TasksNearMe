import { expect, type Page } from '@playwright/test';

const THREAD = /\/app\/messages\/thr_/;

/**
 * After a Message button (an offer's, a booking's): the conversation's own page. On wide screens the conversation opens
 * in the chat window over the page (2026-11-23, owner: "I hate to redirect to new pages continually"), and the window's
 * Open full page goes to it; on phones the button goes there itself.
 */
export async function onConversationPage(page: Page, timeout = 30_000): Promise<void> {
  const chat = page.getByRole('dialog', { name: 'Messages' });
  await expect(async () => {
    if (THREAD.test(new URL(page.url()).pathname)) return;
    await expect(chat.getByRole('log')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout });
  if (!THREAD.test(new URL(page.url()).pathname)) await chat.getByRole('link', { name: 'Open full page' }).click();
  await expect(page).toHaveURL(THREAD, { timeout });
}
