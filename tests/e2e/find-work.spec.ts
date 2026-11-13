import { expect, test, type Page } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import { offers } from '../../src/modules/offers/schema';
import { taskMarks, tasks } from '../../src/modules/tasks/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * The helper's side (UI-009): the feed, a task from the helper's view, and offers.
 * Jordan is a bookable helper in East Austin with a 5-mile area; the shelves task is kept free of
 * offers by the e2e setup.
 */

const card = (page: Page, title: string) => page.getByRole('listitem').filter({ has: page.getByRole('link', { name: title }) });

test('a helper finds a nearby task, sends an offer, and withdraws it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(120_000);
  // A retry starts over: an offer an earlier try left on the shelves goes.
  await withdrawJordanShelvesOffer();
  await devSignIn(page, 'jordan@example.test');

  await page.goto('/app/find-work');
  await expect(page.getByRole('heading', { level: 1, name: 'Find work' })).toBeVisible();
  await expect(card(page, 'Rake and bag front-yard leaves').getByText('Outside your service area')).toBeVisible();
  await expect(card(page, 'Set up a new laptop and move my photos').getByText("You don't offer this service")).toBeVisible();
  await expect(card(page, 'Assemble a desk (flat-pack, 1 item)').getByText('You made an offer')).toBeVisible();
  // The desk has his offer and the move is hourly: no one-tap offer on either.
  await expect(card(page, 'Assemble a desk (flat-pack, 1 item)').getByRole('button', { name: /^Offer \$/ })).toHaveCount(0);
  await expect(card(page, 'Help loading a moving truck').getByRole('button', { name: /^Offer \$/ })).toHaveCount(0);

  // The one-tap offer at Maya's $50 (completion plan 4.3), then Undo withdraws it.
  await card(page, 'Mount two floating shelves').getByRole('button', { name: /^Offer \$50\.00 for Mount two floating shelves/ }).click();
  await expect(page.getByText('You offered $50.00 for “Mount two floating shelves”.', { exact: false })).toBeVisible({ timeout: 30_000 });
  // "Offer sent" shows until the list comes back with the offer, which can be in the same response.
  await expect(card(page, 'Mount two floating shelves').getByText(/^(Offer sent|You made an offer)$/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Your offer for “Mount two floating shelves” is withdrawn.')).toBeVisible({ timeout: 30_000 });

  await card(page, 'Mount two floating shelves').getByRole('link', { name: 'Mount two floating shelves' }).click();
  await expect(page).toHaveURL(/\/app\/find-work\/tsk_shelves$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mount two floating shelves' })).toBeVisible();
  // Visible text only: Next keeps the list we came from mounted (hidden) for an instant Back.
  await expect(page.getByText('the wall is drywall').filter({ visible: true })).toBeVisible();
  // The fee engine's numbers for the $50 budget: Jordan earns $45.00.
  await expect(page.getByText('$45.00').first()).toBeVisible();

  await page.getByLabel('Message to the client').fill('I can mount both shelves level, and I bring a stud finder.');
  await page.getByRole('button', { name: 'Send offer' }).click();
  await expect(page.getByRole('heading', { name: 'Your offer' })).toBeVisible();
  await expect(page.getByText('I can mount both shelves level')).toBeVisible();

  await page.getByRole('button', { name: 'Withdraw offer' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('button', { name: 'Send offer' })).toBeVisible();

  await page.goto('/app/offers');
  await expect(page.getByRole('heading', { level: 1, name: 'My offers' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Assemble a desk (flat-pack, 1 item)' })).toBeVisible();
});

test('people who are not set up as helpers can browse but not offer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'chris@example.test');

  await page.goto('/app/find-work?category=furniture-assembly');
  await expect(page.getByRole('heading', { name: 'Finish setting up to send offers' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Finish setup' }).first()).toHaveAttribute('href', '/app/helper/onboarding/profile');
  await expect(page.getByRole('link', { name: 'Rake and bag front-yard leaves' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Mount two floating shelves' }).click();
  await expect(page.getByRole('heading', { name: 'Before you send an offer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send offer' })).toHaveCount(0);
  const html = await page.content();
  for (const secret of ['300 Sample Street', 'Patel']) expect(html).not.toContain(secret);
});

/** Jordan has no offer on the shelves task (the e2e setup's state), as a first try would leave it. */
async function withdrawJordanShelvesOffer() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const { db, pool } = createDb(process.env.DATABASE_URL ?? '', { max: 1 });
  try {
    const now = new Date();
    const left = await db
      .update(offers)
      .set({ status: 'withdrawn', closedAt: now, updatedAt: now })
      .where(and(eq(offers.taskId, 'tsk_shelves'), eq(offers.helperUserId, 'usr_jordan'), inArray(offers.status, ['pending', 'stale'])))
      .returning({ id: offers.id });
    if (left.length > 0) {
      const active = await db.select({ id: offers.id }).from(offers).where(and(eq(offers.taskId, 'tsk_shelves'), inArray(offers.status, ['pending', 'stale'])));
      await db.update(tasks).set({ offerCount: active.length }).where(eq(tasks.id, 'tsk_shelves'));
    }
  } finally {
    await pool.end();
  }
}

/** Jordan's saved and hidden tasks go back to none (the reseed keeps marks, which belong to people). */
async function clearJordanMarks() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const { db, pool } = createDb(process.env.DATABASE_URL ?? '', { max: 1 });
  try {
    await db.delete(taskMarks).where(eq(taskMarks.userId, 'usr_jordan'));
  } finally {
    await pool.end();
  }
}

test('a helper saves a task, hides one (Undo brings it back), and sees the areas on the map', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', "changes Jordan's saved tasks; desktop only");
  test.setTimeout(120_000);
  await clearJordanMarks();
  try {
    await devSignIn(page, 'jordan@example.test');
    await page.goto('/app/find-work');
    const shelves = 'Mount two floating shelves';

    // Save for later: the Saved filter lists it.
    await card(page, shelves).getByRole('button', { name: `Save ${shelves} for later` }).click();
    await expect(card(page, shelves).getByRole('button', { name: `Remove ${shelves} from saved` })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('link', { name: /^Saved/ }).click();
    await expect(page).toHaveURL(/saved=1/);
    await expect(page.getByRole('link', { name: shelves })).toBeVisible();
    await page.goto('/app/find-work');

    // Not interested: it leaves the list; Undo brings it back.
    await card(page, shelves).getByRole('button', { name: `Not interested in ${shelves}: hide it` }).click();
    await expect(page.getByText(`Hidden: ${shelves}.`)).toBeVisible();
    await expect(page.getByRole('link', { name: shelves })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(card(page, shelves)).toBeVisible();
    // Hidden stays hidden on the next visit, whatever the sort.
    await card(page, shelves).getByRole('button', { name: `Not interested in ${shelves}: hide it` }).click();
    await expect(page.getByText(`Hidden: ${shelves}.`)).toBeVisible();
    await page.goto('/app/find-work?sort=pay');
    await expect(page.getByRole('link', { name: shelves })).toHaveCount(0);

    // The map beside the list: general areas only, never an address.
    const map = page.getByRole('complementary', { name: "Map of the tasks' general areas" });
    await expect(map).toBeVisible();
    await expect(map.getByText(/never the address/)).toBeVisible();
    const html = await page.content();
    for (const secret of ['1234 Example Lane', '300 Sample Street']) expect(html).not.toContain(secret);
  } finally {
    await clearJordanMarks();
  }
});

test('on phones, find work switches between the list and the map', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; phones');
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/find-work');
  await expect(page.getByRole('region', { name: 'Open tasks' })).toBeVisible();
  await page.getByRole('link', { name: 'Map' }).click();
  await expect(page).toHaveURL(/view=map/);
  await expect(page.getByRole('complementary', { name: "Map of the tasks' general areas" })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Open tasks' })).toBeHidden();
  await page.getByRole('link', { name: 'List' }).click();
  await expect(page.getByRole('region', { name: 'Open tasks' })).toBeVisible();
});
