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
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});

test('trust and safety hide a task from the public pages and restore it; the audit log shows both', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(240_000);
  await page.goto('/tasks/sweep-and-tidy-a-patio-windsor-park-7h3w');
  await expect(page.getByRole('heading', { level: 1, name: 'Sweep and tidy a patio' })).toBeVisible();

  await staffSignIn(page, 'taylor@example.test');
  await page.goto('/admin/tasks/tsk_patio');
  await expect(page.getByRole('heading', { level: 1, name: 'Sweep and tidy a patio' })).toBeVisible();
  await page.getByRole('button', { name: 'Hide task' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('Reason').fill('Checking the planters for anything unsafe before it goes back up.');
  await dialog.getByRole('button', { name: 'Hide task' }).click();
  await expect(page.getByText('Saved. The task is updated.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Hidden from the public' })).toBeVisible();

  await page.goto('/tasks/sweep-and-tidy-a-patio-windsor-park-7h3w');
  await expect(page.getByText(/could not be found/i)).toBeVisible();

  await page.goto('/admin/tasks/tsk_patio');
  await page.getByRole('button', { name: 'Restore task' }).click();
  await page.getByRole('alertdialog').getByLabel('Reason').fill('Nothing unsafe; the poster confirmed the details.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore task' }).click();
  await expect(page.getByText('Saved. The task is updated.')).toBeVisible({ timeout: 30_000 });
  await page.goto('/tasks/sweep-and-tidy-a-patio-windsor-park-7h3w');
  await expect(page.getByRole('heading', { level: 1, name: 'Sweep and tidy a patio' })).toBeVisible();

  await staffSignIn(page, 'morgan@example.test');
  await page.goto('/admin/audit?targetType=task&targetId=tsk_patio');
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
  await expect(page.getByText('task.restore').first()).toBeVisible();
  await expect(page.getByText('task.hide').first()).toBeVisible();
  await expect(page.getByText('Checking the planters for anything unsafe before it goes back up.').first()).toBeVisible();
});
