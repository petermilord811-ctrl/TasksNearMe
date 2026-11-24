import { expect, test, type BrowserContext } from '@playwright/test';
import accountEs from '../../messages/es/ui/account.json';
import formsEs from '../../messages/es/ui/forms.json';
import shellEn from '../../messages/en/ui/shell.json';
import shellEs from '../../messages/es/ui/shell.json';
import signInEs from '../../messages/es/ui/signIn.json';
import { openAccountGroup } from './support/account';
import { submitEmailStep } from './support/sign-in';

/**
 * Spanish (blueprint 01, P2): a browser in Spanish gets the site in Spanish; the footer switches this
 * device's language; someone who signs up in Spanish gets a Spanish account; the account page switches it.
 */

test.use({ locale: 'es-MX' });

/** The sign-in code from the dev outbox (the same as tests/e2e/sign-in.spec.ts). */
async function latestCode(context: BrowserContext, to: string): Promise<string> {
  const outbox = await context.newPage();
  try {
    await outbox.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
    const body = await outbox.locator(`[data-testid="outbox-message"][data-to="${to}"]:not([data-tag="welcome"]) pre`).first().textContent();
    const code = body?.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`no code sent to ${to}`);
    return code;
  } finally {
    await outbox.close();
  }
}

test('a browser in Spanish gets the site in Spanish, and the footer switches this device in place', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('link', { name: shellEs.postTask }).first()).toBeVisible();

  // The switch changes the language without reloading the page: something set on the page survives it.
  await page.evaluate(() => { (window as unknown as { tnmStayed?: boolean }).tnmStayed = true; });
  await page.getByRole('contentinfo').getByRole('navigation', { name: shellEs.footer.language }).getByRole('link', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole('link', { name: shellEn.postTask }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { tnmStayed?: boolean }).tnmStayed)).toBe(true);
  // The choice sticks for this device, whatever the browser's languages.
  await page.goto('/how-it-works');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.getByRole('contentinfo').getByRole('navigation', { name: shellEn.footer.language }).getByRole('link', { name: 'Español' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page).toHaveURL(/\/how-it-works$/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test.describe('a phone at 360 px', () => {
  test.use({ viewport: { width: 360, height: 800 } });
  test.skip(({ isMobile }) => !isMobile, 'a phone matter; one project is enough');

  test('keeps Sign in, the main button, the theme switch and the menu inside the bar, in Spanish and English (Spanish pass, 2026-11-21; owner, 2026-11-24)', async ({ page }) => {
    // Spanish's longer words used to push the menu past the bar's edge, out of reach: no navigation, no language switch.
    // Since 2026-11-24 the logo's words stack in two lines and the theme switch shows (but on the landing page), so
    // Sign in and the main button are round icons on phones, named with their whole words.
    for (const [path, shell] of [['/es/how-it-works', shellEs], ['/en/how-it-works', shellEn]] as const) {
      await page.goto(path);
      const bar = page.getByRole('banner').locator(':scope > div');
      const menu = bar.getByRole('button', { name: shell.openMenu });
      await expect(menu).toBeVisible();
      await expect(bar.getByRole('link', { name: shell.signIn, exact: true })).toBeVisible();
      const post = bar.getByRole('link', { name: shell.postTask, exact: true });
      await expect(post).toBeVisible();
      const round = (await post.boundingBox())!;
      expect(Math.abs(round.width - round.height)).toBeLessThanOrEqual(1);
      await expect(bar.getByRole('button', { name: shell.theme.toDark })).toBeVisible();
      const [edge, button] = await Promise.all([bar.boundingBox(), menu.boundingBox()]);
      expect(button!.x + button!.width).toBeLessThanOrEqual(Math.min(edge!.x + edge!.width, 360));
      expect(await bar.evaluate((row) => row.scrollWidth <= row.clientWidth + 1)).toBe(true);
      await menu.click();
      await expect(page.getByRole('dialog', { name: shell.menuTitle })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: shell.menuTitle })).toBeHidden();
    }
  });
});

test('an /es page opened as a page sets this device to Spanish; the router fetching it does not', async ({ request }) => {
  const cookieOf = (headers: { name: string; value: string }[]) =>
    headers.filter((header) => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith('NEXT_LOCALE=')).map((header) => header.value.split(';')[0]);
  // Spanish pages prefetch their /es links: a prefetch arriving after a switch to English must not undo it.
  const prefetch = await request.get('/es/pricing', { headers: { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' } });
  expect(prefetch.ok()).toBe(true);
  expect(cookieOf(prefetch.headersArray())).toEqual([]);
  const page = await request.get('/es/pricing', { headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } });
  expect(cookieOf(page.headersArray())).toEqual(['NEXT_LOCALE=es']);
});

test('help articles read in Spanish, dates included', async ({ page }) => {
  await page.goto('/es/help/when-am-i-charged');
  await expect(page.getByRole('heading', { level: 1, name: '¿Cuándo me cobran?' })).toBeVisible();
  await expect(page.getByText(/23 de nov de 2026/)).toBeVisible();
});

test('someone who signs up in Spanish gets a Spanish account, and can switch it to English', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  const email = `e2e-es-${testInfo.project.name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto('/sign-in');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await submitEmailStep(page, email, { email: formsEs.fields.email.label, submit: formsEs.continue, next: signInEs.emailCode.title });
  // The code comes in the language of the page that asked for it: the first message a new person gets (messages pass J-M8).
  const outbox = await context.newPage();
  await outbox.goto(`/dev/outbox?to=${encodeURIComponent(email)}`);
  await expect(outbox.locator(`[data-testid="outbox-message"][data-to="${email}"][data-tag="sign-in-code"]`).first()).toContainText(/\d{6} es tu código de TasksNearMe/);
  await outbox.close();
  await page.getByLabel(formsEs.fields.code.label).fill(await latestCode(context, email));
  await expect(page.getByRole('heading', { level: 1, name: signInEs.profile.title })).toBeVisible();
  await page.getByLabel(formsEs.fields.firstName.label).fill('Rosa');
  await page.getByLabel(formsEs.fields.lastName.label).fill('Díaz');
  await page.getByLabel(signInEs.profile.adultAttested).check();
  await page.getByLabel(signInEs.profile.termsAccepted).check();
  await page.getByRole('button', { name: formsEs.continue, exact: true }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });

  await page.goto('/app/account');
  // On phones the account's groups start folded; the language is under Notifications (plan 9.14b).
  await openAccountGroup(page, 'notifications');
  const spanish = page.getByRole('group', { name: accountEs.language.title });
  await expect(spanish.getByRole('radio', { name: 'Español' })).toBeChecked();
  // The account and this device switch at once; the page loads again in English. (A tap before the page
  // hydrates does nothing on a cold dev server: tap again until it takes.)
  await expect(async () => {
    if ((await page.locator('html').getAttribute('lang')) === 'en') return;
    await spanish.getByRole('radio', { name: 'English' }).click({ timeout: 5_000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en', { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  await openAccountGroup(page, 'notifications');
  await expect(page.getByRole('group', { name: 'Language' }).getByRole('radio', { name: 'English' })).toBeChecked();
});
