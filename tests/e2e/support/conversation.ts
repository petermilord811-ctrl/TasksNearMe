import { expect, type Locator, type Page } from '@playwright/test';

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

/**
 * A long press on a message as a finger would (2026-11-23: on phones it opens the reaction picker with Reply, Translate
 * and Copy). Pointer events of type touch, held past the 450 ms the bubble waits for.
 */
export async function longPress(bubble: Locator): Promise<void> {
  const box = await bubble.boundingBox();
  if (!box) throw new Error('The message is not on screen');
  const at = { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  await bubble.dispatchEvent('pointerdown', at);
  await bubble.page().waitForTimeout(650);
  await bubble.dispatchEvent('pointerup', at);
}

/** Whether the page has a finger for a pointer (the phone projects): messages' actions come from a long press there. */
async function touchScreen(page: Page): Promise<boolean> {
  return page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
}

/**
 * One of a message's actions (Reply, Translate) as a person would reach it: with a mouse, the row that comes up beside the
 * bubble (its `article`); on a phone, the long-press picker.
 */
export async function messageAction(bubble: Locator, name: string): Promise<void> {
  if (await touchScreen(bubble.page())) {
    await longPress(bubble);
    await bubble.page().getByRole('dialog', { name: /^Reactions to / }).getByRole('button', { name, exact: true }).click();
    return;
  }
  await bubble.hover();
  await bubble.getByRole('button', { name, exact: true }).click();
}

/**
 * React to a message (its `article`) as a person would: with a mouse, the React button that comes up beside the bubble;
 * on a phone, a long press. Then the reaction from the picker (its name, e.g. "Thumbs up"; "More reactions" first for the
 * last three).
 */
export async function reactTo(bubble: Locator, reaction: string): Promise<void> {
  if (await touchScreen(bubble.page())) await longPress(bubble);
  else {
    await bubble.hover();
    await bubble.getByRole('button', { name: 'React', exact: true }).click();
  }
  const picker = bubble.page().getByRole('toolbar', { name: /^Reactions to / });
  await expect(picker).toBeVisible();
  if (!(await picker.getByRole('button', { name: reaction, exact: true }).isVisible())) await picker.getByRole('button', { name: 'More reactions' }).click();
  await picker.getByRole('button', { name: reaction, exact: true }).click();
}
