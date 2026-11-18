import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { untilShown } from './support/sign-in';

/**
 * `/sign-up` (completion plan 9.6): its own page for new people, then sign-in's code step. What it asked (the names,
 * 18+ and the terms, and what the person is here for) isn't asked again, and where they land follows their choice.
 */

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

function freshEmail(project: string): string {
  return `e2e-signup-${project}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** The stand-in account chooser (/dev/oauth/google) in place of Google's page, as in social-sign-in.spec.ts. */
async function chooseNewGoogleAccount(page: Page, name: string, email: string) {
  await expect(page).toHaveURL(/\/dev\/oauth\/google/, { timeout: 30_000 });
  await page.getByRole('textbox', { name: 'Full name' }).fill(name);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

/** The profile step after Google: the names are filled in from the account; 18+ and the terms are still asked. */
async function finishProfile(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(/18 or older/).check();
  await page.getByLabel(/I agree to the Terms of service/).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

/** The side of the app the account is on: the bar's switch (from the tablet width). */
function modeButton(page: Page, name: 'I need help' | 'I can help') {
  return page.getByRole('group', { name: 'Choose how to use TasksNearMe' }).getByRole('button', { name, exact: true });
}

test('a new person creates an account on its own page and lands where their choice leads, without the name step', async ({ page, context }, testInfo) => {
  test.setTimeout(150_000);
  // Desktop is here to help out (helper setup); the phone is here for help (the app).
  const helping = testInfo.project.name === 'app-desktop';
  const email = freshEmail(testInfo.project.name);
  await page.goto('/signup');
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('radio', { name: /I need help with tasks/ })).toBeChecked();
  if (helping) await page.getByRole('radio', { name: /I want to help and earn/ }).click();
  await page.getByLabel('First name').fill('Dana');
  await page.getByLabel('Last name').fill('Rivers');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/18 or older/).check();
  await page.getByLabel(/I agree to the Terms of service/).check();
  await untilShown(page.getByRole('heading', { level: 1, name: 'Check your email' }), async () => {
    await page.getByRole('button', { name: 'Create account', exact: true }).click({ timeout: 5_000 });
  });
  if (helping) await expect(page).toHaveURL(/\/sign-up\?next=%2Fapp%2Fhelper%2Fonboarding%2Fprofile$/);

  await page.getByLabel('6-digit code').fill(await latestCode(context, email));
  // The sixth digit sends the code. No "Tell us your name": the form already said it.
  // Helper setup (it opens at the first step still to do), or the app.
  await expect(page).toHaveURL(helping ? /\/app\/helper\/onboarding\/[a-z-]+$/ : /\/app$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toHaveCount(0);
  // The app's account button shows the initials of the names given on the form.
  if (!helping) await expect(page.getByText('DR', { exact: true }).first()).toBeVisible();

  // Sign-up is done: the welcome email goes out, as after the name step.
  const outbox = await context.newPage();
  const welcome = outbox.locator(`[data-testid="outbox-message"][data-to="${email}"][data-tag="welcome"]`);
  await expect(async () => {
    await outbox.goto(`/dev/outbox?to=${encodeURIComponent(email)}`);
    await expect(welcome).toHaveCount(1, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(welcome).toContainText('Welcome, Dana!');
  await outbox.close();
});

test('sign-in and the header lead to creating an account, and sign-up leads back to sign-in', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'the header shows Sign up from the desktop width; links only');
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('main').getByRole('link', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  // The header's (the page itself has no other).
  await page.goto('/how-it-works');
  await expect(page.getByRole('link', { name: 'Sign up', exact: true })).toHaveAttribute('href', '/sign-up');
});

test.describe('with Google', () => {
  test.beforeEach(async ({ context, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'app-desktop', 'the bar shows the mode switch from the tablet width; one project is enough');
    await context.addCookies([{ name: 'tnm_oauth_stand_in', value: '1', url: baseURL! }]);
  });

  test('someone here to help out continues with Google, and their new account opens on that side', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto('/sign-up');
    await page.getByRole('radio', { name: /I want to help and earn/ }).click();
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await chooseNewGoogleAccount(page, 'Robin Alvarez', freshEmail(testInfo.project.name));
    await finishProfile(page);
    await expect(page).toHaveURL(/\/app\/helper\/onboarding\/[a-z-]+$/, { timeout: 30_000 });
    await page.goto('/app');
    await expect(modeButton(page, 'I can help')).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  });

  test('a choice left on the browser by a start that went nowhere doesn’t reach the next account made there (aa’s sweep S8)', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    // Someone here to help out starts with Google, then leaves at the account chooser.
    await page.goto('/sign-up');
    await page.getByRole('radio', { name: /I want to help and earn/ }).click();
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page).toHaveURL(/\/dev\/oauth\/google/, { timeout: 30_000 });

    // The next person signs in with Google on /sign-in and gets a new account: it opens on the usual side.
    await page.goto('/sign-in?next=%2Fapp');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await chooseNewGoogleAccount(page, 'Kai Moreno', freshEmail(testInfo.project.name));
    await finishProfile(page);
    await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
    await expect(modeButton(page, 'I need help')).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  });
});
