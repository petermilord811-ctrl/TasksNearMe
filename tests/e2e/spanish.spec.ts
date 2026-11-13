import { expect, test, type BrowserContext } from '@playwright/test';
import accountEs from '../../messages/es/ui/account.json';
import formsEs from '../../messages/es/ui/forms.json';
import shellEn from '../../messages/en/ui/shell.json';
import shellEs from '../../messages/es/ui/shell.json';
import signInEs from '../../messages/es/ui/signIn.json';
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

test('a browser in Spanish gets the site in Spanish, and the footer switches this device', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('link', { name: shellEs.postTask }).first()).toBeVisible();

  await page.getByRole('navigation', { name: shellEs.footer.language }).getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // The choice sticks for this device, whatever the browser's languages.
  await page.goto('/how-it-works');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.getByRole('navigation', { name: shellEn.footer.language }).getByRole('link', { name: 'Español' }).click();
  await expect(page).toHaveURL(/\/es\/how-it-works$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('help articles read in Spanish, dates included', async ({ page }) => {
  await page.goto('/es/help/when-am-i-charged');
  await expect(page.getByRole('heading', { level: 1, name: '¿Cuándo me cobran?' })).toBeVisible();
  await expect(page.getByText(/11 de nov de 2026/)).toBeVisible();
});

test('someone who signs up in Spanish gets a Spanish account, and can switch it to English', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  const email = `e2e-es-${testInfo.project.name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto('/sign-in');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await submitEmailStep(page, email, { email: formsEs.fields.email.label, submit: formsEs.continue, next: signInEs.emailCode.title });
  await page.getByLabel(formsEs.fields.code.label).fill(await latestCode(context, email));
  await expect(page.getByRole('heading', { level: 1, name: signInEs.profile.title })).toBeVisible();
  await page.getByLabel(formsEs.fields.firstName.label).fill('Rosa');
  await page.getByLabel(formsEs.fields.lastName.label).fill('Díaz');
  await page.getByLabel(signInEs.profile.adultAttested).check();
  await page.getByLabel(signInEs.profile.termsAccepted).check();
  await page.getByRole('button', { name: formsEs.continue, exact: true }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });

  await page.goto('/app/account');
  const spanish = page.getByRole('group', { name: accountEs.language.title });
  await expect(spanish.getByRole('radio', { name: 'Español' })).toBeChecked();
  // The account and this device switch at once; the page loads again in English. (A tap before the page
  // hydrates does nothing on a cold dev server: tap again until it takes.)
  await expect(async () => {
    if ((await page.locator('html').getAttribute('lang')) === 'en') return;
    await spanish.getByRole('radio', { name: 'English' }).click({ timeout: 5_000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en', { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  await expect(page.getByRole('group', { name: 'Language' }).getByRole('radio', { name: 'English' })).toBeChecked();
});
