import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Availability posts (UI-029): Jordan posts an open time and cancels it; Ben requests Jordan's seeded yard
 * slot (10 days out, 9 am–1 pm, $30/h) for his seeded backyard leaves, which holds the slot for Jordan.
 */

/** A market-time date (`YYYY-MM-DD`) some days from now. */
const marketDate = (days: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(Date.now() + days * 86_400_000));

test('a helper posts an open time and cancels it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/availability');
  await expect(page.getByRole('heading', { level: 1, name: 'My availability' })).toBeVisible({ timeout: 30_000 });
  // The open-time form's own fields: the neighborhood day form on the same page has a Date and a Service too (2026-11-24).
  const slotForm = page.getByRole('form', { name: 'Add an open time' });
  await slotForm.getByLabel('Service').selectOption('furniture-assembly');
  await slotForm.getByLabel('Date').fill(marketDate(5));
  await slotForm.getByLabel('Start time').selectOption('13:00');
  await slotForm.getByLabel('End time').selectOption('16:00');
  await slotForm.getByRole('button', { name: 'Post open time' }).click();
  await expect(page.getByText('Your open time has been posted.').first()).toBeVisible({ timeout: 30_000 });

  const post = page.getByRole('listitem').filter({ hasText: 'Furniture assembly' }).first();
  await post.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel open time' }).click();
  await expect(page.getByText('Your open time has been canceled.').first()).toBeVisible({ timeout: 30_000 });
});

test('a client requests an open time from the profile; the helper sees it requested', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  await devSignIn(page, 'ben@example.test');
  await page.goto('/helpers/jordan-t');
  await expect(page.getByRole('heading', { name: 'Open times' })).toBeVisible({ timeout: 30_000 });
  // The seeded slot (another test may post a sooner one at the same time).
  await page.locator('a[href*="slot=avl_seed_yard"]').click();
  await expect(page).toHaveURL(/\/app\/helpers\/jordan-t\/request\?slot=avl_seed_yard$/, { timeout: 30_000 });
  await page.getByRole('radio', { name: /Clear leaves from the backyard/ }).click();
  await page.getByRole('radio', { name: 'Approved' }).click();
  await page.getByRole('checkbox', { name: /I agree to the/ }).click();
  await page.getByRole('button', { name: 'Send request' }).click();
  // The dialog closes over the profile (2026-11-23: nothing happens on the task until Jordan answers), and the toast
  // offers the task.
  await expect(page).toHaveURL(/\/helpers\/jordan-t$/, { timeout: 30_000 });
  await page.getByRole('button', { name: 'View task' }).click();
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_leaves$/, { timeout: 30_000 });

  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/availability');
  await expect(page.getByRole('link', { name: "View Ben W.'s request" })).toBeVisible({ timeout: 30_000 });
});
