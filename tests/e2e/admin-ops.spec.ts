import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Staff tools (UI-033) on the seeded data: the bookings list finds Ana's disputed dresser; trust and safety
 * hide the seeded patio task (it leaves the public pages) and restore it; the audit log shows both, for a
 * lead, and not for an agent.
 */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('staff find a booking that needs attention and open its task', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  test.setTimeout(150_000);
  await staffSignIn(page, 'alex@example.test');
  await page.goto('/admin/bookings');
  await expect(page.getByRole('heading', { level: 1, name: 'Bookings' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Needs attention/ })).toHaveAttribute('aria-current', 'page');
  const search = page.getByRole('search', { name: 'Search bookings' });
  await search.getByRole('searchbox').fill('ana@example.test');
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/\/admin\/bookings\?filter=attention&q=ana%40example\.test$/, { timeout: 30_000 });
  // Phones get cards (role queries skip the hidden desktop table).
  await expect(page.getByRole('listitem').filter({ hasText: 'Assemble a dresser' }).first().getByText('Disputed')).toBeVisible();
  // Phones get cards, desktops a table: the role query skips the hidden one.
  await page.getByRole('link', { name: 'Assemble a dresser' }).first().click();
  await expect(page).toHaveURL(/\/admin\/bookings\/bkg_dresser$/, { timeout: 30_000 });
  await page.getByRole('link', { name: 'Open the task' }).click();
  await expect(page).toHaveURL(/\/admin\/tasks\/tsk_dresser$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Assemble a dresser' })).toBeVisible();
  // An agent reads; moderation is for trust and safety, leads and admins.
  await expect(page.getByText('You can view this task.')).toBeVisible();
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible();
});

/**
 * The patio task's public page shows the task, or "not found". It's cached: right after a change (or a reseed,
 * which doesn't touch the cache) one reload may still serve the previous state while it refreshes in the
 * background (measured: half a second after a restore it still said "not found", two seconds later the task).
 */
async function publicPageShows(page: Page, state: 'task' | 'not found') {
  await expect(async () => {
    await page.goto('/tasks/sweep-and-tidy-a-patio-windsor-park-7h3w');
    const heading = state === 'task' ? page.getByRole('heading', { level: 1, name: 'Sweep and tidy a patio' }) : page.getByRole('heading', { name: /could not be found/i });
    await expect(heading).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

test('trust and safety hide a task from the public pages and restore it; the audit log shows both', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(240_000);
  // The public page is cached and a reseed doesn't touch that cache, so one reload may show the state a previous
  // run left (refreshed in the background); each public check reloads until it settles (see `publicPageShows`).
  await publicPageShows(page, 'task');

  await staffSignIn(page, 'taylor@example.test');
  await page.goto('/admin/tasks/tsk_patio');
  await expect(page.getByRole('heading', { level: 1, name: 'Sweep and tidy a patio' })).toBeVisible();
  await page.getByRole('button', { name: 'Hide task' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('Reason').fill('Checking the planters for anything unsafe before it goes back up.');
  await dialog.getByRole('button', { name: 'Hide task' }).click();
  await expect(page.getByText('Saved. The task is updated.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Hidden from the public' })).toBeVisible();

  await publicPageShows(page, 'not found');

  await page.goto('/admin/tasks/tsk_patio');
  await page.getByRole('button', { name: 'Restore task' }).click();
  await page.getByRole('alertdialog').getByLabel('Reason').fill('Nothing unsafe; the poster confirmed the details.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore task' }).click();
  await expect(page.getByText('Saved. The task is updated.')).toBeVisible({ timeout: 30_000 });
  await publicPageShows(page, 'task');

  await staffSignIn(page, 'morgan@example.test');
  await page.goto('/admin/audit?targetType=task&targetId=tsk_patio');
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
  await expect(page.getByText('task.restore').first()).toBeVisible();
  await expect(page.getByText('task.hide').first()).toBeVisible();
  await expect(page.getByText('Checking the planters for anything unsafe before it goes back up.').first()).toBeVisible();
});

test('finance sees the money: totals, what needs a look, and charges searched by email', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  test.setTimeout(150_000);
  await staffSignIn(page, 'casey@example.test');
  await page.goto('/admin/payments');
  await expect(page.getByRole('heading', { level: 1, name: 'Payments' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Last 30 days' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Needs a look/ })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: /^Charges/ }).click();
  await expect(page).toHaveURL(/\/admin\/payments\?tab=charges$/, { timeout: 30_000 });
  const search = page.getByRole('search', { name: 'Search payments' });
  await search.getByRole('searchbox').fill('ben@example.test');
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/tab=charges&q=ben%40example\.test$/, { timeout: 30_000 });
  // Ben paid $88.00 for the TV (seeded).
  await expect(page.getByRole('listitem').filter({ hasText: 'Anchor a tall bookshelf to the wall' }).first().getByText('$88.00')).toBeVisible();
});

test('an admin adds a role and removes it; the audit log keeps both', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  await staffSignIn(page, 'riley@example.test');
  await page.goto('/admin/staff');
  await expect(page.getByRole('heading', { level: 1, name: 'Staff' })).toBeVisible();
  const grant = page.getByRole('form', { name: 'Add a role' });
  await grant.getByLabel('Email').fill('taylor@example.test');
  await grant.getByLabel('Role').selectOption('finance');
  await grant.getByLabel('Reason').fill('Covering the finance queue this week.');
  await grant.getByRole('button', { name: 'Add the role' }).click();
  await expect(grant.getByText('Role added.')).toBeVisible({ timeout: 30_000 });

  const taylor = page.getByRole('listitem').filter({ hasText: 'taylor@example.test' });
  await taylor.getByRole('button', { name: 'Remove Finance' }).click();
  await page.getByRole('alertdialog').getByLabel('Reason').fill('The finance queue is covered again.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove Finance' }).click();
  await expect(page.getByText('Role removed.')).toBeVisible({ timeout: 30_000 });
  await expect(taylor.getByRole('button', { name: 'Remove Finance' })).toHaveCount(0);

  await page.goto('/admin/audit?action=staff');
  await expect(page.getByText('staff.remove_role').first()).toBeVisible();
  await expect(page.getByText('Covering the finance queue this week.').first()).toBeVisible();
});

test('an admin sees the policy in use and turns a flag on and off', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  await staffSignIn(page, 'riley@example.test');
  await page.goto('/admin/config');
  await expect(page.getByRole('heading', { level: 1, name: 'Config' })).toBeVisible();
  await expect(page.getByText('Version 1, in use')).toBeVisible();
  const form = page.getByRole('form', { name: 'Publish a new version' });
  await expect(form.getByLabel('Client fee (%)')).toHaveValue('10');

  // `recurring` is off at launch (phase 2) and nothing reads it yet.
  await page.getByRole('button', { name: 'Turn on recurring' }).click();
  await page.getByRole('alertdialog').getByLabel('Reason').fill('Checking the flag tools work.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Turn on recurring' }).click();
  await expect(page.getByText('Saved. The flag is updated.')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Turn off recurring' }).click();
  await page.getByRole('alertdialog').getByLabel('Reason').fill('Back off until phase 2.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Turn off recurring' }).click();
  await expect(page.getByRole('button', { name: 'Turn on recurring' })).toBeVisible({ timeout: 30_000 });
});
