import { expect, test, type Page } from '@playwright/test';
import { onConversationPage } from './support/conversation';
import { devSignIn } from './support/sign-in';

/**
 * Wide screens: Messages is two panes, the conversations beside "Choose a conversation" or beside the open one
 * (audit M34: opening one doesn't rearrange the page). The list is in the (main) route group and a conversation in
 * (flow) (5f3e688, so phones drop the tab dock there), so this checks frame by frame, on the way in and back out,
 * that the signed-in shell stays the same element, its loading skeleton never shows, and the conversations pane
 * stays on screen the whole way.
 */

interface Frame { at: number; skeleton: boolean; pageSkeleton: boolean; list: boolean; marked: boolean; url: string }

/** Maya's conversation with Sam about his desk offer: opened from the offer page when her inbox is empty. */
async function ensureConversation(page: Page): Promise<void> {
  await page.goto('/app/messages');
  const list = page.getByRole('list', { name: 'Conversations' });
  await expect(list.or(page.getByRole('heading', { name: 'No messages yet' }))).toBeVisible({ timeout: 30_000 });
  if (await list.count()) return;
  await page.goto('/app/tasks/tsk_desk/offers/off_sam');
  const direct = page.getByRole('button', { name: 'Message helper', exact: true });
  // A click before the page hydrates does nothing: again until the conversation opens (its page, or the chat window).
  await expect(async () => {
    await direct.first().click({ timeout: 5_000 });
    await expect(page.getByRole('dialog', { name: 'Messages' }).getByRole('log').or(page.getByRole('heading', { level: 1, name: /^Messages with / })).first()).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  await onConversationPage(page);
}

/** Marks the visible shell and records, every frame, what's on screen. */
async function startWatching(page: Page, token: string): Promise<void> {
  await page.evaluate((token) => {
    const visible = (element: Element) => element.checkVisibility();
    const shell = [...document.querySelectorAll<HTMLElement>('[data-app-shell]')].find(visible);
    if (!shell) throw new Error('no visible shell');
    shell.dataset.probe = token;
    const frames: Frame[] = [];
    (window as unknown as { probeFrames: Frame[] }).probeFrames = frames;
    const start = performance.now();
    const sample = () => {
      const shown = [...document.querySelectorAll<HTMLElement>('[data-app-shell]')].find(visible);
      frames.push({
        at: Math.round(performance.now() - start),
        skeleton: [...document.querySelectorAll('[data-app-shell-skeleton]')].some(visible),
        pageSkeleton: [...document.querySelectorAll('[role="status"][aria-busy="true"]')].some(visible),
        list: [...document.querySelectorAll('ul[aria-label="Conversations"]')].some(visible),
        marked: shown?.dataset.probe === token,
        url: location.pathname,
      });
      if (frames.length < 3000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, token);
}

async function stopWatching(page: Page, label: string): Promise<Frame[]> {
  const frames = await page.evaluate(() => {
    const all = (window as unknown as { probeFrames: Frame[] }).probeFrames;
    return all.splice(0, all.length);
  });
  const lost = frames.filter((frame) => !frame.list).length;
  const skeleton = frames.filter((frame) => frame.skeleton).length;
  const swapped = frames.filter((frame) => !frame.marked).length;
  const loading = frames.filter((frame) => frame.pageSkeleton).length;
  const firstNew = frames.find((frame) => !frame.marked);
  console.log(`[messages-panes] ${label}: ${frames.length} frames over ${frames.at(-1)?.at ?? 0} ms; list off screen in ${lost}, shell skeleton in ${skeleton}, page skeleton in ${loading}, another shell in ${swapped}${firstNew ? ` (from ${firstNew.at} ms, ${firstNew.url})` : ''}`);
  return frames;
}

test('opening a conversation and going back keeps the shell and the two panes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'two panes from 1024 px');
  test.setTimeout(150_000);
  await devSignIn(page, 'maya@example.test');
  await ensureConversation(page);
  await page.goto('/app/messages');
  await expect(page.getByText('Choose a conversation')).toBeVisible({ timeout: 30_000 });
  // Settled: hydrated, and the links prefetched as they would be for a person who looks before clicking.
  await page.waitForLoadState('networkidle');

  await startWatching(page, 'opening');
  await page.getByRole('list', { name: 'Conversations' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: /^Messages with / })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  const opening = await stopWatching(page, 'list to conversation');

  // Back: from 1024 px the conversation's own back link gives way to the list beside it, so the browser's.
  await page.waitForLoadState('networkidle');
  await startWatching(page, 'back');
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/messages$/, { timeout: 30_000 });
  await expect(page.getByText('Choose a conversation')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  const back = await stopWatching(page, 'conversation to list');

  for (const frames of [opening, back]) {
    expect(frames.filter((frame) => frame.skeleton)).toEqual([]);
    expect(frames.filter((frame) => !frame.list)).toEqual([]);
    expect(frames.filter((frame) => !frame.marked)).toEqual([]);
  }
});
