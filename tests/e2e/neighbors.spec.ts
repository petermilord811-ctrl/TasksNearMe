import { randomInt, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import { PEOPLE, type SeedPerson } from '../../db/seeds/data/people';
import { upsertPeople } from '../../db/seeds/seed';
import { betaAccess } from '../../src/modules/beta/schema';
import { communityPosts } from '../../src/modules/community/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * Neighbors, plan 10 (docs/ui/neighbors-10.md): on phones the first post starts high (one sticky row instead of the
 * heading, strip and toolbar); a neighbor replies right on a card; the author edits a post and it says Edited;
 * Unanswered lists asks nobody answered; and a member we can't place is asked for their neighborhood. Posts are
 * written straight to the database with this spec's prefix and removed at the end.
 */

const PREFIX = 'cpo_e2e_nbr_';

function database() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  return createDb(process.env.DATABASE_URL ?? '', { max: 1 });
}

/**
 * The posts this worker wrote. The tests run in parallel workers, each with its own afterAll: removing every post with
 * the prefix took another worker's post away while its test was on the post's page (a 404).
 */
const created: string[] = [];

/** A post of this spec's own, near Mueller (Maya's neighborhood) unless `areaId` says otherwise. */
async function insertPost(fields: { author: string; title: string; kind?: 'question' | 'recommendation' | 'tip'; body?: string; areaId?: string | null }) {
  const { db, pool } = database();
  const id = `${PREFIX}${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  created.push(id);
  try {
    const at = new Date();
    await db.insert(communityPosts).values({ id, marketId: 'mkt_austin', areaId: fields.areaId === undefined ? 'area_mueller' : fields.areaId, authorUserId: fields.author, kind: fields.kind ?? 'question', title: fields.title, body: fields.body ?? 'Weekend mornings work best for us.', lastActivityAt: at, createdAt: at, updatedAt: at });
  } finally {
    await pool.end();
  }
  return id;
}

async function removePosts() {
  if (created.length === 0) return;
  const { db, pool } = database();
  try {
    await db.delete(communityPosts).where(inArray(communityPosts.id, created));
  } finally {
    await pool.end();
  }
}

/** A neighbor with no task and no helper profile: Ana's copy under a new account, so we don't know their neighborhood. */
async function freshNeighbor(): Promise<string> {
  const ana = PEOPLE.find((person) => person.id === 'usr_ana');
  if (!ana) throw new Error('Seeded Ana is missing');
  const token = randomUUID().replaceAll('-', '').slice(0, 8);
  const person: SeedPerson = { ...ana, id: `usr_e2e_nbr_${token}`, email: `neighbor-${token}@example.test`, lastName: `Sample${token}`, phone: `+1512555${randomInt(3000, 10_000)}` };
  const { db, pool } = database();
  try {
    await db.transaction(async (tx) => {
      await upsertPeople(tx, [person]);
      await tx.insert(betaAccess).values({ userId: person.id, marketId: 'mkt_austin', role: 'poster', grantedAt: new Date(person.createdAt) }).onConflictDoNothing();
    });
  } finally {
    await pool.end();
  }
  return person.email;
}

const card = (page: Page, title: string) => page.getByRole('article', { name: title }).filter({ visible: true });

test.afterAll(removePosts);

test('on phones the first post starts high, under one sticky row', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'the phone layout');
  test.setTimeout(90_000);
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/community?area=all');
  const bar = page.getByRole('heading', { level: 1, name: 'All of Austin' });
  await expect(bar).toBeVisible();
  // The desktop toolbar and strip aren't there; the sort and Filters are in the row.
  await expect(page.getByRole('button', { name: /^Sort: / })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Neighborhoods' })).toBeHidden();
  const first = page.locator('#portal-stream li').filter({ visible: true }).first();
  await expect(first).toBeVisible();
  const box = await first.boundingBox();
  expect(box?.y ?? 9_999, 'the first item starts in the upper half of a 360 × 800 screen').toBeLessThan(420);
  // The row stays under the app's bar as the page scrolls.
  await page.mouse.wheel(0, 900);
  await expect(bar).toBeInViewport();
});

test('a neighbor replies right on a card, and the author edits their post', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'writes shared data; desktop only');
  test.setTimeout(150_000);
  const stamp = Date.now().toString(36);
  const question = `Who rakes leaves on weekends? ${stamp}`;
  const mine = `Bookshelf anchors that hold? ${stamp}`;
  await insertPost({ author: 'usr_ana', title: question });
  const mineId = await insertPost({ author: 'usr_maya', title: mine, kind: 'question', body: 'Our walls are plaster over brick.' });

  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/community?area=all&sort=new');
  const ask = card(page, question);
  await expect(ask).toBeVisible({ timeout: 30_000 });
  await ask.getByRole('button', { name: 'Reply to this post' }).click();
  const box = ask.getByRole('textbox', { name: 'Write a reply' });
  await box.fill('Sam did our yard last fall, fast and careful.');
  await ask.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText(/^Reply posted/).first()).toBeVisible({ timeout: 15_000 });
  await expect(ask.getByText('Sam did our yard last fall, fast and careful.')).toBeVisible({ timeout: 15_000 });

  // Her own post: Edit in its menu, then "Edited".
  await page.goto(`/app/community/${mineId}`);
  await expect(page.getByRole('heading', { level: 1, name: mine })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: `More: ${mine}` }).filter({ visible: true }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit your post' });
  const edited = `${mine} (plaster walls)`;
  await dialog.getByLabel('Title').fill(edited);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1, name: edited })).toBeVisible({ timeout: 15_000 });
  await expect(card(page, edited).getByText('Edited')).toBeVisible();
});

test('Unanswered lists the asks nobody answered yet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'writes shared data; desktop only');
  test.setTimeout(90_000);
  const title = `Printer drops off the Wi-Fi ${Date.now().toString(36)}`;
  await insertPost({ author: 'usr_chris', title, kind: 'question' });
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/community?area=all&unanswered=1&sort=new');
  await expect(card(page, title)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('navigation', { name: 'Filters in use' }).getByRole('link', { name: 'Remove filter: Unanswered' })).toBeVisible();
});

test('a member we can’t place is asked for their neighborhood, and Near you starts there', async ({ page }) => {
  test.setTimeout(120_000);
  const email = await freshNeighbor();
  await devSignIn(page, email);
  await page.goto('/app/community');
  const prompt = page.getByRole('region', { name: 'Which neighborhood are you in?' });
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await prompt.getByLabel('Your neighborhood').selectOption({ label: 'Hyde Park' });
  await prompt.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hyde Park and nearby' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('region', { name: 'Which neighborhood are you in?' })).toHaveCount(0);
});

test('the post page keeps the thread’s named helpers beside it on wide screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'the wide layout');
  test.setTimeout(90_000);
  const { db, pool } = database();
  let id = '';
  try {
    id = await insertPost({ author: 'usr_maya', title: `Who assembles cribs? ${Date.now().toString(36)}`, kind: 'recommendation' });
    await db.update(communityPosts).set({ categorySlug: 'furniture-assembly' }).where(eq(communityPosts.id, id));
  } finally {
    await pool.end();
  }
  await devSignIn(page, 'lee@example.test');
  await page.goto(`/app/community/${id}`);
  await expect(page.getByRole('complementary', { name: 'About this conversation' })).toBeVisible({ timeout: 30_000 });
});

test('a neighbor shares a general post with a photo from the dialog, and the feed shows it by its words (2026-11-22)', async ({ page }) => {
  test.setTimeout(150_000);
  const words = `Morning walk around the pond ${Date.now().toString(36)}`;
  try {
    await devSignIn(page, 'maya@example.test');
    await page.goto('/app/community?area=all&sort=new');
    // The prompt opens the form in a dialog over the feed (a sheet on phones); a general post is chosen first.
    await page.getByRole('region', { name: 'Start a post' }).getByRole('link', { name: 'Share something with your neighbors…' }).click();
    const dialog = page.getByRole('dialog', { name: 'New post' });
    const form = dialog.getByRole('form', { name: 'New post' });
    await expect(form.getByRole('radio', { name: 'Post' })).toBeChecked();
    // No title of its own: its words and a photo.
    await expect(form.getByLabel('Title')).toHaveCount(0);
    await form.getByRole('textbox', { name: "What's on your mind?" }).fill(`${words}\nThe herons were out early.`);
    const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 120, g: 160, b: 200 } } }).png().toBuffer();
    await form.getByLabel(/^Add photos/).setInputFiles({ name: 'pond.png', mimeType: 'image/png', buffer: png });
    await expect(form.getByRole('button', { name: 'Remove photo 1' })).toBeVisible({ timeout: 30_000 });
    await form.getByRole('button', { name: 'Post', exact: true }).click();
    // Posting closes the dialog; the feed under it shows the post, named by its first line, its words and its photo.
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    const posted = page.getByRole('article', { name: words }).filter({ visible: true });
    await expect(posted).toBeVisible({ timeout: 30_000 });
    await expect(posted.getByText('The herons were out early.')).toBeVisible();
    await expect(posted.getByRole('button', { name: /^Open photo 1 of 1/ })).toBeVisible();
  } finally {
    const { db, pool } = database();
    try {
      await db.delete(communityPosts).where(eq(communityPosts.title, words));
    } finally {
      await pool.end();
    }
  }
});
