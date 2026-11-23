import { expect, test, type Page } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { closeTask, openTask, saveHelperFor, unsaveHelperFor } from './support/scenarios';
import { devSignIn, submitEmailStep } from './support/sign-in';

/**
 * More pages that open over the page they're reached from (2026-11-23, owner: "I hate to redirect to new pages
 * continually"): the bell's notifications, a receipt, an offer, Invite helpers, and a task from the helper's side. The
 * same URL loaded on its own is still the full page (account.spec, money.spec, my-tasks.spec, find-work.spec), and a
 * rebook proposal's dialog is booked for real in rebook.spec and series.spec.
 */

const bell = (page: Page) => page.getByRole('banner').getByRole('link', { name: /^Notifications/ });

/** The action bar renders a desktop and a phone copy of each action: the one on screen. */
function action(page: Page, name: string) {
  return page.getByRole('button', { name }).or(page.getByRole('link', { name })).filter({ visible: true }).first();
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the bell opens the notifications over the page; a notification closes them and opens its page', async ({ page }) => {
  test.setTimeout(120_000);
  await devSignIn(page, 'ben@example.test');
  await page.goto('/app/payments');
  const payments = page.getByRole('heading', { level: 1, name: 'Payments' });
  await expect(payments).toBeVisible({ timeout: 30_000 });

  await bell(page).click();
  const dialog = page.getByRole('dialog', { name: 'Notifications' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/app\/notifications\/recent$/);
  // The page is still there underneath, hidden from the accessibility tree while the dialog is open.
  await expect(page.locator('h1', { hasText: 'Payments' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/payments$/);
  await expect(payments).toBeVisible();

  // Seeded: the start reminder for Ben's booking. It closes the dialog, then its booking opens.
  await bell(page).click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('link', { name: /Anchor a tall bookshelf to the wall starts soon, on / }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_tv$/, { timeout: 30_000 });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Anchor a tall bookshelf to the wall' })).toBeVisible({ timeout: 30_000 });
  // Back: the page the bell was on.
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/payments$/, { timeout: 30_000 });
  await expect(dialog).toHaveCount(0);
});

test('a receipt opens over the payments list, and prints on its own', async ({ page }) => {
  test.setTimeout(120_000);
  await devSignIn(page, 'ben@example.test');
  await page.goto('/app/payments');
  const payments = page.getByRole('heading', { level: 1, name: 'Payments' });
  await expect(payments).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: 'Anchor a tall bookshelf to the wall' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Receipt' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/app\/payments\/bkg_tv$/);
  await expect(dialog.getByText('$84.00').first()).toBeVisible();

  // On paper: the receipt alone (not the list under it, nor the Print button).
  await page.emulateMedia({ media: 'print' });
  await expect(dialog.locator('[data-print-receipt]')).toBeVisible();
  await expect(page.locator('main h1', { hasText: 'Payments' })).toBeHidden();
  await expect(dialog.getByRole('button', { name: 'Print' })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/payments$/);
  await expect(payments).toBeVisible();
});

test('an offer opens over its task, and Book goes on to checkout over the task', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(240_000);
  const task = await openTask('dialog-offer');
  try {
    // Jordan offers on it (paid directly, the form's default).
    await devSignIn(page, 'jordan@example.test');
    await page.goto(`/app/find-work/${task.taskId}`);
    await expect(page.getByRole('heading', { level: 1, name: task.title })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Message to the client').fill('I can assemble it on the day, and I bring my own tools.');
    await page.getByRole('button', { name: 'Send offer' }).click();
    await expect(page.getByRole('heading', { name: 'Your offer' })).toBeVisible({ timeout: 30_000 });

    await devSignIn(page, 'chris@example.test');
    await page.goto(`/app/tasks/${task.taskId}`);
    const title = page.getByRole('heading', { level: 1, name: task.title });
    await expect(title).toBeVisible({ timeout: 30_000 });
    const offerLink = page.locator(`a[href*="/app/tasks/${task.taskId}/offers/off_"]`).filter({ visible: true }).first();
    await offerLink.click();
    const offer = page.getByRole('dialog', { name: 'Offer from Jordan T.' });
    await expect(offer).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`/app/tasks/${task.taskId}/offers/off_[^/]+/view$`));
    // The task is still there underneath.
    await expect(page.locator('h1', { hasText: task.title })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(offer).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/app/tasks/${task.taskId}$`));
    await expect(title).toBeVisible();

    // Book: checkout opens over the task in the offer's place; closing it is back on the task.
    await offerLink.click();
    await expect(offer).toBeVisible({ timeout: 30_000 });
    await offer.getByRole('button', { name: 'Book helper' }).click();
    // The offer's own page stays a page (checkout opens over it): only its dialog has an address of its own.
    const checkout = page.getByRole('dialog', { name: 'Confirm your booking' });
    await expect(checkout).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`/app/tasks/${task.taskId}/offers/off_[^/]+/confirm$`));
    await expect(offer).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(checkout).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/app/tasks/${task.taskId}$`));
    await expect(title).toBeVisible();
  } finally {
    await closeTask(task.taskId);
  }
});

