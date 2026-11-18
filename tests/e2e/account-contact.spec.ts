import sharp from 'sharp';
import { submitEmailStep } from './support/sign-in';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * The account page's photo and contact details (UI-044) on a fresh account each time: the email changes
 * with a code sent to the new address, a phone is added with a texted code, and the profile photo is public
 * only while it's the current one. Codes are read from the dev outbox (/dev/outbox).
 */

/** A fresh address per run and project. No standalone 6-digit run, so it's never mistaken for a code. */
function fresh(project: string, label: string): string {
  return `e2e-${label}-${project}-${Date.now()}-r${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** The newest message of one kind to one address, from the dev outbox (waits for it to arrive). */
async function outboxMessage(context: BrowserContext, to: string, tag: string): Promise<string> {
  const outbox = await context.newPage();
  try {
    const message = outbox.locator(`[data-testid="outbox-message"][data-to="${to}"][data-tag="${tag}"]`).first();
    await expect(async () => {
      await outbox.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
      await expect(message).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    return (await message.locator('pre').textContent()) ?? '';
  } finally {
    await outbox.close();
  }
}

async function textedCode(context: BrowserContext, to: string): Promise<string> {
  const outbox = await context.newPage();
  try {
    const message = outbox.locator(`[data-testid="outbox-message"][data-to="${to}"] pre`).first();
    await expect(async () => {
      await outbox.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
      await expect(message).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    const code = (await message.textContent())?.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`no code texted to ${to}`);
    return code;
  } finally {
    await outbox.close();
  }
}

const codeIn = (body: string) => body.match(/\b(\d{6})\b/)?.[1] ?? '';

/** Signs up through /sign-in and lands on the account page. */
async function signUp(page: Page, context: BrowserContext, email: string) {
  await page.goto('/sign-in');
  await submitEmailStep(page, email);
  // The sixth digit sends the code.
  await page.getByLabel('6-digit code').fill(codeIn(await outboxMessage(context, email, 'sign-in-code')));
  await expect(page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toBeVisible();
  await page.getByLabel('First name').fill('Casey');
  await page.getByLabel('Last name').fill('Morgan');
  await page.getByLabel(/18 or older/).check();
  await page.getByLabel(/I agree to the Terms of service/).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
}

test('account: the email changes with a code sent to the new address', async ({ page, context }, testInfo) => {
  const email = fresh(testInfo.project.name, 'old');
  const next = fresh(testInfo.project.name, 'new');
  await signUp(page, context, email);

  await page.getByRole('button', { name: 'Change your email' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change your email' });
  await dialog.getByLabel('New email').fill(next.toUpperCase());
  await dialog.getByRole('button', { name: 'Send code' }).click();
  await expect(dialog.getByLabel('6-digit code')).toBeVisible();
  await expect(dialog.getByText(next)).toBeVisible();

  // A wrong code keeps the dialog open; the right one (the sixth digit sends it) switches the account.
  const code = codeIn(await outboxMessage(context, next, 'email-change-code'));
  await dialog.getByLabel('6-digit code').fill(code === '000000' ? '111111' : '000000');
  await expect(dialog.getByText("That code isn't right")).toBeVisible();
  await dialog.getByLabel('6-digit code').fill(code);
  await expect(page.getByText(`Your email is now ${next}.`)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('list').getByText(next, { exact: true }).first()).toBeVisible();

  // The old address hears about it, with a way to reach support.
  expect(await outboxMessage(context, email, 'email-changed')).toContain(next);

  // Signed out, the new address signs in to the same account.
  await context.clearCookies();
  await page.goto('/sign-in');
  await submitEmailStep(page, next);
  await page.getByLabel('6-digit code').fill(codeIn(await outboxMessage(context, next, 'sign-in-code')));
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/account');
  await expect(page.getByLabel('First name')).toHaveValue('Casey');
});

test('account: a phone number is added with a texted code', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'one project is enough');
  const line = String(Math.floor(1000 + Math.random() * 9000));
  const exchange = String(Math.floor(200 + Math.random() * 700));
  await signUp(page, context, fresh(testInfo.project.name, 'phone'));
  await expect(page.getByText('No phone number yet')).toBeVisible();

  await page.getByRole('button', { name: 'Add a phone number' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a phone number' });
  await dialog.getByLabel('Phone number').fill(`(737) ${exchange}-${line}`);
  await dialog.getByRole('button', { name: 'Text me a code' }).click();
  const codeField = dialog.getByLabel('6-digit code');
  await expect(codeField).toBeVisible();
  await codeField.fill(await textedCode(context, `+1737${exchange}${line}`));
  await expect(page.getByText('Your new phone number is verified.')).toBeVisible();
  await expect(page.getByText(`•••• ${line} · Verified`)).toBeVisible();
  expect(await page.content()).not.toContain(`${exchange}${line}`);
});

test('account: a profile photo shows everywhere and is public only while current', async ({ page, context, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'one project is enough');
  await signUp(page, context, fresh(testInfo.project.name, 'photo'));
  const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 90, g: 140, b: 120 } } }).png().toBuffer();

  await page.getByLabel('Add a photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
  // The adjust step (plan 9.3): kept as it opens, centred.
  await page.getByRole('dialog', { name: 'Adjust your photo' }).getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.getByText('Your new photo is saved.')).toBeVisible();
  const avatar = page.getByRole('img', { name: 'Profile photo of Casey M.' });
  await expect(avatar).toBeVisible();
  const src = await avatar.getAttribute('src');
  // Shown at 256 px (completion plan 5.7): the route resizes the stored 512 px square.
  expect(src).toMatch(/^\/api\/files\/fil_[0-9a-z]+\?w=256$/);
  // Cropped to a square, re-encoded, and readable without signing in while it's the current photo.
  const served = await request.get(src!);
  expect(served.status()).toBe(200);
  expect(served.headers()['content-type']).toBe('image/webp');
  const meta = await sharp(await served.body()).metadata();
  expect([meta.width, meta.height]).toEqual([256, 256]);
  const stored = await sharp(await (await request.get(src!.replace(/\?.*$/, ''))).body()).metadata();
  expect([stored.width, stored.height]).toEqual([512, 512]);

  // After a reload the account menu shows it too.
  await page.reload();
  await expect(page.getByRole('button', { name: /account menu for Casey M\./ }).locator('img')).toHaveAttribute('src', src!);

  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByText('Your photo was removed.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Avatar with initials CM' })).toBeVisible();
  expect((await request.get(src!)).status()).toBe(404);
  expect((await request.get(src!.replace(/\?.*$/, ''))).status()).toBe(404);
});
