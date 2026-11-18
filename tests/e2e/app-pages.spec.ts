import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * The signed-in pages after plan 9.14 (audit M30, M33, M34, M40, L18), on the seeded data, read-only: detail pages
 * leave the phone's tab dock out so their own actions and the reply box have the room, the inbox puts unread
 * conversations first and sits beside "Choose a conversation" on wide screens, and My offers opens on a tab with
 * offers in it.
 */

const dock = (page: Page) => page.locator('[data-mobile-bottom-nav]');

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
  await expect(dock(page)).toHaveCount(0);

  await page.goto('/app/messages');
  await expect(dock(page)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('list', { name: 'Conversations' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });
  await expect(dock(page)).toHaveCount(0);
  // The reply box, or why the conversation closed, ends inside the first screen (audit M40).
  const end = page.getByRole('form', { name: 'Message' }).or(page.locator('[role="status"]').filter({ hasText: /closed|can't message/i })).first();
  await expect(end).toBeVisible();
  const box = await end.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
});

test('the inbox lists unread conversations first, beside "Choose a conversation" on wide screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'two panes from 1024 px');
  await devSignIn(page, 'maya@example.test');
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

test('the offer and booking pages render on the server without a fallback to the client (audit L29)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'read-only; one project is enough');
  test.setTimeout(120_000);
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /suspense|client rendering|state update|hydrat|#418|#419|#423|#425/i.test(message.text())) problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(String(error)));
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks');
  await page.getByRole('tab', { name: /^Open/ }).click();
  const task = page.locator('a[href^="/app/tasks/tsk_"]').first();
  await task.click();
  await expect(page.getByRole('link', { name: 'My tasks' })).toBeVisible({ timeout: 30_000 });
  const offer = page.getByRole('link', { name: /View .*'s offer/ }).first();
  if (await offer.count()) {
    await offer.click();
    await expect(page.getByRole('heading', { level: 1, name: /Offer from/ })).toBeVisible({ timeout: 30_000 });
  }
  await page.goto('/app/bookings');
  await page.locator('a[href^="/app/bookings/bkg_"]').first().click();
  await expect(page.getByRole('link', { name: 'All bookings' })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2_000);
  expect(problems).toEqual([]);
});
