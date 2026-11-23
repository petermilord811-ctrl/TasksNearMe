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
    // The price card's link, and on phones also the bar at the bottom of the screen (2026-11-23).
    const offers = page.getByRole('link', { name: 'Make an offer' });
    await expect(offers.first()).toBeVisible();
    for (const link of await offers.all()) await expect(link).toHaveAttribute('href', '/app/find-work/tsk_desk');
    // Signed out: the photos and the whole description wait behind sign-in.
    await expect(page.getByRole('region', { name: 'The full task' })).toBeVisible();
    const html = await page.content();
    for (const secret of ['1234 Example', 'Apt 2B', 'Buzz 2B', 'Rivera']) expect(html).not.toContain(secret);
  });

  test('home and category pages show recent tasks', async ({ page }) => {
    // The landing shows the first city's (Gainesville's) recent tasks.
    await page.goto('/');
    // Its list row (the map pin links to the same page).
    await expect(page.getByRole('link', { name: /^Assemble a tall bookcase Furniture assembly/ })).toBeVisible();
    // Yard cleanup: no other e2e test posts or cancels yard tasks.
    await page.goto('/austin/yard-cleanup');
    await expect(page.getByRole('link', { name: 'Rake and bag front-yard leaves' })).toBeVisible();
  });

  test('unknown tasks are not found', async ({ page }) => {
    const response = await page.goto('/tasks/no-such-task');
    expect(response?.status()).toBe(404);
  });

  test("a board or job hub of a city that isn't open, or of a category it lacks, answers a real 404", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'app-desktop', 'status codes only; one project is enough');
    // The status, not only the page: the check runs before the 200 streams. An unknown city takes the same path as a
    // paused one (Austin in production; the test world keeps it open).
    for (const path of ['/nowhere/tasks', '/es/nowhere/tasks', '/nowhere/tasks/moving-help', '/gainesville/tasks/no-such-category']) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
    expect((await request.get('/gainesville/tasks/moving-help')).status()).toBe(200);
  });
});
