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
  await page.getByRole('button', { name: 'Send for approval' }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_bookcase\/complete$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Send for approval' })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles(await photo());
  await expect(page.getByRole('img', { name: /./ }).first()).toBeVisible({ timeout: 30_000 });
  // The furniture checklist is optional: tick two of the four (the checkbox, then a row's text).
  await page.getByRole('checkbox', { name: 'It stands level and stable' }).click();
  await page.getByText('Packaging cleared away').click();
  await expect(page.getByRole('checkbox', { name: 'Packaging cleared away' })).toBeChecked();
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_bookcase$/, { timeout: 30_000 });
  await expect(page.getByText('Waiting for Ruth A. to approve.').first()).toBeVisible();

  await devSignIn(page, 'ruth@example.test');
  await page.goto('/app/bookings/bkg_bookcase');
  // Ruth sees what Jordan confirmed before she approves.
  const checklist = page.getByRole('region', { name: 'Checklist' }).first();
  await expect(checklist.getByText('2 of 4 confirmed')).toBeVisible({ timeout: 30_000 });
  await expect(checklist.getByText('It stands level and stable')).toBeVisible();
  await page.getByRole('button', { name: 'Approve task' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve and release payment' }).click();
  await expect(page.getByRole('button', { name: 'Approve task' })).toHaveCount(0, { timeout: 30_000 });

  // A tip for Jordan (UI-057): 15% of the $70 bookcase is $10.50, so $11.00. The test card asks for the bank check.
  const tip = page.getByRole('region', { name: 'Add a tip for Jordan T.' }).first();
  await tip.getByRole('radio', { name: '$11.00 15%' }).click();
  await tip.getByRole('radio', { name: 'Bank verification' }).click();
  await tip.getByRole('button', { name: 'Add a $11.00 tip' }).click();
  const bank = page.getByRole('dialog').or(page.getByRole('alertdialog'));
  await bank.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('You tipped $11.00').first()).toBeVisible({ timeout: 30_000 });

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

  // Jordan sees the tip on the booking and in his earnings, and was told about it.
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/bookings/bkg_bookcase');
  await expect(page.getByText('Tip: $11.00').first()).toBeVisible({ timeout: 30_000 });
  await page.goto('/app/earnings');
  await expect(page.getByRole('article', { name: 'Assemble a bookcase' }).filter({ hasText: 'Tip' }).first()).toContainText('$11.00');
  await page.goto('/app/notifications');
  await expect(page.getByText(/Ruth A\. added a tip of \$11\.00 for Assemble a bookcase/).first()).toBeVisible();
});

test('the problem and completion pages are only for the right person and state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'ben@example.test');
  // Ben's TV booking hasn't been submitted yet.
  await page.goto('/app/bookings/bkg_tv/problem');
  await expect(page.getByText("This report can't be sent now")).toBeVisible();
  // The completion form is the helper's.
  await page.goto('/app/bookings/bkg_tv/complete');
  await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible();
});
