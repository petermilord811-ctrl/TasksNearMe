import { expect, test, type Page } from '@playwright/test';
import { and, eq, like } from 'drizzle-orm';
import { tasks } from '../../src/modules/tasks/schema';
import { createDb } from '../../src/platform/db/connect';
import { marketDate } from './support/post-task';
import { devSignIn } from './support/sign-in';

/**
 * The neighborhood portal (completion plan 9.10): the community's posts and the open tasks in one place, as a
 * Feed or a List over one set of filters in one URL. Sorting and switching views keep every filter (both
 * projects); a neighbor asks a question in the composer, turns it into a task with "Ask for help", posts it, and
 * the post and the task link to each other (desktop: it posts a task, which is closed again at the end).
 */

const TITLE_PREFIX = 'Portal e2e:';

/** Closes the tasks this spec posted, so they don't fill the "newest open tasks" lists other specs read. */
async function closePortalTasks() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const { db, pool } = createDb(process.env.DATABASE_URL ?? '', { max: 1 });
  try {
    await db.update(tasks).set({ status: 'canceled', updatedAt: new Date() }).where(and(eq(tasks.posterUserId, 'usr_maya'), eq(tasks.status, 'open'), like(tasks.title, `${TITLE_PREFIX}%`)));
  } finally {
    await pool.end();
  }
  // Changed behind the app's back: the cached public pages read the database again.
  await fetch(`http://localhost:${process.env.PORT ?? 3000}/dev/cache`, { method: 'POST' }).catch(() => undefined);
}

const query = (page: Page) => new URL(page.url()).searchParams;

