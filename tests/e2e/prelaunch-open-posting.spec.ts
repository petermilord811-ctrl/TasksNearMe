import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { submitEmailStep } from './support/sign-in';
import { latestCode } from './support/outbox';

/**
 * Anyone can book help in a market opening soon (owner, 2026-11-23: "remove it", the client invite J-V8 asked for). A
 * new account, in Gainesville like every new account, goes on to the post form (its phone first, where texts work)
 * and to a request to a helper, and is never asked for an invite code.
 */

async function signUp(page: Page, context: BrowserContext, email: string) {
  await page.goto('/sign-in');
  await submitEmailStep(page, email);
  await page.getByLabel('6-digit code').fill(await latestCode(context, email));
  await expect(page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toBeVisible();
  await page.getByLabel('First name').fill('Noor');
  await page.getByLabel('Last name').fill('Haddad');
  await page.getByLabel(/18 or older/).check();
  await page.getByLabel(/I agree to the Terms of service/).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

test('a new client in a market opening soon posts and asks a helper without an invite (2026-11-23)', async ({ page, context }, testInfo) => {
  test.setTimeout(150_000);
  const email = `e2e-prelaunch-${testInfo.project.name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await signUp(page, context, email);
  const opensSoon = page.getByRole('heading', { level: 1, name: 'Gainesville opens soon' });

  // Post a task: the phone step on the page itself, then the form; no invite step.
  await page.goto('/app/tasks/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Add your phone number' })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/app\/tasks\/new$/);
  await expect(opensSoon).toHaveCount(0);
  await expect(page.getByLabel('Invite code')).toHaveCount(0);

  // Requesting a helper (and Book again, the same form) opens too.
  await page.goto('/app/helpers/sam-k/request');
  await expect(page.getByRole('heading', { level: 1, name: /^Ask .+ to help$/ })).toBeVisible({ timeout: 30_000 });
  await expect(opensSoon).toHaveCount(0);
});
