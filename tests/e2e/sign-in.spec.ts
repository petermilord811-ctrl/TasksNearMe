import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { setAccountStatus } from './support/scenarios';
import { submitEmailStep, untilShown } from './support/sign-in';

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
  await submitEmailStep(page, email);
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
    // The sixth digit sends the code (no Continue click).
    const code = await latestCode(context, email);
    if (code !== '000000') await expect(page.getByText("That code isn't right")).toBeVisible();
    await page.getByLabel('6-digit code').fill(code);
    // The sixth digit sends the code (no Continue click).

    await completeProfile(page, 'Robin', 'Lopez');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('RL', { exact: true }).first()).toBeVisible();

    // Sign-up done: the welcome email arrives (once), written for the side of the app the account is on. /sign-in asks
    // no side, so a poster's: posting a task is its one button.
    const outbox = await context.newPage();
    const welcome = outbox.locator(`[data-testid="outbox-message"][data-to="${email}"][data-tag="welcome"]`);
    await expect(async () => {
      await outbox.goto(`/dev/outbox?to=${encodeURIComponent(email)}`);
      await expect(welcome).toHaveCount(1, { timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(welcome).toContainText('Welcome to TasksNearMe, Robin');
    await expect(outbox.frameLocator('iframe').first().getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', /\/app\/tasks\/new$/);
    await outbox.close();
  });

  test('making an offer asks for a verified phone first', async ({ page, context }, testInfo) => {
    const email = freshEmail(testInfo.project.name);
    const line = String(Math.floor(1000 + Math.random() * 9000));
    const exchange = String(Math.floor(200 + Math.random() * 700));
    await page.goto(`/sign-in?next=${encodeURIComponent('/app/find-work/tsk_desk')}`);
    await requestCode(page, email);
    await page.getByLabel('6-digit code').fill(await latestCode(context, email));
    // The sixth digit sends the code (no Continue click).
    await completeProfile(page, 'Sky', 'Nguyen');

    await expect(page.getByRole('heading', { level: 1, name: 'Add your phone number' })).toBeVisible();
    await page.getByLabel('Phone number').fill(`(737) ${exchange}-${line}`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Enter the code we texted to \(737\)/ })).toBeVisible();
    await page.getByLabel('6-digit code').fill(await latestCode(context, `+1737${exchange}${line}`));
    // The sixth digit sends the code (no Continue click).
    await expect(page).toHaveURL(/\/app\/find-work\/tsk_desk$/);
  });

  test('posting asks a signed-in person for their phone inside the app, then opens the wizard (journeys on a phone, J-C2)', async ({ page, context }, testInfo) => {
    const email = freshEmail(testInfo.project.name);
    const line = String(Math.floor(1000 + Math.random() * 9000));
    const exchange = String(Math.floor(200 + Math.random() * 700));
    await page.goto('/sign-in');
    await requestCode(page, email);
    await page.getByLabel('6-digit code').fill(await latestCode(context, email));
    await completeProfile(page, 'Lee', 'Park');
    await expect(page).toHaveURL(/\/app$/);

    await page.goto('/app/tasks/new');
    // Gainesville opens soon, so a new account needs a client invite first (J-V8): the test world's code lets it in.
    await expect(page.getByRole('heading', { level: 1, name: 'Gainesville opens soon' })).toBeVisible();
    await page.getByLabel('Invite code').fill('SPECCLIENT');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/verify-phone\?next=%2Fapp%2Ftasks%2Fnew$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Add your phone number' })).toBeVisible();
    // The app's own frame (the account button with the person's initials), not the public site's, and no sign-in
    // account line.
    await expect(page.getByText('LP', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('One account for getting help and for helping out.')).toHaveCount(0);
    await page.getByLabel('Phone number').fill(`(352) ${exchange}-${line}`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Enter the code we texted to \(352\)/ })).toBeVisible();
    await page.locator('input[autocomplete="one-time-code"]').filter({ visible: true }).first().fill(await latestCode(context, `+1352${exchange}${line}`));
    await expect(page).toHaveURL(/\/app\/tasks\/new(\?step=[a-z]+)?$/, { timeout: 30_000 });
    await expect(page.getByText('Step 1 of 7', { exact: false })).toBeVisible();
  });

  test('a code sent before the account was suspended no longer signs in', async ({ page, context }, testInfo) => {
    const email = freshEmail(testInfo.project.name);
    await page.goto('/sign-in');
    await requestCode(page, email);
    await page.getByLabel('6-digit code').fill(await latestCode(context, email));
    // The sixth digit sends the code (no Continue click).
    await completeProfile(page, 'Casey', 'Mills');
    await expect(page).toHaveURL(/\/app$/);
    await context.clearCookies();

    // A new code, then staff suspend the account before it's used.
    await page.goto('/sign-in');
    await requestCode(page, email);
    const code = await latestCode(context, email);
    await setAccountStatus(email, 'suspended');
    await page.getByLabel('6-digit code').fill(code);
    // The sixth digit sends the code (no Continue click).
    await expect(page.getByText("This account can't continue.")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('the 4th code request in a row is rate-limited', async ({ page }, testInfo) => {
    const email = freshEmail(testInfo.project.name);
    await page.goto('/sign-in');
    for (let i = 0; i < 3; i += 1) {
      await requestCode(page, email);
      await page.getByRole('button', { name: 'Use a different email' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in', exact: true })).toBeVisible();
    }
    await untilShown(page.getByText('There have been too many attempts'), async () => {
      await page.getByLabel('Email').fill(email, { timeout: 5_000 });
      await page.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 5_000 });
    });
    // The time names the page's market zone (plan 8.1), such as "Eastern Time" while Gainesville is the default.
    await expect(page.getByText(/Try again after .+ \(\w+ Time\)/)).toBeVisible();
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
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in', exact: true })).toBeVisible();
  });
});

test.describe('waitlist, help, and legal', () => {
  test('joining the waitlist confirms the ZIP', async ({ page }, testInfo) => {
    await page.goto('/waitlist');
    const email = freshEmail(testInfo.project.name);
    await untilShown(page.getByText("You're on the list."), async () => {
      await page.getByLabel('Email').fill(email, { timeout: 5_000 });
      await page.getByLabel('ZIP code').fill('10001', { timeout: 5_000 });
      await page.getByLabel('I want to help').check({ timeout: 5_000 });
      await page.getByRole('button', { name: 'Join the waitlist' }).click({ timeout: 5_000 });
    });
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
    await expect(page.getByText(/\$51\.00/).first()).toBeVisible();
  });
});
