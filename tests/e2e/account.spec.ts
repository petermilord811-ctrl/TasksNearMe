import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/** Notifications and the account page (UI-017) on the seeded data. */

test('notifications lead to what they are about', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'ben@example.test');
  await page.goto('/app/notifications');
  await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  const confirmed = page.getByRole('link', { name: /Your booking for Anchor a tall bookshelf to the wall is confirmed/ });
  await expect(confirmed).toHaveAttribute('href', '/app/bookings/bkg_tv');
  await confirmed.click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_tv$/);
});

test('notifications: mark all as read', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  await devSignIn(page, 'ruth@example.test');
  await page.goto('/app/notifications');
  // The bell counts the unread ones (other tests may add more while this runs).
  await expect(page.getByRole('link', { name: /^Notifications, \d+ unread notifications?$/ })).toBeVisible();
  // Seeded: Jordan arrived (unread) and was on the way (read).
  const arrived = page.getByRole('link', { name: /Jordan T\. has arrived for Assemble a bookcase/ });
  await expect(arrived).toContainText('Unread');
  await expect(page.getByText('Jordan T. is on the way for Assemble a bookcase')).toBeVisible();
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  // The list refreshes (other tests may add new notifications meanwhile): the seeded one is read now.
  await expect(arrived).not.toContainText('Unread');
});

test('account: the phone stays masked and the receipts stay on', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'ana@example.test');
  await page.goto('/app/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
  await expect(page.getByText('•••• 0105 · Verified')).toBeVisible();
  expect(await page.content()).not.toContain('5550105');
  const locked = page.getByRole('switch', { name: 'Bookings by Email' });
  await expect(locked).toBeChecked();
  await expect(locked).toBeDisabled();
});

test('account: a notification preference saves', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  await devSignIn(page, 'ana@example.test');
  await page.goto('/app/account');
  const tips = page.getByRole('switch', { name: 'Tips and news by Email' });
  await expect(tips).not.toBeChecked();
  await tips.click();
  await expect(page.getByText('Tips and news by Email: your preference was saved.').first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Tips and news by Email' })).toBeChecked();
});
