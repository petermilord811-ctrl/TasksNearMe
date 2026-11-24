import { expect, test } from '@playwright/test';
import { eq, inArray, or } from 'drizzle-orm';
import { usernames, users } from '../../src/modules/accounts/schema';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { helperProfiles } from '../../src/modules/profiles/schema';
import { files } from '../../src/modules/tasks/schema';
import { outboxEvents } from '../../src/platform/outbox/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * GIFs in chat (2026-11-24, owner: "And if possible, add gif feature."). In a new direct conversation the client opens
 * the GIF picker beside the paperclip (a sheet on phones, a popover on wide screens), sees trending GIFs, searches,
 * and taps one: it goes at once as its own message and shows animated in the conversation, served as the GIF itself.
 * With reduced motion it waits behind "Play GIF". The samples stand in for KLIPY (the `tnm_gif_stand_in` cookie), so
 * nothing reaches the provider. Everyone here is made for the test and removed after.
 */

function database() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example).');
  return createDb(url, { max: 1 });
}

interface Cast {
  clientId: string;
  clientEmail: string;
  helperId: string;
  handle: string;
}

async function makeCast(): Promise<Cast> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const cast: Cast = { clientId: `usr_e2e_gif_${run}`, clientEmail: `e2e-gif-${run}@example.test`, helperId: `usr_e2e_gif_helper_${run}`, handle: `e2e-gif-${run}` };
    const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
    const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
    if (!chris || !jordan || !profile) throw new Error('The seeded people are missing');
    await db.insert(users).values([
      { ...chris, id: cast.clientId, email: cast.clientEmail, name: 'Gia G.', firstName: 'Gia', lastName: 'Gale', phone: null, phoneVerifiedAt: null, directMessages: 'everyone', locale: 'en' },
      { ...jordan, id: cast.helperId, email: `e2e-gif-helper-${run}@example.test`, name: 'Gus G.', firstName: 'Gus', lastName: 'Grant', phone: null, phoneVerifiedAt: null, directMessages: 'everyone', locale: 'en' },
    ]);
    await db.insert(helperProfiles).values({ ...profile, userId: cast.helperId, handle: cast.handle, status: 'active', foundingNumber: null, completedCount: 0 });
    await db.insert(usernames).values([{ userId: cast.clientId, username: `gia_${run}`.slice(0, 20) }, { userId: cast.helperId, username: `gus_${run}`.slice(0, 20) }]);
    return cast;
  } finally {
    await pool.end();
  }
}

async function removeCast(cast: Cast): Promise<void> {
  const { db, pool } = database();
  try {
    const people = [cast.clientId, cast.helperId];
    const theirs = (await db.select({ id: threadParticipants.threadId }).from(threadParticipants).where(inArray(threadParticipants.userId, people))).map((row) => row.id);
    if (theirs.length) {
      await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, theirs));
      await db.delete(messages).where(inArray(messages.threadId, theirs));
      await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, theirs));
      await db.delete(threads).where(or(inArray(threads.id, theirs), inArray(threads.startedByUserId, people)));
    }
    await db.delete(files).where(inArray(files.ownerUserId, people));
    await db.delete(usernames).where(inArray(usernames.userId, people));
    await db.delete(helperProfiles).where(eq(helperProfiles.userId, cast.helperId));
    await db.update(users).set({ status: 'deleted' }).where(inArray(users.id, people));
  } finally {
    await pool.end();
  }
}