test('Invite helpers opens the saved helpers over the task; Request opens the request with the task chosen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  const task = await openTask('dialog-invite');
  const saved = await saveHelperFor('usr_chris', 'usr_jordan');
  try {
    await devSignIn(page, 'chris@example.test');
    await page.goto(`/app/tasks/${task.taskId}`);
    const title = page.getByRole('heading', { level: 1, name: task.title });
    await expect(title).toBeVisible({ timeout: 30_000 });

    await action(page, 'Invite helpers').click();
    const invite = page.getByRole('dialog', { name: 'Invite helpers' });
    await expect(invite).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`/app/tasks/${task.taskId}/invite$`));
    await expect(page.locator('h1', { hasText: task.title })).toHaveCount(1);

    await invite.getByRole('link', { name: 'Request Jordan T.' }).click();
    const request = page.getByRole('dialog', { name: 'Ask Jordan T. to help' });
    await expect(request).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`/app/helpers/jordan-t/request\\?task=${task.taskId}$`));
    await expect(invite).toHaveCount(0);
    await expect(request.getByRole('radio', { name: new RegExp(escaped(task.title)) })).toBeChecked();
    // Closing it is back on the task, not on the list.
    await page.keyboard.press('Escape');
    await expect(request).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/app/tasks/${task.taskId}$`));
    await expect(title).toBeVisible();
  } finally {
    if (saved) await unsaveHelperFor('usr_chris', 'usr_jordan');
    await closeTask(task.taskId);
  }
});

test('Make an offer on the public task page opens the task over it, with the offer form', async ({ page }) => {
  test.setTimeout(120_000);
  const task = await openTask(`dialog-public-${test.info().project.name}`);
  const publicPath = `/tasks/${task.taskId.replaceAll('_', '-')}`;
  try {
    await devSignIn(page, 'jordan@example.test');
    await page.goto(publicPath);
    await expect(page.getByRole('heading', { level: 1, name: task.title })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Make an offer' }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog', { name: task.title });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`/app/find-work/${task.taskId}/offer$`));
    await expect(dialog.getByRole('button', { name: 'Send offer' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${publicPath}$`));
  } finally {
    await closeTask(task.taskId);
  }
});

/** The newest sign-in code sent to `to` (the dev outbox), or null. */
async function newestCode(context: BrowserContext, to: string): Promise<string | null> {
  const outbox = await context.newPage();
  try {
    await outbox.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
    const body = await outbox.locator(`[data-testid="outbox-message"][data-to="${to}"][data-tag="sign-in-code"] pre`).first().textContent({ timeout: 5_000 }).catch(() => null);
    return body?.match(/\b(\d{6})\b/)?.[1] ?? null;
  } finally {
    await outbox.close();
  }
}

test('signing in on the way to a receipt lands on its page, never a dialog over the sign-in page', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'a sign-in code per run; one project is enough');
  test.setTimeout(120_000);
  // An email's link to a receipt, signed out: sign in first, then on to the receipt. It has a dialog version (over the
  // payments list), which signing in, going on with the router, used to open over the sign-in page.
  await page.goto('/app/payments/bkg_tv');
  await expect(page).toHaveURL(/\/sign-in\?next=/, { timeout: 30_000 });
  const before = await newestCode(context, 'ben@example.test');
  await submitEmailStep(page, 'ben@example.test');
  let code: string | null = null;
  await expect.poll(async () => (code = await newestCode(context, 'ben@example.test')), { timeout: 20_000 }).not.toBe(before);
  await page.locator('input[autocomplete="one-time-code"]').filter({ visible: true }).first().fill(code!);
  await expect(page).toHaveURL(/\/app\/payments\/bkg_tv$/, { timeout: 30_000 });
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Receipt' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
