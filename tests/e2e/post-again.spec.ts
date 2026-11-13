import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * "Post again" (completion plan 4.2): Maya's finished wardrobe task opens the posting wizard on its review
 * step, with everything from last time (her saved address too) on the next date that fits, and one more tap
 * posts it as a new open task.
 */
test('a poster posts a finished task again in two taps', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'posts a task (shared data); desktop only');
  test.setTimeout(150_000);
  await devSignIn(page, 'maya@example.test');

  await page.goto('/app/tasks/tsk_wardrobe');
  await expect(page.getByRole('heading', { level: 1, name: 'Assemble a wardrobe' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Post again' }).click();

  await expect(page).toHaveURL(/\/app\/tasks\/new\?again=tsk_wardrobe$/, { timeout: 30_000 });
  await expect(page.getByText('Step 8 of 8', { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Posting “Assemble a wardrobe” again.', { exact: false })).toBeVisible();
  // Only the booked helper ever sees the address; the review shows the poster their own.
  await expect(page.getByRole('region', { name: 'Only your booked helper sees' })).toBeVisible();

  await page.getByRole('button', { name: 'Post task' }).click();
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_[0-9a-f]+$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Assemble a wardrobe' })).toBeVisible();
  await expect(page.getByText('No offers yet')).toBeVisible();
});
