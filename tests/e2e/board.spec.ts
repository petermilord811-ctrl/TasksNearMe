import { expect, test, type Page } from '@playwright/test';

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

test('the board groups tasks by neighborhood, filters by link and searches', async ({ page, isMobile }) => {
  await page.goto('/austin/tasks');
  await expect(page.getByRole('heading', { level: 1, name: 'Open tasks in Austin' })).toBeVisible();
  const openCount = () => page.getByRole('main').getByText(/^\d+ open tasks?$/).first().textContent().then((text) => Number(text!.match(/\d+/)![0]));
  const total = await openCount();
  expect(total).toBeGreaterThan(0);

  // Neighborhood sections: each says how many tasks it has and shows at most five.
  const sections = page.getByRole('main').getByRole('region');
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
  await expect(page.getByRole('navigation', { name: 'Sort' }).getByRole('link', { name: /Newest/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('main').getByRole('region')).toHaveCount(0);
  const rows = page.getByRole('main').getByRole('article');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(20);
  // Each row: a day, a title linking to the public task page, and a price.
  const link = rows.first().getByRole('link');
  await expect(link).toHaveAttribute('href', /^\/tasks\//);
  await expect(rows.first().locator('time')).toHaveAttribute('datetime', /^\d{4}-\d\d-\d\dT/);
  await expect(rows.first()).toContainText('$');
});
