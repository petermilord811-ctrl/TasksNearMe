import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { setAccountStatus } from './support/scenarios';

/** The real sign-in flow: codes are read from the dev outbox (/dev/outbox). */

async function latestCode(context: BrowserContext, to: string): Promise<string> {
  const outbox = await context.newPage();
  try {
    // Only this address's messages: notification emails from other tests never push the code off the page.
    await outbox.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
    const body = await outbox.locator(`[data-testid="outbox-message"][data-to="${to}"]:not([data-tag="welcome"]) pre`).first().textContent();
    const code = body?.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`no code sent to ${to}`);
    return code;
  } finally {
    await outbox.close();
  }
}

/** A fresh address per run and project, so runs never collide. */
function freshEmail(project: string): string {
  return `e2e-${project}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

async function requestCode(page: Page, email: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
}

async function completeProfile(page: Page, first: string, last: string) {
  await expect(page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toBeVisible();
  await page.getByLabel('First name').fill(first);
  await page.getByLabel('Last name').fill(last);
  await page.getByLabel(/18 or older/).check();
  await page.getByLabel(/I agree to the Terms of service/).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

test.describe('sign-in and sign-up', () => {
  test('a new person signs up with an emailed code and their name, then lands in the app', async ({ page, context }, testInfo) => {
    const email = freshEmail(testInfo.project.name);
    await page.goto('/sign-in');
    await requestCode(page, email);

    // A wrong code shows on the field; the right one signs in.
    await page.getByLabel('6-digit code').fill('000000');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const code = await latestCode(context, email);
    if (code !== '000000') await expect(page.getByText("That code isn't right")).toBeVisible();
    await page.getByLabel('6-digit code').fill(code);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await completeProfile(page, 'Robin', 'Lopez');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('RL', { exact: true }).first()).toBeVisible();

    // Sign-up done: the welcome email arrives (once), leading with the founding helper gift card.
    const outbox = await context.newPage();
    const welcome = outbox.locator(`[data-testid="outbox-message"][data-to="${email}"][data-tag="welcome"]`);
    await expect(async () => {
      await outbox.goto(`/dev/outbox?to=${encodeURIComponent(email)}`);
      await expect(welcome).toHaveCount(1, { timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(welcome).toContainText('Welcome, Robin! Earn a $50 gift card as a founding helper');
    await expect(outbox.frameLocator('iframe').first().getByRole('link', { name: /Claim your spot/ }).first()).toHaveAttribute('href', /\/app\/helper\/onboarding\/profile$/);
    await outbox.close();
  });

  test('making an offer asks for a verified phone first', async ({ page, context }, testInfo) => {
    const email = freshEmail(testInfo.project.name);
    const line = String(Math.floor(1000 + Math.random() * 9000));
    const exchange = String(Math.floor(200 + Math.random() * 700));
    await page.goto(`/sign-in?next=${encodeURIComponent('/app/find-work/tsk_desk')}`);
    await requestCode(page, email);
    await page.getByLabel('6-digit code').fill(await latestCode(context, email));
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await completeProfile(page, 'Sky', 'Nguyen');

    await expect(page.getByRole('heading', { level: 1, name: 'Add your phone number' })).toBeVisible();
    await page.getByLabel('Phone number').fill(`(737) ${exchange}-${line}`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Enter the code we texted to \(737\)/ })).toBeVisible();
    await page.getByLabel('6-digit code').fill(await latestCode(context, `+1737${exchange}${line}`));
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/find-work\/tsk_desk$/);
  });

  test('a code sent before the account was suspended no longer signs in', async ({ page, context }, testInfo) => {
    const email = freshEmail(testInfo.project.name);
    await page.goto('/sign-in');
    await requestCode(page, email);
    await page.getByLabel('6-digit code').fill(await latestCode(context, email));
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await completeProfile(page, 'Casey', 'Mills');
    await expect(page).toHaveURL(/\/app$/);
    await context.clearCookies();

    // A new code, then staff suspend the account before it's used.
    await page.goto('/sign-in');
    await requestCode(page, email);
    const code = await latestCode(context, email);
    await setAccountStatus(email, 'suspended');
    await page.getByLabel('6-digit code').fill(code);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText("This account can't continue.")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('the 4th code request in a row is rate-limited', async ({ page }, testInfo) => {
    const email = freshEmail(testInfo.project.name);
    await page.goto('/sign-in');
    for (let i = 0; i < 3; i += 1) {
      await requestCode(page, email);
      await page.getByRole('button', { name: 'Use a different email' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in or create an account' })).toBeVisible();
    }
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('There have been too many attempts')).toBeVisible();
    await expect(page.getByText(/Try again after .* \(Central time\)/)).toBeVisible();
  });

  test('signed-in people skip sign-in', async ({ page }) => {
    await page.goto('/dev/sign-in');
    await page
      .locator('form', { has: page.locator('input[name="email"][value="chris@example.test"]') })
      .getByRole('button')
      .click();
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/sign-in?next=%2Fapp');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('unsafe next links fall back to the app', async ({ page }) => {
    await page.goto('/sign-in?next=https%3A%2F%2Fevil.example');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in or create an account' })).toBeVisible();
  });
});

test.describe('waitlist, help, and legal', () => {
  test('joining the waitlist confirms the ZIP', async ({ page }, testInfo) => {
    await page.goto('/waitlist');
    await page.getByLabel('Email').fill(freshEmail(testInfo.project.name));
    await page.getByLabel('ZIP code').fill('10001');
    await page.getByLabel('I want to help').check();
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByText("You're on the list.")).toBeVisible();
    await expect(page.getByText(/opens near 10001/)).toBeVisible();
  });

  test('help center lists topics and opens an article', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'When am I charged?' }).click();
    await expect(page).toHaveURL(/\/help\/when-am-i-charged$/);
    await expect(page.getByRole('heading', { level: 1, name: 'When am I charged?' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'pricing page' })).toHaveAttribute('href', '/pricing');
  });

  test('legal drafts say they are not in effect', async ({ page }) => {
    await page.goto('/legal/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeVisible();
    await expect(page.getByText(/not in effect yet/).first()).toBeVisible();
    await page.goto('/legal/cancellation-policy');
    await expect(page.getByText(/\$54\.00/).first()).toBeVisible();
  });
});