test('sorting, the tab and the Feed or List keep every other filter', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  // Phones keep the sort in the sticky row's menu and Feed or List in the Filters sheet (plan 10.7).
  const phone = testInfo.project.name === 'app-mobile';
  const sortBy = async (name: string) => {
    // A menu on phones and on Open tasks (its four sorts are the board's, 2026-11-23); buttons on Neighbors' toolbar.
    const menu = page.getByRole('button', { name: /^Sort: / }).filter({ visible: true });
    if (phone || (await menu.count()) > 0) {
      await menu.click();
      await page.getByRole('list', { name: 'Sort' }).getByRole('link', { name }).click();
      await expect(page.getByRole('button', { name: `Sort: ${name}` }).filter({ visible: true })).toBeVisible();
    } else {
      await page.getByRole('navigation', { name: 'Sort' }).getByRole('link', { name }).click();
      await expect(page.getByRole('navigation', { name: 'Sort' }).getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    }
  };
  const viewAs = async (name: 'Feed' | 'List') => {
    if (phone) {
      await page.getByRole('button', { name: /^Filters/ }).click();
      await page.getByRole('dialog').getByRole('group', { name: 'View' }).getByRole('link', { name }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    } else {
      await page.getByRole('navigation', { name: 'View' }).getByRole('link', { name }).click();
      await expect(page.getByRole('navigation', { name: 'View' }).getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    }
  };
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/community?area=all&category=furniture-assembly');
  await expect(page.getByRole('heading', { level: 1, name: 'All of Austin' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Filters in use' }).getByRole('link', { name: 'Remove filter: Furniture assembly' })).toBeVisible();

  await sortBy('New');
  await expect.poll(() => Object.fromEntries(query(page))).toEqual({ area: 'all', category: 'furniture-assembly', sort: 'new' });

  // Open tasks, the switch's other tab (2026-11-23): the place and the service come along; the tab has its own sort
  // and view (the soonest first, the List).
  const tabs = page.getByRole('navigation', { name: 'Neighbors or open tasks' }).filter({ visible: true });
  await tabs.getByRole('link', { name: /^Open tasks/ }).click();
  await expect.poll(() => Object.fromEntries(query(page))).toEqual({ area: 'all', category: 'furniture-assembly', type: 'task' });
  await expect(tabs.locator('[aria-current="page"]')).toContainText('Open tasks');
  // The board's own tools are here now: its sorts, and alerts for this search.
  await expect(page.getByRole('link', { name: 'Save this search' })).toBeVisible();
  await sortBy('Lowest price');
  await expect.poll(() => Object.fromEntries(query(page))).toEqual({ area: 'all', category: 'furniture-assembly', type: 'task', sort: 'price_low' });

  await viewAs('Feed');
  await expect.poll(() => Object.fromEntries(query(page))).toEqual({ area: 'all', category: 'furniture-assembly', type: 'task', sort: 'price_low', view: 'feed' });

  await viewAs('List');
  await expect.poll(() => Object.fromEntries(query(page))).toEqual({ area: 'all', category: 'furniture-assembly', type: 'task', sort: 'price_low' });

  // A filter comes off on its own; the rest stay.
  await page.getByRole('navigation', { name: 'Filters in use' }).getByRole('link', { name: 'Remove filter: Furniture assembly' }).click();
  await expect(page.getByRole('navigation', { name: 'Filters in use' })).toHaveCount(0);
  expect(Object.fromEntries(query(page))).toEqual({ area: 'all', type: 'task', sort: 'price_low' });
});

test('Neighbors and Open tasks are two tabs of one place: the switch, the board’s filters, and back (2026-11-23)', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const phone = testInfo.project.name === 'app-mobile';
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/community?area=all');
  await expect(page.getByRole('heading', { level: 1, name: 'All of Austin' }).filter({ visible: true })).toBeVisible();

  // The switch at the top (on phones, across the sticky bar), Neighbors marked, the open tasks counted.
  const tabs = page.getByRole('navigation', { name: 'Neighbors or open tasks' }).filter({ visible: true });
  await expect(tabs).toBeVisible();
  await expect(tabs.locator('[aria-current="page"]')).toHaveText('Neighbors');
  const openTasks = tabs.getByRole('link', { name: /^Open tasks/ });
  await expect(openTasks).toHaveAttribute('href', '/app/community?area=all&type=task');
  expect(Number((await openTasks.textContent())!.match(/\d+/)![0])).toBeGreaterThan(0);
  // Neighbors shows the newest of them: the rail's card on wide screens, a strip in the Feed on phones, each with the tab.
  const preview = page.getByRole('region', { name: 'Open tasks in Austin' }).filter({ visible: true });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('link', { name: /^See (all \d+ open tasks|the open task)/ })).toHaveAttribute('href', '/app/community?area=all&type=task');
  if (phone) await expect(preview.getByRole('article').first()).toBeVisible();

  // Open tasks: the board inside the app (its composer, its rows, no post tabs).
  await openTasks.click();
  await expect.poll(() => Object.fromEntries(query(page))).toEqual({ area: 'all', type: 'task' });
  await expect(tabs.locator('[aria-current="page"]')).toContainText('Open tasks');
  await expect(page.getByRole('region', { name: 'Post in Austin' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Show' })).toHaveCount(0);

  // The board's filters, each with its count: a price from the Filters panel (a sheet on phones).
  await page.getByRole('button', { name: /^Filters/ }).filter({ visible: true }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('group', { name: 'Price' }).getByRole('link', { name: /^\$50 to \$99/ }).click();
  await expect.poll(() => Object.fromEntries(query(page))).toEqual({ area: 'all', type: 'task', min: '50', max: '99' });
  await expect(page.getByRole('navigation', { name: 'Filters in use' }).getByRole('link', { name: 'Remove filter: $50 to $99' })).toBeVisible();

  // Back to Neighbors: the place stays, the board's filters stay with Open tasks.
  await tabs.getByRole('link', { name: 'Neighbors' }).click();
  await expect.poll(() => Object.fromEntries(query(page))).toEqual({ area: 'all' });
  await expect(tabs.locator('[aria-current="page"]')).toHaveText('Neighbors');
  // On wide screens the heading's count opens the tab too.
  if (!phone) {
    await page.getByRole('link', { name: /^\d+ open tasks?$/ }).filter({ visible: true }).click();
    await expect.poll(() => Object.fromEntries(query(page))).toEqual({ area: 'all', type: 'task' });
  }
});

test('a neighbor asks in the composer, then turns the question into a task that links back', async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'posts a task (shared data); desktop only');
  test.setTimeout(240_000);
  const context = await browser.newContext();
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
  const page = await context.newPage();
  const title = `${TITLE_PREFIX} anchor a bookshelf ${Date.now().toString(36)}`;
  try {
    await devSignIn(page, 'maya@example.test');
    await page.goto('/app/community?area=all&sort=new');
    // The prompt opens the new-post form in a dialog over the feed (2026-11-22), and the kind changes in the form.
    await page.getByRole('region', { name: 'Start a post' }).getByRole('link', { name: 'Share something with your neighbors…' }).click();
    const dialog = page.getByRole('dialog', { name: 'New post' });
    const form = dialog.getByRole('form', { name: 'New post' });
    await form.getByText('Question', { exact: true }).click();
    await expect(form.getByRole('radio', { name: 'Question' })).toBeChecked();
    await form.getByLabel('Title').fill(title);
    await form.getByLabel('Details').fill('A six-foot flat-pack bookshelf, about 30 parts, to anchor to drywall. How long does it take?');
    await form.getByLabel('Service').selectOption({ label: 'Furniture assembly' });
    await form.getByRole('button', { name: 'Post', exact: true }).click();
    // Posting closes the dialog over the feed, which shows the question; it opens over the feed (2026-11-23), with
    // "Ask for help".
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await page.getByRole('article', { name: title }).filter({ visible: true }).getByRole('link', { name: title, exact: true }).click();
    const post = page.getByRole('dialog', { name: 'Your post' });
    await expect(post.getByRole('heading', { level: 2, name: title })).toBeVisible({ timeout: 30_000 });
    const postUrl = new URL(page.url()).pathname;

    // "Ask for help": the dialog closes and the wizard starts from the post, its words filled in.
    await post.getByRole('link', { name: 'Ask for help' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Post a task' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/From your neighborhood post/)).toBeVisible();
    await expect(page.getByLabel('Task title')).toHaveValue(title);
    await expect(page.getByRole('textbox', { name: 'What do you need help with?' })).toHaveValue(/six-foot flat-pack bookshelf/);

    const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();
    await next();
    await page.getByLabel('What needs assembling?').selectOption('bookshelf');
    await page.getByLabel('Number of items', { exact: true }).fill('1');
    await next();
    await page.getByRole('radio', { name: 'In person' }).check();
    await page.getByRole('combobox', { name: 'Search your address' }).fill('1240 example');
    await page.getByRole('option', { name: /1240 Example Lane/ }).click();
    await next();
    await page.getByLabel('Date').fill(marketDate(6));
    await page.getByRole('radio', { name: 'Choose a time window' }).check();
    await page.getByLabel('Window starts').selectOption('10:00');
    await page.getByLabel('Window ends').selectOption('12:00');
    await next();
    await page.getByRole('radio', { name: 'Fixed price' }).check();
    await page.getByLabel('Task price ($)').fill('75');
    await next();
    await page.getByRole('button', { name: 'Post task' }).click();
    await expect(page).toHaveURL(/\/app\/tasks\/tsk_[0-9a-f]+$/, { timeout: 30_000 });
    const taskPath = new URL(page.url()).pathname;
    // The task's own page links back to the post it came from.
    await expect(page.getByRole('link', { name: new RegExp(`From a neighborhood post.*${title.slice(TITLE_PREFIX.length + 1, TITLE_PREFIX.length + 20)}`) })).toHaveAttribute('href', postUrl);

    // The post now shows its task (and no more "Ask for help").
    await page.goto(postUrl);
    const link = page.getByRole('link', { name: /Posted as a task/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', taskPath);
    await expect(page.getByRole('link', { name: 'Ask for help' })).toHaveCount(0);
    // Her own task waits in Your stuff, not in her stream (audit M20); for a neighbor, its card links back to the post.
    // Open tasks' cards (the Feed), newest first.
    await page.goto('/app/community?area=all&type=task&sort=new&view=feed');
    await expect(page.getByRole('heading', { level: 1, name: 'All of Austin' }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('article', { name: title })).toHaveCount(0);
    const lee = await browser.newContext();
    try {
      const leePage = await lee.newPage();
      await devSignIn(leePage, 'lee@example.test');
      await leePage.goto('/app/community?area=all&type=task&sort=new&view=feed');
      const card = leePage.getByRole('article', { name: title });
      // Exactly the title: the link to the post it came from carries the same words after "From a neighborhood post".
      await expect(card.getByRole('link', { name: title, exact: true })).toHaveAttribute('href', `/app/find-work/${taskPath.split('/').at(-1)}`);
      await expect(card.getByRole('link', { name: /From a neighborhood post/ })).toHaveAttribute('href', postUrl);
    } finally {
      await lee.close();
    }
  } finally {
    await closePortalTasks();
    await context.close();
  }
});
