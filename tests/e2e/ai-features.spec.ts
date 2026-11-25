import { eq } from 'drizzle-orm';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { communityPosts } from '../../src/modules/community/schema';
import { createDb } from '../../src/platform/db/connect';
import { marketDate } from './support/post-task';
import { confirmedBooking, submittedBooking } from './support/scenarios';
import { devSignIn } from './support/sign-in';

/**
 * The AI features (2026-11-24; docs/automation/ai-plan-2026-11-24.md): "Get ready" on a booking for both people, "Write
 * it with AI" on a review, "Check my price with AI" when posting, Neighbors' "Make it clearer" and a helper's "Draft an
 * answer", and "What neighbors say" on a helper's profile. The `tnm_ai_stand_in` cookie gets the rule-based stand-ins,
 * and the e2e build's job runner uses its stand-in for review summaries, so nothing here reaches a model.
 */

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    { name: 'tnm_ai_stand_in', value: '1', url: baseURL! },
    { name: 'tnm_geo_stand_in', value: '1', url: baseURL! },
  ]);
});

/** A second person's browser, with the project's device and the AI stand-ins. */
async function secondPerson(browser: Browser, baseURL: string, use: object): Promise<BrowserContext> {
  const context = await browser.newContext({ ...use, baseURL });
  await context.addCookies([{ name: 'tnm_ai_stand_in', value: '1', url: baseURL }]);
  return context;
}

function database() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  return createDb(process.env.DATABASE_URL ?? '', { max: 1 });
}

test('both people on a booking get a checklist for the day, made with AI, and ticks stay on the device', async ({ page: chris, browser, baseURL }, testInfo) => {
  test.setTimeout(150_000);
  const scenario = await confirmedBooking(`ai-prep-${testInfo.project.name}`, 6000);
  const other = await secondPerson(browser, baseURL!, testInfo.project.use);
  try {
    const jordan = await other.newPage();

    await devSignIn(chris, 'chris@example.test');
    await chris.goto(`/app/bookings/${scenario.bookingId}`);
    const ready = chris.getByRole('region', { name: 'Get ready' });
    await expect(ready).toBeVisible({ timeout: 30_000 });
    await ready.getByRole('button', { name: 'Make my checklist' }).click();
    const first = ready.getByRole('checkbox', { name: 'Unbox the parts and keep the screws and instructions together.' });
    await expect(first).toBeVisible({ timeout: 30_000 });
    await expect(ready.getByText(/^Made with AI on /)).toBeVisible();
    await first.check();
    await expect(ready.getByText('1 of 3 done')).toBeVisible();
    // Kept for Chris, ticks and all, on the next visit.
    await chris.reload();
    await expect(chris.getByRole('region', { name: 'Get ready' }).getByRole('checkbox', { name: 'Unbox the parts and keep the screws and instructions together.' })).toBeChecked({ timeout: 30_000 });

    // Jordan's is his own: what to bring.
    await devSignIn(jordan, 'jordan@example.test');
    await jordan.goto(`/app/bookings/${scenario.bookingId}`);
    const his = jordan.getByRole('region', { name: 'Get ready' });
    await expect(his.getByRole('button', { name: 'Make my checklist' })).toBeVisible({ timeout: 30_000 });
    await his.getByRole('button', { name: 'Make my checklist' }).click();
    await expect(his.getByRole('checkbox', { name: 'Bring a drill, bits and a level.' })).toBeVisible({ timeout: 30_000 });
  } finally {
    await other.close();
  }
});

