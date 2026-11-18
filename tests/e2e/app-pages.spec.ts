import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';
import { openAccountGroup } from './support/account';

/**
 * The signed-in pages after plan 9.14 (audit M30, M33, M34, M37, M40, L18), on the seeded data: detail pages leave
 * the phone's tab dock out so their own actions and the reply box have the room, the inbox puts unread conversations
 * first and sits beside "Choose a conversation" on wide screens, My offers opens on a tab with offers in it, and the
 * account page's index jumps to each of its groups. Read-only, except that the inbox tests open a conversation when
 * Maya has none.
 */

const dock = (page: Page) => page.locator('[data-mobile-bottom-nav]');

/**
 * Every e2e run starts from the seed, which has no conversations (the messaging spec makes its own). When Maya's
 * inbox is empty, open her conversation with Sam about his desk offer: the same thread each time (`ensureThread`),
 * and no message is sent.
 */
async function ensureConversation(page: Page): Promise<void> {
  await page.goto('/app/messages');
  const list = page.getByRole('list', { name: 'Conversations' });
  await expect(list.or(page.getByRole('heading', { name: 'No messages yet' }))).toBeVisible({ timeout: 30_000 });
  if (await list.count()) return;
  await page.goto('/app/tasks/tsk_desk/offers/off_sam');
  // Below 1024 px the action bar keeps every action after the first under "More".
  const direct = page.getByRole('button', { name: 'Message helper', exact: true });
  const more = page.getByRole('button', { name: 'More', exact: true });
  await expect(direct.or(more).first()).toBeVisible({ timeout: 30_000 });
  // A tap before the page hydrates opens nothing: tap again until the sheet shows the action.
  await expect(async () => {
    if (!(await direct.first().isVisible())) await more.click({ timeout: 5_000 });
    await expect(direct.first()).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
  await direct.first().click();
  await expect(page).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });
}

test('detail pages leave the phone tab dock out; lists keep it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'the dock is a phone thing');
  test.setTimeout(120_000);
  await devSignIn(page, 'maya@example.test');

  await page.goto('/app/bookings');
  await expect(page.getByRole('heading', { level: 1, name: 'Bookings' })).toBeVisible({ timeout: 30_000 });
  await expect(dock(page)).toBeVisible();
  const booking = page.locator('a[href^="/app/bookings/bkg_"]').first();
  const href = await booking.getAttribute('href');
  await booking.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`), { timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'All bookings' })).toBeVisible();
  // Hidden, not necessarily gone: the router may keep the list's layout mounted out of sight for the way back.
  await expect(dock(page)).toBeHidden();

  await ensureConversation(page);
  await page.goto('/app/messages');
  await expect(dock(page)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('list', { name: 'Conversations' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });
  await expect(dock(page)).toBeHidden();
  // The reply box, or why the conversation closed, ends inside the first screen (audit M40).
  const end = page.getByRole('form', { name: 'Message' }).or(page.locator('[role="status"]').filter({ hasText: /closed|can't message/i })).first();
  await expect(end).toBeVisible();
  const box = await end.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
});

test('the inbox lists unread conversations first, beside "Choose a conversation" on wide screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'two panes from 1024 px');
  test.setTimeout(120_000);
  await devSignIn(page, 'maya@example.test');
  await ensureConversation(page);
  await page.goto('/app/messages');
  await expect(page.getByText('Choose a conversation')).toBeVisible({ timeout: 30_000 });
  const unread = await page.getByRole('list', { name: 'Conversations' }).getByRole('listitem').evaluateAll((rows) => rows.map((row) => /\d+ unread/.test(row.textContent ?? '')));
  // No read conversation above an unread one (audit M33).
  const firstRead = unread.indexOf(false);
  expect(firstRead === -1 || unread.slice(firstRead).every((isUnread) => !isUnread)).toBe(true);
});

test('My offers opens on a tab that has offers in it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'read-only; one project is enough');
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/offers');
  const selected = page.getByRole('tab', { selected: true });
  await expect(selected).toBeVisible({ timeout: 30_000 });
  // "Active (0)" only when every tab is empty (audit L18).
  const counts = await page.getByRole('tab').allTextContents();
  if (counts.some((label) => !/\(0\)/.test(label))) await expect(selected).not.toHaveText(/\(0\)/);
});

test('the account page is in groups, and its index jumps to each (audit M37)', async ({ page }) => {
  test.setTimeout(120_000);
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/account');
  const index = page.getByRole('navigation', { name: 'Account sections' });
  await expect(index).toBeVisible({ timeout: 45_000 });
  await expect(index.getByRole('link')).toHaveText(['Profile', 'Sign-in and security', 'Notifications', 'Plan and helping', 'Privacy and data']);
  await index.getByRole('link', { name: 'Privacy and data' }).click();
  await expect(page).toHaveURL(/#account-privacy$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Privacy and data' })).toBeInViewport();
  await expect(page.locator('#account-privacy').getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('on phones the account groups fold, and the one a link points at opens (plan 9.14b)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'the groups fold below 1024 px');
  test.setTimeout(120_000);
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/account#account-notifications');
  await expect(page.locator('#account-notifications-title button')).toHaveAttribute('aria-expanded', 'true', { timeout: 45_000 });
  await expect(page.getByRole('switch', { name: 'Bookings by Email' })).toBeVisible();
  // Another group stays folded until it's opened.
  await expect(page.getByRole('heading', { level: 3, name: 'Ways to sign in' })).toBeHidden();
  await openAccountGroup(page, 'security');
  await expect(page.getByRole('heading', { level: 3, name: 'Ways to sign in' })).toBeVisible();
});

test('the offer and booking pages render on the server without a fallback to the client (audit L29)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'read-only; one project is enough');
  test.setTimeout(120_000);
  await devSignIn(page, 'maya@example.test');
  // The addresses first, then each page loaded on its own: a click while a page still streams can race React's
  // streaming scripts, which is not what this checks.
  await page.goto('/app/tasks');
  await page.getByRole('tab', { name: /^Open/ }).click();
  const taskHref = await page.locator('a[href^="/app/tasks/tsk_"]').first().getAttribute('href', { timeout: 30_000 });
  await page.goto('/app/bookings');
  const bookingHref = await page.locator('a[href^="/app/bookings/bkg_"]').first().getAttribute('href', { timeout: 30_000 });
  await page.goto(taskHref!);
  // A task without offers has no offer page to load.
  const offerHref = await page.locator('a[href*="/offers/off_"]').first().getAttribute('href', { timeout: 30_000 }).catch(() => null);
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /suspense|client rendering|state update|hydrat|#418|#419|#423|#425/i.test(message.text())) problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(String(error)));
  for (const href of [taskHref, offerHref, bookingHref].filter((value): value is string => Boolean(value))) {
    await page.goto(href);
    await page.waitForLoadState('load');
    await page.waitForTimeout(1_500);
  }
  expect(problems).toEqual([]);
});
