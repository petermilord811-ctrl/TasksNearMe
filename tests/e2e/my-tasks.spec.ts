import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * The poster's tasks and offers, on the seeded data (reset by the e2e-setup project). Tests that
 * change shared data run in one project each, so the mobile and desktop runs don't collide.
 */
test.describe.configure({ mode: 'serial' });

test('the poster reviews offers and books one', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks');
  await expect(page.getByRole('heading', { level: 1, name: 'My tasks' })).toBeVisible();
  await expect(page.getByText('1 new').first()).toBeVisible();
  await page.getByRole('link', { name: /Assemble a desk \(flat-pack, 1 item\)/ }).first().click();

  await expect(page).toHaveURL(/\/app\/tasks\/tsk_desk$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Assemble a desk (flat-pack, 1 item)' })).toBeVisible();
  await expect(page.getByText('3 offers').first()).toBeVisible();
  // The poster sees their own address; offers never include it.
  await expect(page.getByText('1234 Example Lane').first()).toBeVisible();

  await page.goto('/app/tasks/tsk_desk/offers/off_lee');
  await expect(page.getByRole('heading', { level: 1, name: 'Offer from Lee M.' })).toBeVisible();
  // Lee's phone number is masked before booking.
  expect(await page.content()).not.toContain('512-555-0134');

  await page.goto('/app/tasks/tsk_desk/offers/off_jordan');
  await expect(page.getByText('$66.00').first()).toBeVisible();
  await page.getByRole('button', { name: 'Book helper' }).click();
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_desk\/offers\/off_jordan\/confirm$/);
});

test('the poster declines an offer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks/tsk_desk/offers/off_lee');
  await expect(page.getByRole('heading', { level: 1, name: 'Offer from Lee M.' })).toBeVisible();
  // Wide screens show every action; phones keep the rest under "More".
  const more = page.getByRole('button', { name: 'More' });
  if (await more.isVisible()) await more.click();
  await page.getByRole('button', { name: 'Decline offer' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Decline offer' }).click();
  // The offer is closed: no more actions on it, and the public count drops to the offers in play. "Not selected"
  // first: while the dialog is open the page's buttons are hidden anyway, so their count alone passes before the
  // decline is saved (5.19).
  await expect(page.getByText('Not selected').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Book helper' })).toHaveCount(0);
  await page.goto('/tasks/assemble-a-desk-mueller-7f3k');
  await expect(page.getByText('2 offers').first()).toBeVisible();
});

test('the poster cancels a task with a reason', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'changes shared data; mobile only');
  await devSignIn(page, 'ana@example.test');
  await page.goto('/app/tasks/tsk_cleaning');
  await expect(page.getByRole('heading', { level: 1, name: 'Light cleaning for a 2-bedroom apartment' })).toBeVisible();
  // Phones show the first action ("Invite helpers") and keep the rest under "More".
  const more = page.getByRole('button', { name: 'More' });
  if (await more.isVisible()) await more.click();
  await page.getByRole('button', { name: 'Cancel task' }).first().click();
  await page.getByRole('radio', { name: 'I found help elsewhere' }).check();
  await page.getByRole('button', { name: 'Cancel task' }).last().click();
  await expect(page.getByText(/Canceled/i).first()).toBeVisible();

  await page.goto('/austin/tasks');
  await expect(page.getByRole('link', { name: 'Light cleaning for a 2-bedroom apartment' })).toHaveCount(0);
});

test('other people cannot open someone else’s task', async ({ page }) => {
  await devSignIn(page, 'chris@example.test');
  // The page streams, so the not-found screen arrives after the status line.
  await page.goto('/app/tasks/tsk_desk');
  await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible();
  await expect(page.getByText('1234 Example Lane')).toHaveCount(0);
});
