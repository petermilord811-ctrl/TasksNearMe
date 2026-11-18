import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * The signed-in dashboard (completion plan 9.9): what needs the person, their lists as tabs with counts, filters and
 * views in the URL, a keyword search that works without AI, and AI search ("describe what you need") through the
 * rule-based stand-in (the `tnm_ai_stand_in` cookie), so these never call Claude. Read-only on the seeded data.
 */

test("a client's dashboard: attention, their tasks first, and the filters and views in the URL", async ({ page }) => {
  await devSignIn(page, 'ben@example.test');
  await expect(page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening), Ben/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeVisible();
  const lists = page.getByRole('navigation', { name: 'Lists' });
  await expect(lists.getByRole('link', { name: /^Tasks \d+ items?$/ })).toHaveAttribute('aria-current', 'true');
  await expect(lists.getByRole('link')).toHaveCount(3);
  // His booked task is in his tasks; the booking itself is under Bookings.
  await expect(page.getByRole('link', { name: 'Anchor a tall bookshelf to the wall' }).first()).toHaveAttribute('href', /\/app\/tasks\/tsk_tv$/);
  await lists.getByRole('link', { name: /^Bookings/ }).click();
  await expect(page).toHaveURL(/\/app\?tab=bookings$/);
  await expect(page.getByRole('link', { name: 'Anchor a tall bookshelf to the wall' })).toHaveAttribute('href', /\/app\/bookings\/bkg_tv$/);
  await expect(page.getByRole('link', { name: 'See all bookings' })).toHaveAttribute('href', /\/app\/bookings$/);

  // A filter is a URL, kept on reload; a status with nothing in it says so.
  await page.getByRole('combobox', { name: 'Status' }).selectOption('done');
  await expect(page).toHaveURL(/tab=bookings&status=done/);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Status' })).toHaveValue('done');
  await expect(page.getByRole('combobox', { name: 'Date' }).locator('option').nth(2)).toHaveText('Last 7 days');
  await page.getByRole('link', { name: 'Clear filters' }).first().click();
  await expect(page).toHaveURL(/\/app\?tab=bookings$/);

  // Cards, and back to the list.
  const views = page.getByRole('group', { name: 'Show as' });
  await views.getByRole('link', { name: 'Cards' }).click();
  await expect(page).toHaveURL(/view=cards/);
  await expect(views.getByRole('link', { name: 'Cards' })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('article').first()).toBeVisible();
  // His tasks are all at his home: no map is offered.
  await expect(views.getByRole('link', { name: 'Map' })).toHaveCount(0);
});

test('Search finds words in your own lists and nearby, without AI', async ({ page }) => {
  await devSignIn(page, 'ben@example.test');
  const search = page.getByRole('search');
  await search.getByRole('searchbox').fill('bookshelf');
  await search.getByRole('searchbox').press('Enter');
  await expect(page).toHaveURL(/q=bookshelf/);
  await expect(page.getByText(/\d+ match(es)? for “bookshelf”/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Anchor a tall bookshelf to the wall' }).first()).toBeVisible();
  // Searching adds the open tasks nearby.
  await expect(page.getByRole('navigation', { name: 'Lists' }).getByRole('link', { name: /^Nearby/ })).toBeVisible();
  await page.getByRole('link', { name: 'Clear search' }).click();
  await expect(page).not.toHaveURL(/q=/);
  await expect(page.getByRole('navigation', { name: 'Lists' }).getByRole('link', { name: /^Nearby/ })).toHaveCount(0);
});

test('Ask AI turns a description into a task draft and helpers who do it (stand-in)', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'tnm_ai_stand_in', value: '1', url: baseURL! }]);
  await devSignIn(page, 'ben@example.test');
  await page.getByRole('searchbox').fill('I need help assembling an IKEA desk this weekend');
  await page.getByRole('button', { name: /ask AI/i }).click();
  const answer = page.getByRole('region', { name: 'What AI found' });
  await expect(answer).toBeVisible({ timeout: 30_000 });
  await expect(answer.getByText('Furniture assembly').first()).toBeVisible();
  await expect(answer.getByText('This weekend')).toBeVisible();
  const draft = answer.getByRole('link', { name: /Use this draft/ });
  await expect(draft).toHaveAttribute('href', /\/app\/tasks\/new\?category=furniture-assembly&title=Assemble[^&]*&describe=I\+need\+help/);
  await expect(answer.getByRole('heading', { name: 'Helpers who do this' })).toBeVisible();
  await expect(answer.getByText(/AI suggestions can be wrong/)).toBeVisible();
  await answer.getByRole('button', { name: 'Close the AI answer' }).click();
  await expect(answer).toHaveCount(0);
});

test("a helper's dashboard: jobs first, earnings at a glance, and nearby tasks on a map", async ({ page }) => {
  await devSignIn(page, 'jordan@example.test');
  await expect(page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening), Jordan/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Earnings at a glance' }).getByRole('link')).toHaveAttribute('href', /\/app\/earnings$/);
  const lists = page.getByRole('navigation', { name: 'Lists' });
  await expect(lists.getByRole('link', { name: /^Bookings \d+ items?$/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('link', { name: 'Anchor a tall bookshelf to the wall' }).first()).toBeVisible();
  const nearby = lists.getByRole('link', { name: /^Nearby/ });
  const matches = Number((await nearby.textContent())?.match(/(\d+)/)?.[1] ?? 0);
  await nearby.click();
  await expect(page).toHaveURL(/tab=nearby/);
  // Matches open Find work's view of the task; with none, the empty list says how to find more.
  if (matches > 0) await expect(page.getByRole('article').first().getByRole('link').first()).toHaveAttribute('href', /\/app\/find-work\//);
  else await expect(page.getByRole('heading', { name: 'No open tasks near you right now' })).toBeVisible();
  const map = page.getByRole('group', { name: 'Show as' }).getByRole('link', { name: 'Map' });
  if (await map.count()) {
    await map.click();
    await expect(page).toHaveURL(/view=map/);
    await expect(page.getByText(/Exact addresses are never shown on the map/)).toBeVisible();
  }
});

test('the signed-in navigation (9.14): five everyday places, the tools in one place, the account in the menu', async ({ page }, testInfo) => {
  await devSignIn(page, 'jordan@example.test');
  const desktop = testInfo.project.name === 'app-desktop';
  // The rail on wide screens, the dock on phones: the same five (a helper's: Find work second).
  const everyday = page.getByRole('navigation', { name: desktop ? 'Main navigation' : 'App navigation' });
  // The dock's narrow columns name the Neighborhood "Neighbors".
  const neighborhood = desktop ? 'Neighborhood' : 'Neighbors';
  await expect(everyday.getByRole('link')).toHaveText(['Home', 'Find work', neighborhood, 'Bookings', /^Messages/]);
  await expect(everyday.getByRole('link', { name: neighborhood })).toHaveAttribute('href', /\/app\/community$/);
  await page.getByRole('button', { name: /account menu for Jordan/ }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Account' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Support' })).toBeVisible();
  if (desktop) {
    // The tools are on the rail under the line, not in the menu too.
    await expect(page.getByRole('navigation', { name: 'More navigation' }).getByRole('link')).toHaveText(['Offers', 'Availability', 'Earnings', 'My clients', 'Rewards', 'Saved searches']);
    await expect(menu.getByRole('menuitem', { name: 'Earnings' })).toBeHidden();
  } else {
    await expect(menu.getByRole('menuitem', { name: 'Earnings' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Offers' })).toHaveAttribute('href', /\/app\/offers$/);
  }
});
