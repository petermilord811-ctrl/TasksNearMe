import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import { AGREEMENT_VERSIONS } from '../../src/modules/accounts/agreements';
import { agreements, users } from '../../src/modules/accounts/schema';
import { helperProfiles, helperServices } from '../../src/modules/profiles/schema';
import { communityPosts } from '../../src/modules/community/schema';
import { createDb } from '../../src/platform/db/connect';
import { freshHelper, retireFreshHelper, type FreshHelper } from './support/fresh-helper';
import { latestCode } from './support/outbox';
import { devSignIn, submitEmailStep, untilShown } from './support/sign-in';

/**
 * In place of a trip to another page (2026-11-23, owner: "I hate to redirect to new pages continually … if possible, use
 * dialog"): a Neighbors post opens over the feed; "Verify your phone" on Neighbors verifies it in a dialog, and the
 * new post being written stays; a helper's home address and phone checks open from the verified-helper reminder over
 * the page they're on. Posts are written straight to the database and removed at the end.
 */

function database() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  return createDb(process.env.DATABASE_URL ?? '', { max: 1 });
}

/** This worker's posts (each worker removes only its own: another's test may be on its post). */
const created: string[] = [];

async function insertPost(title: string): Promise<string> {
  const { db, pool } = database();
  const id = `cpo_e2e_inplace_${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  created.push(id);
  try {
    const at = new Date();
    await db.insert(communityPosts).values({ id, marketId: 'mkt_austin', areaId: 'area_mueller', authorUserId: 'usr_ana', kind: 'question', title, body: 'Saturday mornings work best for us.', lastActivityAt: at, createdAt: at, updatedAt: at });
  } finally {
    await pool.end();
  }
  return id;
}

test.afterAll(async () => {
  if (created.length === 0) return;
  const { db, pool } = database();
  try {
    // Their replies go with them.
    await db.delete(communityPosts).where(inArray(communityPosts.id, created));
  } finally {
    await pool.end();
  }
});

/** A new account of its own (the day's codes from the dev outbox): no phone yet, so Neighbors waits for one. */
async function signUp(page: Page, context: BrowserContext, project: string): Promise<void> {
  const email = `e2e-inplace-${project}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto('/sign-in');
  await submitEmailStep(page, email);
  await page.getByLabel('6-digit code').fill(await latestCode(context, email));
  await expect(page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toBeVisible();
  await page.getByLabel('First name').fill('Robin');
  await page.getByLabel('Last name').fill('Lane');
  await page.getByLabel(/18 or older/).check();
  await page.getByLabel(/I agree to the Terms of service/).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

test('a Neighbors post opens over the feed, takes a reply there, and closing it leaves the feed as it was', async ({ page }) => {
  test.setTimeout(150_000);
  const title = `Who sharpens kitchen knives? ${Date.now().toString(36)}`;
  const id = await insertPost(title);
  await devSignIn(page, 'maya@example.test');
  const feed = '/app/community?area=all&sort=new';
  await page.goto(feed);
  const card = page.getByRole('article', { name: title }).filter({ visible: true });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole('link', { name: title, exact: true }).click();

  // The post, its replies and the reply form, in a dialog named for its author; the feed stays underneath.
  const dialog = page.getByRole('dialog', { name: "Ana P.'s post" });
  await expect(dialog.getByRole('heading', { level: 2, name: title })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`/app/community/${id}$`));
  // Hidden from assistive tech while the dialog is open (it's modal), but still there underneath.
  await expect(page.locator('section[aria-label="Start a post"]')).toBeAttached();
  const words = 'Hollis at the farmers market does it while you shop.';
  await dialog.getByRole('textbox', { name: 'Your reply' }).fill(words);
  await dialog.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(dialog.getByRole('article', { name: 'Maya R.' }).getByText(words)).toBeVisible({ timeout: 15_000 });

  // Escape closes it (as Back does): the feed's own address again, its card still there.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/app\/community\?area=all&sort=new$/);
  await expect(card).toBeVisible();

  // Loaded directly, the post's address is its page.
  await page.goto(`/app/community/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Neighbors verifies a phone in a dialog over the new post, which keeps what was written', async ({ page, context }, testInfo) => {
  test.setTimeout(180_000);
  await signUp(page, context, testInfo.project.name);
  await page.goto('/app/community');
  const composer = page.getByRole('region', { name: 'Start a post' });
  await expect(composer.getByText('Verify your phone number to post and reply.')).toBeVisible({ timeout: 30_000 });

  await composer.getByRole('link', { name: 'Share something with your neighbors…' }).click();
  const newPost = page.getByRole('dialog', { name: 'New post' });
  const words = `Is the Duck Pond path open after the rain? ${Date.now().toString(36)}`;
  await newPost.getByRole('textbox', { name: "What's on your mind?" }).fill(words);
  await newPost.getByRole('button', { name: 'Verify your phone' }).click();

  // The account page's phone steps, over the new post.
  const verify = page.getByRole('dialog', { name: 'Verify your phone number' });
  await expect(verify).toBeVisible();
  const line = String(Math.floor(1000 + Math.random() * 9000));
  const exchange = String(Math.floor(200 + Math.random() * 700));
  await verify.getByLabel('Phone number').fill(`(352) ${exchange}-${line}`);
  await verify.getByRole('button', { name: 'Text me a code' }).click();
  // The sixth digit sends the code.
  await verify.getByLabel('6-digit code').fill(await latestCode(context, `+1352${exchange}${line}`));
  await expect(verify).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('Your phone number is verified. You can post and reply now.').first()).toBeVisible();

  // The new post is where it was, with its words, and can go out now.
  await expect(newPost.getByRole('textbox', { name: "What's on your mind?" })).toHaveValue(words);
  await expect(newPost.getByText('Verify your phone number to post and reply.')).toHaveCount(0, { timeout: 15_000 });
  await expect(newPost.getByRole('button', { name: 'Post', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/app\/community\/new$/);
});

test('the verified-helper reminder opens the home address and phone checks over the page', async ({ page, context, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'sends a proof of address; desktop only');
  test.setTimeout(180_000);
  let helper: FreshHelper | undefined;
  try {
    helper = await freshHelper();
    const id = helper.id;
    // The profile's basics done (a headline, words, a service, the agreement), as setup's first page leaves them: the
    // home address opens then. In helper mode, where the reminder shows.
    const { db, pool } = database();
    try {
      await db.transaction(async (tx) => {
        await tx.update(users).set({ mode: 'helper' }).where(eq(users.id, id));
        await tx.update(helperProfiles).set({ headline: 'Careful yard help in North Loop', bio: 'I rake, weed and tidy yards, and bag everything for pickup.' }).where(eq(helperProfiles.userId, id));
        await tx.insert(helperServices).values({ id: `hsv_${id}`, userId: id, categoryId: 'cat_yard_cleanup', pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2 });
        await tx.insert(agreements).values({ id: `agr_${id}`, userId: id, doc: 'helper_agreement', version: AGREEMENT_VERSIONS.helper_agreement, acceptedAt: new Date() });
      });
    } finally {
      await pool.end();
    }
    // Address search uses the sample addresses, never Mapbox.
    await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
    await devSignIn(page, helper.email);
    await page.goto('/app/bookings');
    const pill = page.getByRole('button', { name: /^Become a verified helper/ });
    await expect(pill).toBeVisible({ timeout: 30_000 });

    await untilShown(page.getByRole('dialog').getByRole('link', { name: /^Home address/ }), () => pill.click());
    await page.getByRole('dialog').getByRole('link', { name: /^Home address/ }).click();
    const check = page.getByRole('dialog', { name: 'Verify your home address' });
    await expect(check).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/app\/helper\/checks\/address$/);
    // The Persona-style flow (2026-11-27): the intro, the address, the kind of document, the file, then the outcome.
    await check.getByRole('button', { name: 'Start' }).click();
    await check.getByRole('combobox', { name: 'Your home address' }).fill('1234 Example');
    await check.getByRole('option', { name: /1234 Example Lane/ }).first().click();
    await check.getByRole('button', { name: 'Continue' }).click();
    await check.getByRole('button', { name: /^Utility bill/ }).click();
    const bill = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#ffffff' } }).png().toBuffer();
    await check.locator('input[type="file"]').first().setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: bill });
    await check.getByRole('checkbox', { name: /It shows my name and this address/ }).check();
    await check.getByRole('button', { name: 'Submit' }).click();
    // A test account's proof is read by the stand-in, which is never sure: our team decides.
    await expect(check.getByRole('heading', { name: 'Almost done' })).toBeVisible({ timeout: 90_000 });
    await check.getByRole('button', { name: 'Done' }).click();

    // It closes over the page it opened on, which now counts the address as sent.
    await expect(check).toBeHidden({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/app\/bookings$/);
    await expect(page.getByText('Document sent for review').first()).toBeVisible();
    await untilShown(page.getByRole('dialog').getByRole('link', { name: /^Home address/ }), () => pill.click());
    await expect(page.getByRole('dialog').getByRole('link', { name: /^Home address/ })).toContainText('In review');

    // The phone (verified at sign-up): its check opens over the page too, and Escape closes it.
    await page.getByRole('dialog').getByRole('link', { name: /^Phone/ }).click();
    const phone = page.getByRole('dialog', { name: 'Verify your phone' });
    await expect(phone.getByRole('heading', { name: 'Phone verified' })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/app\/helper\/checks\/phone$/);
    await page.keyboard.press('Escape');
    await expect(phone).toBeHidden();
    await expect(page).toHaveURL(/\/app\/bookings$/);
  } finally {
    if (helper) await retireFreshHelper(helper);
  }
});
