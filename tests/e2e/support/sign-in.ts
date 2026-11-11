import { expect, type Page } from '@playwright/test';

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
