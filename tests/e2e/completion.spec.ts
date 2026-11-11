import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';
import sharp from 'sharp';

/**
 * Completing the work and approving it (UI-013) on the seeded in-progress booking: Ruth's bookcase with
 * Jordan. The e2e setup reseeds it each run. Problem reports are covered by integration tests; here only
 * the page's guard is checked.
 */

/** A small JPEG made at test time; the server re-encodes it. */
async function photo() {
  const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#7a9e7e' } }).jpeg().toBuffer();
  return { name: 'bookcase.jpg', mimeType: 'image/jpeg', buffer };
}

test('the helper sends the finished work and the client approves it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/bookings/bkg_bookcase');
  await page.getByRole('button', { name: 'Submit completed task' }).first().click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_bookcase\/complete$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Mark the work complete' })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles(await photo());
  await expect(page.getByRole('img', { name: /./ }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_bookcase$/, { timeout: 30_000 });
  await expect(page.getByText('Waiting for Ruth A. to approve.').first()).toBeVisible();

  await devSignIn(page, 'ruth@example.test');
  await page.goto('/app/bookings/bkg_bookcase');
  await page.getByRole('button', { name: 'Approve task' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('button', { name: 'Approve task' })).toHaveCount(0, { timeout: 30_000 });

  // Review Jordan (UI-015): stays hidden until he reviews too.
  await page.getByRole('button', { name: 'Leave a review' }).first().click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_bookcase\/review$/, { timeout: 30_000 });
  await page.getByRole('radio', { name: '5 of 5 stars' }).check({ force: true });
  await page.getByRole('button', { name: 'Send review' }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_bookcase$/, { timeout: 30_000 });

  // Save Jordan, then find him in saved helpers.
  await page.getByRole('button', { name: 'Save helper' }).first().click();
  await expect(page.getByRole('button', { name: 'Save helper' })).toHaveCount(0, { timeout: 30_000 });
  await page.goto('/app/saved');
  await expect(page.getByText('Jordan T.').first()).toBeVisible();
});

test('the problem and completion pages are only for the right person and state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'ben@example.test');
  // Ben's TV booking hasn't been submitted yet.
  await page.goto('/app/bookings/bkg_tv/problem');
  await expect(page.getByText("This report can't be sent now")).toBeVisible();
  // The completion form is the helper's.
  await page.goto('/app/bookings/bkg_tv/complete');
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});
