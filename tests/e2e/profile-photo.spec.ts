import sharp from 'sharp';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { devSignIn, submitEmailStep, untilShown } from './support/sign-in';

/**
 * Profile photos from start to finish (plan 9.3): choose a photo, adjust it in the round frame, save, change and
 * remove it, and see it where the person appears: the account page and the header for a client, the profile editor,
 * the header and the public profile for a helper. A removed photo is no longer served.
 */

/** A fresh address per run and project. */
function fresh(project: string): string {
  return `e2e-avatar-${project}-${Date.now()}-r${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** A wide photo, as phones take them (the adjust step crops it to a square). */
async function photo(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: 1200, height: 800, channels: 3, background: color } }).jpeg({ quality: 85 }).toBuffer();
}

async function signInCode(context: BrowserContext, to: string): Promise<string> {
  const outbox = await context.newPage();
  try {
    // The message's body may sit in a closed disclosure: wait for the message, read its text.
    const message = outbox.locator(`[data-testid="outbox-message"][data-to="${to}"][data-tag="sign-in-code"]`).first();
    await expect(async () => {
      await outbox.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
      await expect(message).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    return (await message.locator('pre').textContent())?.match(/\b(\d{6})\b/)?.[1] ?? '';
  } finally {
    await outbox.close();
  }
}

/** Signs up through /sign-in as Casey Morgan and opens the account page. */
async function signUp(page: Page, context: BrowserContext, email: string) {
  await page.goto('/sign-in');
  await submitEmailStep(page, email);
  await page.getByLabel('6-digit code').fill(await signInCode(context, email));
  await expect(page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toBeVisible();
  await page.getByLabel('First name').fill('Casey');
  await page.getByLabel('Last name').fill('Morgan');
  await page.getByLabel(/18 or older/).check();
  await page.getByLabel(/I agree to the Terms of service/).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
}

/** Chooses a photo, moves it a little in the adjust step and saves it. Returns the saved photo's address. */
async function choosePhoto(page: Page, label: 'Add a photo' | 'Change photo', name: string, color: { r: number; g: number; b: number }) {
  const dialog = page.getByRole('dialog', { name: 'Adjust your photo' });
  const file = { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: await photo(color) };
  // A file chosen before the page hydrates is lost: choose it again until the adjust step opens.
  await untilShown(dialog, () => page.getByLabel(label).setInputFiles(file));
  // The keyboard moves the photo in its frame; the zoom slider zooms it.
  await dialog.getByRole('group', { name: 'Photo position' }).press('ArrowRight');
  await dialog.getByRole('button', { name: 'Zoom in' }).click();
  await dialog.getByRole('button', { name: 'Use this photo' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Your new photo is saved.')).toBeVisible();
  const avatar = page.getByRole('img', { name: `Profile photo of ${name}` }).first();
  await expect(avatar).toHaveAttribute('src', /\/api\/files\/fil_[0-9a-z]+\?w=256$/);
  return new URL((await avatar.getAttribute('src'))!, 'http://localhost').pathname + '?w=256';
}

/** The account menu's photo, if it shows one. */
const headerPhoto = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`account menu for ${name.replace('.', '\\.')}`, 'i') }).locator('img');

test('a client sets, adjusts, changes and removes their photo, and the header follows at once', async ({ page, context, request }, testInfo) => {
  await signUp(page, context, fresh(testInfo.project.name));
  await page.goto('/app/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Avatar with initials CM' })).toBeVisible();

  const first = await choosePhoto(page, 'Add a photo', 'Casey M.', { r: 70, g: 120, b: 200 });
  // The header shows it without a reload.
  await expect(headerPhoto(page, 'Casey M.')).toHaveAttribute('src', new RegExp(`${first.replace('?', '\\?')}$`));
  // Square, re-encoded and served at the size it's shown.
  const served = await request.get(first);
  expect(served.status()).toBe(200);
  expect(served.headers()['content-type']).toBe('image/webp');
  expect(await sharp(await served.body()).metadata()).toMatchObject({ width: 256, height: 256 });

  // After a reload too, on another page.
  await page.goto('/app');
  await expect(headerPhoto(page, 'Casey M.')).toHaveAttribute('src', new RegExp(`${first.replace('?', '\\?')}$`));
  await expect.poll(() => headerPhoto(page, 'Casey M.').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);

  // A new photo replaces it everywhere, and the old one is no longer served.
  await page.goto('/app/account');
  const second = await choosePhoto(page, 'Change photo', 'Casey M.', { r: 60, g: 160, b: 110 });
  expect(second).not.toBe(first);
  await expect(headerPhoto(page, 'Casey M.')).toHaveAttribute('src', new RegExp(`${second.replace('?', '\\?')}$`));
  expect((await request.get(first)).status()).toBe(404);

  // Removed: initials in the field and the header.
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByText('Your photo was removed. People see your initials instead.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Avatar with initials CM' })).toBeVisible();
  await expect(headerPhoto(page, 'Casey M.')).toHaveCount(0);
  expect((await request.get(second)).status()).toBe(404);
});

test('a helper’s photo shows in the editor, the header and on their public profile', async ({ page, browser }, testInfo) => {
  // One seeded helper per project, so the two projects never change the same profile at once.
  const helper = testInfo.project.name === 'app-mobile' ? { email: 'lee@example.test', name: 'Lee M.', handle: 'lee-m' } : { email: 'sam@example.test', name: 'Sam K.', handle: 'sam-k' };
  await devSignIn(page, helper.email);
  await page.goto('/app/helper/profile');
  // A photo left by an interrupted run goes first.
  const leftover = page.getByRole('button', { name: 'Remove photo' });
  if (await leftover.isVisible()) {
    await leftover.click();
    await expect(page.getByText(/Your photo was removed/)).toBeVisible();
  }
  const visitor = await browser.newContext();
  try {
    const src = await choosePhoto(page, 'Add a photo', helper.name, { r: 200, g: 140, b: 80 });
    await expect(headerPhoto(page, helper.name)).toHaveAttribute('src', new RegExp(`${src.replace('?', '\\?')}$`));

    // Anyone sees it on the public profile (its cached page refreshes).
    const profile = await visitor.newPage();
    await profile.goto(`/helpers/${helper.handle}`);
    const shown = profile.getByRole('img', { name: `Profile photo of ${helper.name}` }).first();
    await expect(shown).toHaveAttribute('src', new RegExp(`${src.replace('?', '\\?')}$`));
    await expect.poll(() => shown.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);

    await page.getByRole('button', { name: 'Remove photo' }).click();
    await expect(page.getByText(/Your photo was removed/)).toBeVisible();
    await profile.reload();
    await expect(profile.getByRole('img', { name: `Profile photo of ${helper.name}` })).toHaveCount(0);
    expect((await visitor.request.get(src)).status()).toBe(404);
  } finally {
    // Leave the seeded helper as it was.
    if (await page.getByRole('button', { name: 'Remove photo' }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Remove photo' }).click();
      await expect(page.getByText(/Your photo was removed/)).toBeVisible();
    }
    await visitor.close();
  }
});
