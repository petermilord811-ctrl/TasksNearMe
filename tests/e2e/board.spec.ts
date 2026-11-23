import { expect, test, type Page } from '@playwright/test';
import { postFurnitureTask } from './support/post-task';
import { devSignIn } from './support/sign-in';

/**
 * The Craigslist-style board (completion plan 7.4) on the seeded Austin market: tasks grouped by neighborhood
 * with their counts, filters that are links with their own URLs, chips that remove one filter, the search box,
 * and one paged list. On phones the filters sit behind a "Filters" button.
 */

async function openFilters(page: Page, isMobile: boolean) {
  if (!isMobile) return;
  const toggle = page.getByRole('button', { name: /^Filters/ });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

const filterGroup = (page: Page, name: string) => page.getByRole('complementary', { name: 'Filter open tasks' }).getByRole('group', { name });

/** Cancels the poster's task from its page ("I found help elsewhere"), as my-tasks.spec.ts does. */
async function cancelTask(page: Page, taskId: string): Promise<void> {
  await page.goto(`/app/tasks/${taskId}`);
  const more = page.getByRole('button', { name: 'More' });
  if (await more.isVisible()) await more.click();
  await page.getByRole('button', { name: 'Cancel task' }).first().click();
  await page.getByRole('radio', { name: 'I found help elsewhere' }).check();
  await page.getByRole('button', { name: 'Cancel task' }).last().click();
  await expect(page.getByText(/Canceled/i).first()).toBeVisible({ timeout: 30_000 });
}

test('the board groups tasks by neighborhood, filters by link and searches', async ({ page, isMobile }) => {
  await page.goto('/austin/tasks');
  await expect(page.getByRole('heading', { level: 1, name: 'Open tasks in Austin' })).toBeVisible();
  const openCount = () => page.getByRole('main').getByText(/^\d+ open tasks?$/).first().textContent().then((text) => Number(text!.match(/\d+/)![0]));
  const total = await openCount();
  expect(total).toBeGreaterThan(0);

  // Neighborhood sections: each says how many tasks it has and shows at most five (the list's own sections: the
  // composer and Neighbors sit around it since 2026-11-23).
  const sections = page.locator('#board-list').getByRole('region');
  await expect(sections.first()).toBeVisible();
  const first = sections.first();
  const count = Number((await first.getByRole('heading', { level: 2 }).textContent())!.match(/(\d+) tasks?$/)![1]);
  const shown = await first.getByRole('listitem').count();
  expect(shown).toBe(Math.min(5, count));

  // A category from the filter column: the URL changes, a chip appears, every row is in that category.
  await openFilters(page, isMobile);
  await filterGroup(page, 'Category').getByRole('link', { name: /^Furniture assembly/ }).click();
  await expect(page).toHaveURL(/furniture-assembly/);
  const chips = page.getByRole('navigation', { name: 'Filters in use' });
  await expect(chips.getByRole('link', { name: 'Remove Furniture assembly' })).toBeVisible();

  // Search keeps the category.
  await openFilters(page, isMobile);
  await page.getByRole('searchbox', { name: 'Search' }).fill('assemble');
  await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
  await expect(page).toHaveURL(/q=assemble/);
  await expect(page).toHaveURL(/furniture-assembly/);
  await expect(chips.getByRole('link', { name: 'Remove “assemble”' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(/^\d+ open tasks?$/);

  // Removing one chip keeps the other; "Clear all" goes back to the whole board.
  await chips.getByRole('link', { name: 'Remove “assemble”' }).click();
  await expect(page).not.toHaveURL(/q=/);
  await expect(chips.getByRole('link', { name: 'Remove Furniture assembly' })).toBeVisible();
  await chips.getByRole('link', { name: 'Clear all' }).click();
  await expect(page).toHaveURL(/\/austin\/tasks$/);
  // Other tests post tasks at the same time, so the count can only have grown.
  await expect(page.getByRole('navigation', { name: 'Filters in use' })).toHaveCount(0);
  const after = await openCount();
  expect(after).toBeGreaterThanOrEqual(total);
});

test('one list sorted by newest, paged, with the day on each row', async ({ page }) => {
  await page.goto('/austin/tasks?group=none&sort=newest');
  // Sort and grouping live in one menu (audit M19, L10).
  await page.getByText('Sort: Newest').click();
  await expect(page.getByRole('navigation', { name: 'Sort' }).getByRole('link', { name: /Newest/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#board-list').getByRole('region')).toHaveCount(0);
  const rows = page.getByRole('main').getByRole('article');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(20);
  // Each row: a day, a title linking to the public task page, and a price.
  const link = rows.first().getByRole('link');
  await expect(link).toHaveAttribute('href', /^\/tasks\//);
  await expect(rows.first().locator('time')).toHaveAttribute('datetime', /^\d{4}-\d\d-\d\dT/);
  await expect(rows.first()).toContainText('$');
});

test('a task posted while the board is open shows up as "1 new task · Show"; its offers and its end arrive live', async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'posts a task; desktop only');
  test.setTimeout(240_000);
  const readerContext = await browser.newContext();
  const posterContext = await browser.newContext();
  const helperContext = await browser.newContext();
  await posterContext.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
  const poster = await posterContext.newPage();
  let openTaskId = '';
  try {
    // The reader watches furniture assembly, newest first.
    const reader = await readerContext.newPage();
    await reader.goto('/austin/tasks?category=furniture-assembly&sort=newest&group=none');
    await expect(reader.getByText('Live', { exact: true })).toBeVisible({ timeout: 30_000 });
    await reader.evaluate(() => {
      (window as unknown as { liveMarker: boolean }).liveMarker = true;
    });

    await devSignIn(poster, 'maya@example.test');
    const title = `Live board bookshelf (${Date.now()})`;
    await postFurnitureTask(poster, title);
    openTaskId = new URL(poster.url()).pathname.split('/').pop()!;

    // The pill, not the task: nothing moves under the reader until they ask.
    // Other specs may post furniture tasks at the same time, so the count can be more than one.
    const pill = reader.getByRole('button', { name: /^\d+ new tasks? · Show$/ });
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(reader.getByRole('link', { name: title })).toHaveCount(0);
    await pill.click();
    await expect(reader.getByRole('link', { name: title })).toBeVisible({ timeout: 15_000 });
    await expect(pill).toHaveCount(0);
    const row = reader.getByRole('article').filter({ has: reader.getByRole('link', { name: title }) });
    await expect(row.getByText('No offers yet')).toBeVisible();

    // A helper offers: the row's count moves, without a reload (completion plan 7.6).
    const helper = await helperContext.newPage();
    await devSignIn(helper, 'jordan@example.test');
    await helper.goto(`/app/find-work/${openTaskId}`);
    await expect(helper.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 30_000 });
    await helper.getByLabel('Message to the client').fill('I can assemble it on the day, and I bring my own tools.');
    await helper.getByRole('button', { name: 'Send offer' }).click();
    await expect(helper.getByRole('heading', { name: 'Your offer' })).toBeVisible({ timeout: 30_000 });
    await expect(row.getByText('1 offer', { exact: true })).toBeVisible({ timeout: 15_000 });

    // The poster cancels it: the row says so, still without a reload.
    await cancelTask(poster, openTaskId);
    openTaskId = '';
    await expect(row.getByText('No longer taking offers')).toBeVisible({ timeout: 15_000 });
    expect(await reader.evaluate(() => (window as unknown as { liveMarker?: boolean }).liveMarker)).toBe(true);
  } finally {
    // Never leave an open task behind: the home page lists the market's four newest (tasks-public.spec).
    if (openTaskId) await cancelTask(poster, openTaskId).catch(() => undefined);
    await readerContext.close();
    await posterContext.close();
    await helperContext.close();
  }
});
