import { expect, test, type Page } from '@playwright/test';

/**
 * "Continue with Google" and "Continue with Microsoft", through Better Auth's real flow with the stand-in
 * account chooser (/dev/oauth/<provider>) in place of the provider's page.
 */

function freshEmail(project: string, label: string): string {
  return `e2e-${label}-${project}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

async function chooseSomeoneElse(page: Page, provider: 'google' | 'microsoft', name: string, email: string, kind?: string) {
  await expect(page).toHaveURL(new RegExp(`/dev/oauth/${provider}`));
  await page.getByRole('textbox', { name: 'Full name' }).fill(name);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  if (kind) await page.getByRole('combobox', { name: 'Account' }).selectOption(kind);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

async function completeProfile(page: Page) {
  await page.getByLabel(/18 or older/).check();
  await page.getByLabel(/I agree to the Terms of service/).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

test.describe('sign-in with Google or Microsoft', () => {
  // The stand-in, even where real Google or Microsoft keys are set (development only).
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: 'tnm_oauth_stand_in', value: '1', url: baseURL! }]);
  });

  test('a new person continues with Google, finds their name filled in, and lands in the app', async ({ page }, testInfo) => {
    await page.goto('/sign-in?next=%2Fapp');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await chooseSomeoneElse(page, 'google', 'Robin Alvarez', freshEmail(testInfo.project.name, 'google'));

    await expect(page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toBeVisible();
    await expect(page.getByLabel('First name')).toHaveValue('Robin');
    await expect(page.getByLabel('Last name')).toHaveValue('Alvarez');
    await completeProfile(page);
    await expect(page).toHaveURL(/\/app$/);
  });

  test('someone with an account continues with Microsoft and goes straight in', async ({ page }) => {
    await page.goto('/sign-in?next=%2Fapp%2Faccount');
    await page.getByRole('button', { name: 'Continue with Microsoft' }).click();
    await page.getByRole('button', { name: /Sam Kim/ }).click();
    await expect(page).toHaveURL(/\/app\/account/);
    await expect(page.getByText('sam@example.test').first()).toBeVisible();
  });

  test('a work account whose email Microsoft doesn’t confirm is refused, and Cancel comes back too', async ({ page }) => {
    await page.goto('/sign-in?next=%2Fapp');
    await page.getByRole('button', { name: 'Continue with Microsoft' }).click();
    await page.getByRole('button', { name: /Drew Patel/ }).click();
    await expect(page.getByText("Microsoft didn't confirm the email address on that account")).toBeVisible();
    // The email code still works from here.
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();

    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Signing in with Google was cancelled')).toBeVisible();
  });

  test('connects Microsoft from the account page, then disconnects it', async ({ page }, testInfo) => {
    await page.goto('/sign-in?next=%2Fapp%2Faccount');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await chooseSomeoneElse(page, 'google', 'Quinn Mercer', freshEmail(testInfo.project.name, 'connect'));
    await completeProfile(page);
    await expect(page).toHaveURL(/\/app\/account/);

    await expect(page.getByRole('button', { name: 'Disconnect Google' })).toBeVisible();
    await page.getByRole('button', { name: 'Connect Microsoft' }).click();
    await chooseSomeoneElse(page, 'microsoft', 'Quinn Mercer', freshEmail(testInfo.project.name, 'outlook'), 'personal');
    await expect(page).toHaveURL(/\/app\/account\?connect=microsoft/);
    await expect(page.getByText('Microsoft is connected.')).toBeVisible();

    await page.getByRole('button', { name: 'Disconnect Microsoft' }).click();
    await expect(page.getByText('Microsoft is disconnected. You can still sign in with an email code.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect Microsoft' })).toBeVisible();
  });
});