test('the client drafts the review with AI from the stars and their words, and Undo brings their words back', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const scenario = await submittedBooking(`ai-review-${testInfo.project.name}`);
  await devSignIn(page, 'chris@example.test');
  await page.goto(`/app/bookings/${scenario.bookingId}`);
  await page.getByRole('button', { name: 'Approve task' }).filter({ visible: true }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve the task' }).click();
  await expect(page.getByRole('button', { name: 'Approve task' }).filter({ visible: true })).toHaveCount(0, { timeout: 30_000 });

  await page.goto(`/app/bookings/${scenario.bookingId}/review`);
  const body = page.getByLabel('Your review (optional)');
  await expect(body).toBeVisible({ timeout: 30_000 });
  const write = page.getByRole('button', { name: 'Write it with AI' });
  // The stars come first.
  await write.click();
  await expect(page.getByText('Choose a star rating first, then AI can write from it.')).toBeVisible();
  await page.getByRole('radio', { name: '5 of 5 stars' }).check({ force: true });
  await body.fill('fast and tidy');
  await write.click();
  await expect(body).toHaveValue(/^Jordan did a great job with "Assemble a desk/, { timeout: 30_000 });
  await expect(body).toHaveValue(/fast and tidy/);
  await expect(page.getByText('Drafted with AI. Read it through and change anything before you send.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(body).toHaveValue('fast and tidy');
});

test('a poster checks the price on the budget step: a range from the city’s price guide, with where theirs sits', async ({ page }) => {
  test.setTimeout(150_000);
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Post a task' })).toBeVisible();
  await page.getByRole('radio', { name: /Furniture assembly/ }).check();
  await next();
  await page.getByLabel('Task title').fill('Assemble a flat-pack bookshelf');
  await page.getByRole('textbox', { name: 'What do you need help with?' }).fill('Flat-pack bookshelf, about 30 parts. The box is in the hallway.');
  await next();
  await page.getByLabel('What needs assembling?').selectOption('bookshelf');
  await page.getByLabel('Number of items', { exact: true }).fill('1');
  await next();
  await page.getByRole('radio', { name: 'In person' }).check();
  await page.getByRole('combobox', { name: 'Search your address' }).fill('1240 example');
  await page.getByRole('option', { name: /1240 Example Lane/ }).click();
  await next();
  await page.getByLabel('Date').fill(marketDate(5));
  await page.getByRole('radio', { name: 'Choose a time window' }).check();
  await page.getByLabel('Window starts').selectOption('10:00');
  await page.getByLabel('Window ends').selectOption('12:00');
  await next();
  await page.getByRole('radio', { name: 'Fixed price' }).check();
  await page.getByLabel('Task price ($)').fill('60');

  const check = page.getByRole('region', { name: 'Is this price fair?' });
  await check.getByRole('button', { name: 'Check my price with AI' }).click();
  // Austin's guide is $50–$80 an item: one bookshelf, typical work.
  await expect(check.getByText(/^Fair for this job: \$55(\.00)?–\$75(\.00)?$/)).toBeVisible({ timeout: 30_000 });
  await expect(check.getByText('For 1 item')).toBeVisible();
  await expect(check.getByText(/^Your price, \$60(\.00)?, is in this range\.$/)).toBeVisible();
  await expect(check.getByText('Checked with AI. Prices are your call.')).toBeVisible();
  // Nothing in the form changed.
  await expect(page.getByLabel('Task price ($)')).toHaveValue('60');
});

test('Neighbors: "Make it clearer" rewrites a post with Undo, and a helper drafts an answer in their service', async ({ page: maya, browser, baseURL }, testInfo) => {
  test.setTimeout(150_000);
  const { db, pool } = database();
  const postId = `cpo_e2e_ai_${testInfo.project.name.replace(/\W/g, '_')}_${Date.now()}`;
  const other = await secondPerson(browser, baseURL!, testInfo.project.use);
  try {
    const lee = await other.newPage();

    await devSignIn(maya, 'maya@example.test');
    await maya.goto('/app/community/new?kind=question');
    const composer = maya.getByRole('form', { name: 'New post' });
    await composer.getByLabel('Title').fill('who can help build an ikea desk');
    await composer.getByLabel('Details (optional)').fill('need someone careful this weekend');
    await composer.getByRole('button', { name: 'Make it clearer' }).click();
    await expect(composer.getByLabel('Title')).toHaveValue('Who can help build an ikea desk?', { timeout: 30_000 });
    await expect(composer.getByLabel('Details (optional)')).toHaveValue('Need someone careful this weekend.');
    await expect(composer.getByText('Rewritten with AI. Check that it still says what you mean.')).toBeVisible();
    await composer.getByRole('button', { name: 'Undo' }).click();
    await expect(composer.getByLabel('Title')).toHaveValue('who can help build an ikea desk');

    // Maya's recommendation request, made for this test; Lee assembles furniture.
    await db.insert(communityPosts).values({ id: postId, marketId: 'mkt_austin', authorUserId: 'usr_maya', kind: 'recommendation', categorySlug: 'furniture-assembly', title: `Who can build a desk? (${postId})`, body: 'A standing desk, this weekend.' });
    await devSignIn(lee, 'lee@example.test');
    await lee.goto(`/app/community/${postId}`);
    const reply = lee.getByRole('textbox', { name: 'Your reply' });
    await expect(reply).toBeVisible({ timeout: 30_000 });
    await reply.fill('I build these most weekends');
    await lee.getByRole('button', { name: 'Draft an answer with AI' }).click();
    await expect(reply).toHaveValue(/^Good question! From what you describe, I build these most weekends\. I offer furniture assembly on TasksNearMe if that helps\.$/, { timeout: 30_000 });
    await expect(lee.getByText('Drafted with AI. Read it through and change anything before you send.')).toBeVisible();
    await lee.getByRole('button', { name: 'Undo' }).click();
    await expect(reply).toHaveValue('I build these most weekends');
  } finally {
    await db.delete(communityPosts).where(eq(communityPosts.id, postId));
    await pool.end();
    await other.close();
  }
});

test("a helper's profile sums up what neighbors say, with AI, from their reviews", async ({ page }) => {
  test.setTimeout(200_000);
  // Sam has three published reviews with words; the e2e build's job runner sums them up within a minute or two.
  await expect(async () => {
    await page.goto('/helpers/sam-k');
    await expect(page.getByRole('heading', { level: 3, name: 'What neighbors say' })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 180_000, intervals: [5_000, 10_000, 15_000] });
  const summary = page.getByRole('region', { name: 'What neighbors say' });
  await expect(summary.getByText(/of \d+ reviewers gave 5 stars\./)).toBeVisible();
  await expect(summary.getByText(/^Summarized with AI from \d+ reviews\. Read them below\.$/)).toBeVisible();
});
