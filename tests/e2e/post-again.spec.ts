import { expect, test } from '@playwright/test';
import { and, eq, ne } from 'drizzle-orm';
import { tasks } from '../../src/modules/tasks/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * "Post again" (completion plan 4.2): Maya's finished wardrobe task opens the posting wizard on its review
 * step, with everything from last time (her saved address too) on the next date that fits, and one more tap
 * posts it as a new open task. The tasks it posts are closed again (before and after), so they don't fill the
 * public "newest open tasks" lists other tests read.
 */

/** Closes Maya's open wardrobe tasks posted by this test (every one but the seeded, finished `tsk_wardrobe`). */
async function closePostedAgain() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const { db, pool } = createDb(process.env.DATABASE_URL ?? '', { max: 1 });
  try {
    await db
      .update(tasks)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(and(eq(tasks.posterUserId, 'usr_maya'), eq(tasks.title, 'Assemble a wardrobe'), eq(tasks.status, 'open'), ne(tasks.id, 'tsk_wardrobe')));
  } finally {
    await pool.end();
  }
  // Changed behind the app's back: the cached public pages read the database again (as after a reseed).
  await fetch(`http://localhost:${process.env.PORT ?? 3000}/dev/cache`, { method: 'POST' }).catch(() => undefined);
}

test.beforeAll(closePostedAgain);
test.afterAll(closePostedAgain);
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