test('a GIF picked in a conversation goes at once and shows animated, or behind Play GIF with reduced motion', async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const cast = await makeCast();
  try {
    // The samples, never KLIPY.
    await page.context().addCookies([{ name: 'tnm_gif_stand_in', value: '1', url: baseURL! }]);
    await devSignIn(page, cast.clientEmail);
    await page.goto(`/app/messages/new?helper=${cast.handle}`);
    await page.getByLabel('Your message').fill('Hi Gus! Could you assemble my desk on Saturday?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });

    await page.getByRole('button', { name: 'Choose a GIF' }).filter({ visible: true }).click();
    const picker = page.getByRole('dialog', { name: 'GIFs' });
    const gifs = picker.getByRole('button', { name: /^Send GIF: / });
    // Trending first: every sample.
    await expect(gifs).toHaveCount(6, { timeout: 30_000 });
    await expect(picker.getByText('Powered by KLIPY')).toBeVisible();
    await picker.getByRole('searchbox', { name: 'Search KLIPY' }).fill('thanks');
    await expect(gifs).toHaveCount(2, { timeout: 30_000 });
    await expect(picker.getByText('GIFs for “thanks”', { exact: true }).first()).toBeVisible();
    await picker.getByRole('button', { name: 'Send GIF: Thank you' }).click();
    await expect(picker).toBeHidden();

    const log = page.getByRole('log').filter({ visible: true });
    const gif = log.getByRole('img', { name: 'Thank you' });
    await expect(gif).toBeVisible({ timeout: 30_000 });
    const src = await gif.getAttribute('src');
    expect(src).toMatch(/^\/api\/files\/fil_/);
    // Stored and served as the GIF itself, not a still copy.
    const served = await page.request.get(src!);
    expect(served.headers()['content-type']).toBe('image/gif');
    expect((await served.body()).subarray(0, 6).toString('latin1')).toBe('GIF89a');
    await expect(log.getByText('View photo')).toHaveCount(0);

    // Reduced motion: it waits behind Play GIF, and plays on a tap.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const play = log.getByRole('button', { name: 'Play GIF: Thank you' });
    await expect(play).toBeVisible();
    await expect(gif).toBeHidden();
    await play.click();
    await expect(gif).toBeVisible();
  } finally {
    await removeCast(cast);
  }
});

test('the picker keeps its height, the GIF shows while it goes, and its box has its size before the file arrives', async ({ page, baseURL }) => {
  // The owner, 2026-11-24: "when GIF loading, window size gets changed", "GIF is shown slowly and also that chat bubble
  // size is changed". The actions and the GIF file are held back here, as on a slow connection.
  test.setTimeout(240_000);
  const cast = await makeCast();
  try {
    await page.context().addCookies([{ name: 'tnm_gif_stand_in', value: '1', url: baseURL! }]);
    await devSignIn(page, cast.clientEmail);
    await page.goto(`/app/messages/new?helper=${cast.handle}`);
    await page.getByLabel('Your message').fill('Hi Gus! One more thing.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });

    await page.getByRole('button', { name: 'Choose a GIF' }).filter({ visible: true }).click();
    const picker = page.getByRole('dialog', { name: 'GIFs' });
    const panel = picker.locator('[data-gif-panel]');
    const gifs = picker.getByRole('button', { name: /^Send GIF: / });
    await expect(gifs).toHaveCount(6, { timeout: 30_000 });
    // Its laid-out height (a box would include the sheet's opening zoom).
    const heightOf = () => panel.evaluate((element: HTMLElement) => element.offsetHeight);
    const height = await heightOf();
    expect(height).toBeGreaterThan(200);
    // Nothing found: the same height, not a shorter window.
    await picker.getByRole('searchbox', { name: 'Search KLIPY' }).fill('zzzz');
    await expect(picker.getByText('No GIFs for “zzzz”. Try other words.').first()).toBeVisible({ timeout: 30_000 });
    expect(await heightOf()).toBe(height);
    await picker.getByRole('searchbox', { name: 'Search KLIPY' }).fill('thanks');
    await expect(gifs).toHaveCount(2, { timeout: 30_000 });

    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/files/fil_*', async (route) => { await held; await route.continue(); });
    await page.route(/\/app\/messages\/thr_/, async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });
    await picker.getByRole('button', { name: 'Send GIF: Thank you' }).click();
    // At once: the GIF picked, where the message will be.
    const sending = page.getByRole('status').filter({ hasText: 'Sending GIF…' });
    await expect(sending).toBeVisible();
    await expect(sending.locator('img')).toHaveAttribute('src', /thank-you\.gif$/);

    const log = page.getByRole('log').filter({ visible: true });
    const box = log.locator('[data-gif]');
    await expect(box).toBeVisible({ timeout: 30_000 });
    await expect(sending).toBeHidden();
    // The file hasn't come yet: the box already has its size, with a shimmer.
    const sizeOf = () => box.evaluate((element: HTMLElement) => ({ width: element.offsetWidth, height: element.offsetHeight }));
    const before = await sizeOf();
    expect(before.width).toBeGreaterThan(200);
    expect(before.height).toBeGreaterThan(150);
    await expect(box.locator('[data-slot="skeleton"]')).toHaveCount(1);
    release();
    await expect.poll(() => box.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
    await expect(box.locator('[data-slot="skeleton"]')).toHaveCount(0);
    expect(await sizeOf()).toEqual(before);
    // Its address as stored (the image isn't asked for again after hydration).
    expect(await box.locator('img').getAttribute('src')).toMatch(/^\/api\/files\/fil_/);
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await removeCast(cast);
  }
});
