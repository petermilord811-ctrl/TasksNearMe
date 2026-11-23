import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/** Support for members, and reporting or blocking from a conversation (UI-031), on the seeded data. */

test('support: the case list and a case with support’s reply', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/support');
  await expect(page.getByRole('heading', { level: 1, name: 'Support' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911');
  await page.getByRole('link', { name: /Payment/ }).first().click();
  await expect(page).toHaveURL(/\/app\/support\/case_seed_maya_payment$/);
  await expect(page.getByText('Thanks, Maya. We are looking into it. Which booking was this for?')).toBeVisible();
});

test('support: a new request opens a case, and the member replies', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  await devSignIn(page, 'chris@example.test');
  await page.goto('/app/support');
  await page.getByRole('radio', { name: 'Account' }).check();
  await page.getByLabel('Description').fill('How do I change the email address on my account?');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page).toHaveURL(/\/app\/support\/case_/, { timeout: 30_000 });
  await expect(page.getByText('How do I change the email address on my account?').first()).toBeVisible();
  await page.getByLabel('Your reply').fill('It is for the address I signed up with.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText('It is for the address I signed up with.').first()).toBeVisible();
});

test('a conversation: report the other person, block and unblock them', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  await devSignIn(page, 'ruth@example.test');
  await page.goto('/app/bookings/bkg_bookcase');
  await page.getByRole('button', { name: 'Send message' }).first().click();
  await expect(page).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });

  await page.getByRole('button', { name: 'Safety options for Jordan T.' }).click();
  await page.getByRole('menuitem', { name: 'Report' }).click();
  // Paying a helper directly is allowed since 2026-11-23, so "Payment outside TasksNearMe" is no longer a reason.
  await expect(page.getByRole('radio', { name: 'Payment outside TasksNearMe' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Scam or fraud' }).check();
  await page.getByLabel('Details').fill('Asked me for a deposit to a different account before the task.');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Thanks. Support will review this.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Safety options for Jordan T.' }).click();
  await page.getByRole('menuitem', { name: 'Block' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Block' }).click();
  await expect(page.getByText('Jordan T. is blocked.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Safety options for Jordan T.' }).click();
  await page.getByRole('menuitem', { name: 'Unblock' }).click();
  await expect(page.getByText('Jordan T. is unblocked.').first()).toBeVisible();
});
