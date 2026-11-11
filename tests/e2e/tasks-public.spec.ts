import { expect, test } from '@playwright/test';

/** The public task board and task page, wired to the seeded open tasks (db/seeds/data/tasks.ts). */
test.describe('public tasks', () => {
  test('the board lists open tasks and filters them from the URL', async ({ page }) => {
    await page.goto('/austin/tasks');
    await expect(page.getByRole('heading', { level: 1, name: 'Open tasks in Austin' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Assemble a desk (flat-pack, 1 item)' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rake and bag front-yard leaves' })).toBeVisible();

    await page.goto('/austin/tasks?category=yard-cleanup');
    await expect(page.getByRole('link', { name: 'Rake and bag front-yard leaves' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Assemble a desk (flat-pack, 1 item)' })).toHaveCount(0);

    await page.goto('/austin/tasks?remote=1');
    await expect(page.getByRole('link', { name: 'Set up a new laptop and move my photos' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rake and bag front-yard leaves' })).toHaveCount(0);
  });

  test('a task page shows the general area and an offer button, never the address', async ({ page }) => {
    await page.goto('/austin/tasks');
    await page.getByRole('link', { name: 'Assemble a desk (flat-pack, 1 item)' }).click();
    await expect(page).toHaveURL(/\/tasks\/assemble-a-desk-mueller-7f3k$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Assemble a desk (flat-pack, 1 item)' })).toBeVisible();
    await expect(page.getByText('Mueller').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Make an offer' })).toHaveAttribute('href', '/app/find-work/tsk_desk');
    const html = await page.content();
    for (const secret of ['1234 Example', 'Apt 2B', 'Buzz 2B', 'Rivera']) expect(html).not.toContain(secret);
  });

  test('home and category pages show recent tasks', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Assemble a desk (flat-pack, 1 item)' })).toBeVisible();
    // Yard cleanup: no other e2e test posts or cancels yard tasks.
    await page.goto('/austin/yard-cleanup');
    await expect(page.getByRole('link', { name: 'Rake and bag front-yard leaves' })).toBeVisible();
  });

  test('unknown tasks are not found', async ({ page }) => {
    const response = await page.goto('/tasks/no-such-task');
    expect(response?.status()).toBe(404);
  });
});
