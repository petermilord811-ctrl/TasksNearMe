import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { submitEmailStep } from './support/sign-in';
import { latestCode } from './support/outbox';

/**
 * A market opening soon takes clients by invitation (visitor-to-first-post walk, J-V8). A new account, in Gainesville
 * like every new account, meets "Gainesville opens soon" instead of the post form and a request to a helper, with the
 * waitlist on offer. A client code lets it in. The test world's code is SPECCLIENT (db/seeds/seed.ts).
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

test('a new client in a market opening soon is asked for an invite before posting or requesting, and a client code lets them in (J-V8)', async ({ page, context }, testInfo) => {
  test.setTimeout(150_000);
  const email = `e2e-prelaunch-${testInfo.project.name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await signUp(page, context, email);

  const opensSoon = page.getByRole('heading', { level: 1, name: 'Gainesville opens soon' });
  await page.goto('/app/tasks/new');
  await expect(opensSoon).toBeVisible();
  await expect(page.getByText('Helpers in Gainesville are joining now. Until we open to everyone, booking help is by invitation.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Join the waitlist' })).toHaveAttribute('href', '/waitlist?from=beta');

  // Requesting a helper (and Book again, the same form) waits for the same invite.
  await page.goto('/app/helpers/sam-k/request');
  await expect(opensSoon).toBeVisible();

  // The test world's client code opens it: the step goes, and posting carries on (the phone where texts work).
  await page.goto('/app/tasks/new');
  await page.getByLabel('Invite code').fill('SPECCLIENT');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(opensSoon).toHaveCount(0, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/app\/(verify-phone\?next=%2Fapp%2Ftasks%2Fnew|tasks\/new)/);
});
