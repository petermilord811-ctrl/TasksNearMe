import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Signs in through /dev/sign-in, which runs the real email-code flow against the dev database, and waits
 * for the app home. The first request compiles the home in development, so it gets a longer wait.
 */
export async function devSignIn(page: Page, email: string, options: { landing?: RegExp } = {}): Promise<void> {
  await page.goto('/dev/sign-in');
  await page.locator('form', { has: page.locator(`input[name="email"][value="${email}"]`) }).getByRole('button').click();
  // Members land on the app home; staff on the two-step check.
  await expect(page).toHaveURL(options.landing ?? /\/app$/, { timeout: 45_000 });
}

/**
 * Acts until `done` shows. On a busy dev server, typing or clicking before the page hydrates is lost (the
 * form sees an empty field, or the click does nothing), so it acts again; once `done` shows it stops, so
 * nothing is sent twice.
 */
export async function untilShown(done: Locator, act: () => Promise<void>, timeout = 90_000): Promise<void> {
  await expect(async () => {
    if (await done.isVisible()) return;
    await act();
    await expect(done).toBeVisible({ timeout: 15_000 });
  }).toPass({ timeout });
}

/** The email step of /sign-in: the address and Continue, until the code step shows. Labels default to English. */
export async function submitEmailStep(
  page: Page,
  email: string,
  labels: { email: string; submit: string; next: string } = { email: 'Email', submit: 'Continue', next: 'Check your email' },
): Promise<void> {
  await untilShown(page.getByRole('heading', { level: 1, name: labels.next }), async () => {
    await page.getByLabel(labels.email).fill(email, { timeout: 5_000 });
    await page.getByRole('button', { name: labels.submit, exact: true }).click({ timeout: 5_000 });
  });
}
