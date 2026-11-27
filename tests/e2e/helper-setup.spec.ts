import sharp from 'sharp';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { submitEmailStep, untilShown } from './support/sign-in';

/**
 * Helper setup's profile in one flow (plan 9.11), for a new account on each project: What you do, Where you help and
 * Introduce yourself on one page, with Back and Next that keep everything, a reload that keeps what was typed, a part that
 * saves itself, the photo with its adjust step, a draft of the headline and about me, and Save and continue on to
 * the checks. Writing help uses the stand-in (never Claude) here.
 */

function fresh(project: string): string {
  return `e2e-setup-${project}-${Date.now()}-r${Math.floor(Math.random() * 1e6)}@example.test`;
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

async function signUp(page: Page, context: BrowserContext, email: string) {
  await page.goto('/sign-in');
  await submitEmailStep(page, email);
  await page.getByLabel('6-digit code').fill(await signInCode(context, email));
  await expect(page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toBeVisible();
  await page.getByLabel('First name').fill('Robin');
  await page.getByLabel('Last name').fill('Lane');
  await page.getByLabel(/18 or older/).check();
  await page.getByLabel(/I agree to the Terms of service/).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
}

const part = (page: Page, name: string) => page.getByRole('heading', { level: 2, name });

test('a new helper sets up their profile in one flow and goes on to the checks', async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(240_000);
  await context.addCookies([{ name: 'tnm_ai_stand_in', value: '1', url: baseURL! }]);
  await signUp(page, context, fresh(testInfo.project.name));
  await page.goto('/app/helper/onboarding/profile');

  // What you do: nothing chosen says so; two services, prefilled.
  await expect(part(page, 'What you do')).toBeVisible();
  await expect(page.getByText('Part 1 of 3')).toBeVisible();
  // The first press may come before the page hydrates: press again until the part answers.
  await untilShown(page.getByText('Choose at least one service.'), () => page.getByRole('button', { name: 'Next: Where you help' }).click());
  await page.getByRole('button', { name: /^Furniture assembly/ }).click();
  await page.getByRole('button', { name: /^Yard cleanup/ }).click();
  await expect(page.getByRole('button', { name: /^Furniture assembly/ })).toHaveAttribute('aria-pressed', 'true');
  const assemblyPrice = page.getByLabel('Your price, from').first();
  await expect(assemblyPrice).not.toHaveValue('');
  await assemblyPrice.fill('65');
  await page.getByRole('button', { name: 'Next: Where you help' }).click();

  // Where you help: the address's fragment follows the part (never its path: a save refreshes the page for the
  // address); a reload opens the same part and keeps the chosen neighborhood.
  await expect(part(page, 'Where you help')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/helper\/onboarding\/profile#area$/);
  const homeArea = page.getByLabel('Home area');
  await homeArea.selectOption({ index: 1 });
  const chosen = await homeArea.inputValue();
  // The part saves itself a moment after a change.
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(part(page, 'Where you help')).toBeVisible();
  await expect(page.getByLabel('Home area')).toHaveValue(chosen);

  // Back keeps what was chosen and typed.
  await untilShown(part(page, 'What you do'), () => page.getByRole('button', { name: 'Back' }).click());
  await expect(page.getByRole('button', { name: /^Yard cleanup/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Your price, from').first()).toHaveValue('65');
  await page.getByRole('button', { name: 'Next: Where you help' }).click();
  await page.getByRole('button', { name: 'Next: Introduce yourself' }).click();

  // Introduce yourself: a photo with its adjust step, a draft, the live card, and the agreement.
  await expect(part(page, 'Introduce yourself')).toBeVisible();
  // The browser's Back and Forward move between the parts too.
  await page.goBack();
  await expect(part(page, 'Where you help')).toBeVisible();
  await page.goForward();
  await expect(part(page, 'Introduce yourself')).toBeVisible();
  const photo = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 120, g: 90, b: 160 } } }).jpeg().toBuffer();
  const adjust = page.getByRole('dialog', { name: 'Adjust your photo' });
  await untilShown(adjust, () => page.getByLabel('Add a photo').setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: photo }));
  // The circle it marks is what everyone will see: the whole square that's saved, cropped round (aa's sweep S7). Both
  // measured at the same instant (the dialog scales in as it opens).
  const { frame, circle } = await adjust.getByTestId('photo-crop-frame').evaluate((element) => {
    const box = (node: Element | null) => (node ? (({ x, y, width, height }) => ({ x, y, width, height }))(node.getBoundingClientRect()) : null);
    return { frame: box(element), circle: box(element.querySelector('[data-testid="photo-crop-circle"]')) };
  });
  expect(circle).not.toBeNull();
  for (const side of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(circle![side] - frame![side])).toBeLessThanOrEqual(1);
  await adjust.getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.getByText('Your new photo is saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Draft my profile' }).click();
  await expect(page.getByLabel('Headline')).not.toHaveValue('');
  const headline = await page.getByLabel('Headline').inputValue();
  if (testInfo.project.name === 'app-desktop') {
    await expect(page.getByRole('complementary', { name: 'How clients see you' }).getByText(headline)).toBeVisible();
  } else {
    // The card the button opens (the desktop's card is on the page too, hidden on phones).
    const toggle = page.getByRole('button', { name: 'See how clients see you' });
    const card = page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`);
    await toggle.click();
    await expect(card.getByText(headline)).toBeVisible();
  }
  await page.getByRole('checkbox', { name: /I agree to the Helper agreement/ }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // On to Verifications, where the checks are picked in any order (owner, 2026-11-27).
  await expect(page).toHaveURL(/\/app\/helper\/verification$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Verifications' })).toBeVisible();
  // The profile reads like the public one (LinkedIn-style), its headline on the card.
  await page.goto('/app/helper/profile');
  await expect(page.getByText(headline).first()).toBeVisible();
});
