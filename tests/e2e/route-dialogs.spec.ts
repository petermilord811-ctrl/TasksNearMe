import { expect, test, type Page } from '@playwright/test';
import { confirmedBooking, submittedBooking } from './support/scenarios';
import { devSignIn } from './support/sign-in';

/**
 * Pages that open as a dialog over the page they're reached from (src/app/[locale]/@modal): reporting something,
 * saving or editing a search, and a booking's review, problem report, change and new proposal. The page underneath
 * stays where it was; Back, Escape and Cancel close the dialog; sending closes it and the page underneath shows the
 * result. The same URL loaded on its own (a refresh, a link from an email) is still the full page.
 */

/** The action bar renders a desktop and a phone copy of each action: the one on screen. */
function action(page: Page, name: string) {
  return page.getByRole('button', { name }).or(page.getByRole('link', { name })).filter({ visible: true }).first();
}

test('a problem report opens over the booking: Back, Forward and Escape, then sending updates the booking', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  const scenario = await submittedBooking('dialog-problem');
  const hub = `/app/bookings/${scenario.bookingId}`;
  await devSignIn(page, 'chris@example.test');
  await page.goto(hub);
  const title = page.getByRole('heading', { level: 1, name: scenario.title });
  await expect(title).toBeVisible({ timeout: 30_000 });

  await action(page, 'Report a problem').click();
  const dialog = page.getByRole('dialog', { name: 'Report a problem' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`${hub}/problem$`));
  await expect(dialog.getByRole('heading', { level: 1, name: 'Report a problem' })).toBeVisible();
  // The booking is still there underneath, hidden from the accessibility tree while the dialog is open.
  await expect(page.locator('h1', { hasText: scenario.title })).toHaveCount(1);
  await expect(title).toHaveCount(0);

  // Back closes it and the booking is as it was; Forward opens it again; Escape closes it.
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${hub}$`));
  await expect(title).toBeVisible();
  await page.goForward();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${hub}$`));

  // Sending closes it over the booking, which then shows the problem.
  await action(page, 'Report a problem').click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('radio', { name: "The work isn't finished" }).click();
  await dialog.getByLabel('What happened?').fill('Two drawers still stick and one handle is missing.');
  await dialog.getByRole('button', { name: 'Report the problem' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Send report' }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`${hub}$`));
  await expect(page.getByText('Your problem was reported. Support will review what happened.').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Problem reported' })).toBeVisible({ timeout: 30_000 });

  // The URL on its own: the full page.
  await page.goto(`${hub}/problem`);
  await expect(page.getByRole('heading', { level: 1, name: 'Report a problem' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a change is proposed in a dialog over the booking, which then shows it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  const scenario = await confirmedBooking('dialog-change', 6000);
  const hub = `/app/bookings/${scenario.bookingId}`;
  await devSignIn(page, 'chris@example.test');
  await page.goto(hub);
  await expect(page.getByRole('heading', { level: 1, name: scenario.title })).toBeVisible({ timeout: 30_000 });

  await action(page, 'Propose a change').click();
  const dialog = page.getByRole('dialog', { name: 'Propose a change' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`${hub}/changes/new$`));
  await dialog.getByLabel('Task price (USD)').fill('70');
  await dialog.getByLabel('Message').fill('Could you also take the box away?');
  // $60 → $70: Chris's total goes from $66.00 to $77.00.
  await expect(dialog.getByText('$11.00').first()).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole('button', { name: 'Send change' }).click();
  await page.getByRole('alertdialog', { name: 'Send this change?' }).getByRole('button', { name: 'Send change' }).click();

  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`${hub}$`));
  const change = page.getByRole('region', { name: 'Change request' });
  await expect(change.getByText('You proposed a change: waiting for Jordan T.')).toBeVisible({ timeout: 30_000 });
  await expect(change.getByRole('link', { name: 'View change' })).toBeVisible();
});

test('reporting a profile opens over it, survives a refresh of the page under it, and gives focus back', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await devSignIn(page, 'chris@example.test');
  await page.goto('/helpers/sam-k');
  const profile = page.getByRole('heading', { level: 1, name: 'Sam K.' });
  await expect(profile).toBeVisible({ timeout: 30_000 });
  const report = page.getByRole('link', { name: 'Report this profile' });
  await report.click();

  const dialog = page.getByRole('dialog', { name: 'Report a helper' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/app\/report\/helper\/sam-k$/);
  await expect(dialog.getByRole('radio', { name: 'Something else' })).toBeVisible();
  if (testInfo.project.name === 'app-mobile') {
    // On a phone it's a sheet from the bottom of the screen.
    const height = page.viewportSize()?.height ?? 0;
    await expect.poll(async () => {
      const box = await dialog.boundingBox();
      return box ? Math.round(box.y + box.height) : 0;
    }, { timeout: 10_000 }).toBe(height);
  }

  // A refresh while it's open (a live notice does this) keeps the dialog and the page under it.
  await dialog.getByRole('textbox', { name: 'Details' }).fill('Kept through a refresh');
  const refreshed = page.waitForResponse((response) => response.url().includes('/app/report/helper/sam-k') && response.request().headers()['rsc'] === '1');
  await page.evaluate(() => (window as unknown as { next: { router: { refresh: () => void } } }).next.router.refresh());
  await refreshed;
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Details' })).toHaveValue('Kept through a refresh');
  await expect(page.locator('h1', { hasText: 'Sam K.' })).toHaveCount(1);

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/helpers\/sam-k$/);
  await expect(profile).toBeVisible();
  // Focus goes back to the link that opened it (a tap on a phone doesn't focus a link to begin with).
  if (testInfo.project.name === 'app-desktop') await expect(report).toBeFocused();

  // Another dialog in the same visit (the router keeps the first one's screen hidden): named by its own title.
  await page.getByRole('link', { name: /^Report this review by / }).first().click();
  const review = page.getByRole('dialog', { name: 'Report a review' });
  await expect(review).toBeVisible({ timeout: 30_000 });
  await expect(review.getByRole('heading', { level: 1, name: 'Report a review' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
  await expect(page).toHaveURL(/\/helpers\/sam-k$/);

  // The URL on its own: the full page.
  await page.goto('/app/report/helper/sam-k');
  await expect(page.getByRole('heading', { level: 1, name: 'Report a helper' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
