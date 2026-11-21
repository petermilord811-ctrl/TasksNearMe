import { expect, test } from '@playwright/test';
import { inProgressBookcase } from './support/scenarios';
import { devSignIn } from './support/sign-in';
import sharp from 'sharp';

/**
 * Completing the work and approving it (UI-013). The flow runs on its own copy of Ruth's in-progress bookcase with
 * Jordan (support/scenarios.ts), so a retry or a repeat starts over instead of finding the work already sent (Ship
 * 44897520559). Problem reports are covered by integration tests; here only the page's guard is checked.
 */

/** A small JPEG made at test time; the server re-encodes it. */
async function photo() {
  const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#7a9e7e' } }).jpeg().toBuffer();
  return { name: 'bookcase.jpg', mimeType: 'image/jpeg', buffer };
}

test('the helper sends the finished work and the client approves it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'one project is enough');
  test.setTimeout(150_000);
  const booking = await inProgressBookcase('completion');
  const hub = `/app/bookings/${booking.bookingId}`;
  await devSignIn(page, 'jordan@example.test');
  await page.goto(hub);
  await page.getByRole('button', { name: 'Send for approval' }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`${hub}/complete$`), { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Send for approval' })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles(await photo());
  // The upload is done when its photo shows; until then the form's fields are disabled.
  await expect(page.getByRole('img', { name: 'Uploaded photo 1' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Photo uploaded.')).toBeVisible();
  // The furniture checklist is optional: tick two of the four (the checkbox, then a row's text), each one shown
  // ticked before the work goes.
  const level = page.getByRole('checkbox', { name: 'It stands level and stable' });
  const packaging = page.getByRole('checkbox', { name: 'Packaging cleared away' });
  await level.click();
  await expect(level).toBeChecked();
  await page.getByText('Packaging cleared away').click();
  await expect(packaging).toBeChecked();
  await expect(level).toBeChecked();
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page).toHaveURL(new RegExp(`${hub}$`), { timeout: 30_000 });
  await expect(page.getByText('Waiting for Ruth A. to approve.').first()).toBeVisible();

  await devSignIn(page, 'ruth@example.test');
  await page.goto(hub);
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
  await expect(page).toHaveURL(new RegExp(`${hub}/review$`), { timeout: 30_000 });
  await page.getByRole('radio', { name: '5 of 5 stars' }).check({ force: true });
  await page.getByRole('button', { name: 'Send review' }).click();
  await expect(page).toHaveURL(new RegExp(`${hub}$`), { timeout: 30_000 });

  // Save Jordan, then find him in saved helpers. Saved helpers are Ruth's own, not the booking's: a copy of this test
  // that ran first (a retry, or a repeat beside it) may have saved him already.
  await expect(page.getByText('You tipped $11.00').first()).toBeVisible({ timeout: 30_000 });
  const save = page.getByRole('button', { name: 'Save helper' }).filter({ visible: true });
  if ((await save.count()) > 0) await save.first().click();
  await expect(page.getByRole('button', { name: 'Save helper' })).toHaveCount(0, { timeout: 30_000 });
  await page.goto('/app/saved');
  await expect(page.getByText('Jordan T.').first()).toBeVisible();

  // Jordan sees the tip on the booking and in his earnings, and was told about it.
  await devSignIn(page, 'jordan@example.test');
  await page.goto(hub);
  await expect(page.getByText('Tip: $11.00').first()).toBeVisible({ timeout: 30_000 });
  await page.goto('/app/earnings');
  await expect(page.getByRole('article', { name: booking.title }).filter({ hasText: 'Tip' }).first()).toContainText('$11.00');
  await page.goto('/app/notifications');
  await expect(page.getByText(`Ruth A. added a tip of $11.00 for ${booking.title}`).first()).toBeVisible();
});

test('a press on a checklist box half behind the Send for approval bar still ticks it', async ({ page }, testInfo) => {
  // Ship 44897520559 lost a tick this way: the press focused the box, the page scrolled it clear of the bar before the
  // release, and the click landed beside it. The scroll now waits until the click has landed (useKeepFocusAboveBar).
  await devSignIn(page, 'jordan@example.test');
  // The seeded bookcase stays in progress all run (the flow above uses its own copy); nothing is sent here.
  await page.goto('/app/bookings/bkg_bookcase/complete');
  // Pressed before the page has hydrated, the box has no handler yet: wait until the gated controls come alive. The
  // earnings, worked out just after the page opens, may still be on their way: they never lock the box.
  await expect(page.locator('[data-hydrating]')).toHaveCount(0, { timeout: 30_000 });
  const level = page.getByRole('checkbox', { name: 'It stands level and stable' });
  await expect(level).not.toBeChecked();
  const send = await page.getByRole('button', { name: 'Send for approval' }).elementHandle();
  // The box across the bar's top edge: its centre just above it, its lower part behind it.
  const target = await level.evaluate((box, button) => {
    const bar = (button as HTMLElement).parentElement!;
    const before = box.getBoundingClientRect();
    window.scrollBy({ top: before.top + before.height / 2 - (bar.getBoundingClientRect().top - 3), behavior: 'instant' });
    const after = box.getBoundingClientRect();
    return { x: after.left + after.width / 2, y: after.top + after.height / 2, bottom: after.bottom, barTop: bar.getBoundingClientRect().top };
  }, send);
  expect(target.y).toBeLessThan(target.barTop);
  expect(target.bottom).toBeGreaterThan(target.barTop);
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  await expect(level).toBeChecked();
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
