import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Passkeys (blueprint 01 P2) with Chromium's virtual authenticator (a platform authenticator with user
 * verification): add one on the account page, sign out, and sign back in with it from the email step.
 */

test('a passkey added on the account page signs the person back in', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'one virtual authenticator, one project');
  test.setTimeout(120_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  await devSignIn(page, 'priya@example.test');

  await page.goto('/app/account');
  await page.getByLabel('Name this passkey').fill('Test laptop');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Passkey added. Next time, sign in with it.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Test laptop')).toBeVisible();

  // Sign out, then back in with the passkey.
  await context.clearCookies();
  await page.goto('/sign-in?next=%2Fapp%2Faccount');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL(/\/app\/account$/, { timeout: 45_000 });

  // Leave Priya as she was.
  await page.getByRole('button', { name: 'Remove passkey Test laptop' }).click();
  await expect(page.getByText('Passkey removed.')).toBeVisible({ timeout: 30_000 });
});
