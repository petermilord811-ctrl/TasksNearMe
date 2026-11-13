import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { devSignIn } from './support/sign-in';

/**
 * Helper onboarding through the dev provider stand-ins: the profile with the helper agreement, services,
 * area, the phone (already verified for Priya), the ID check with the biometric notice, the home address
 * with a proof of address, and payouts. Trust and safety then review the proof (opened with a logged
 * reason) and approve it, and Priya can send offers. Changes Priya's data: desktop only.
 */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

/** A plain white page as a PNG, as a photo of a bill would arrive. */
const bill = () => sharp({ create: { width: 800, height: 1000, channels: 3, background: '#ffffff' } }).png().toBuffer();

test('a new helper finishes onboarding, staff verify the home address, and the helper becomes bookable', async ({ page, context, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(300_000);
  // Address search uses the sample addresses, never Mapbox.
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
  // The dev server compiles routes on first use; warm up the provider stand-ins before the flow needs them.
  for (const provider of ['identity', 'payout', 'background']) await page.request.get(`/dev/providers/${provider}`);
  for (const path of ['/admin/verifications', '/admin/users/usr_priya', '/app/helper/onboarding/address']) await page.request.get(path);
  // A draft profile isn't public yet.
  expect((await page.goto('/helpers/priya-s'))?.status()).toBe(404);
  await devSignIn(page, 'priya@example.test');

  // Profile, with the helper agreement
  await page.goto('/app/helper/onboarding/profile');
  await page.getByLabel('Headline').fill('Careful yard help in North Loop');
  await page.getByLabel('About you', { exact: true }).fill('I rake, weed, and tidy yards carefully, and I bag everything for curbside pickup.');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Agree to the Helper agreement and the Community guidelines to continue.')).toBeVisible();
  await page.getByRole('checkbox', { name: /I agree to the Helper agreement/ }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // Services: yard cleanup needs no background check
  await expect(page).toHaveURL(/\/onboarding\/services$/);
  await page.getByRole('button', { name: 'Add service' }).click();
  await page.getByLabel('Service category').selectOption('yard-cleanup');
  await page.getByLabel('Pricing type').selectOption('hourly');
  await page.getByLabel('Hourly rate ($)').fill('30');
  await page.getByLabel('Minimum hours').fill('2');
  await page.getByLabel('Service description').fill('Leaves, weeding, and light hand pruning.');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // Steps already done are skipped: Priya's seeded profile has its area, and her phone was verified at
  // sign-up, so "Save and continue" goes straight to the ID check. The area step still saves.
  await expect(page).toHaveURL(/\/onboarding\/identity$/);
  await page.goto('/app/helper/onboarding/area');
  await page.getByLabel('Home area').selectOption({ label: 'North Loop' });
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // ID check through the stand-in, after the Texas biometric notice
  await expect(page).toHaveURL(/\/onboarding\/identity$/);
  await page.getByRole('button', { name: 'Start ID check' }).click();
  await expect(page.getByText('Agree to the biometric check to start your ID check.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'I agree to the biometric check described here.' }).check();
  await page.getByRole('button', { name: 'Start ID check' }).click();
  await expect(page).toHaveURL(/\/dev\/providers\/identity\?session=/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Pass: verified', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/identity$/);

  // Home address with a proof of address
  await page.goto('/app/helper/onboarding/address');
  await page.getByRole('combobox', { name: 'Your home address' }).fill('1234 Example');
  await page.getByRole('option', { name: /1234 Example Lane/ }).first().click();
  await page.getByLabel('Apartment or unit (optional)').fill('Apt 2');
  await page.getByRole('radio', { name: 'Utility bill' }).check();
  await page.getByLabel('Document', { exact: true }).setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: await bill() });
  await expect(page.getByText('bill.png')).toBeVisible();
  await page.getByRole('checkbox', { name: /This document shows my name and this address/ }).check();
  await page.getByRole('button', { name: 'Send for review' }).click();
  // On to payouts while the proof waits.
  await expect(page).toHaveURL(/\/onboarding\/payout$/, { timeout: 30_000 });

  // Payouts through the stand-in
  await page.getByRole('button', { name: 'Set up payouts' }).click();
  await expect(page).toHaveURL(/\/dev\/providers\/payout$/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Complete: payouts active' }).click();
  await expect(page).toHaveURL(/\/onboarding\/payout$/);

  // Not bookable while the address is in review
  await page.goto('/app/helper/onboarding/done');
  await expect(page.getByText('A few steps left')).toBeVisible();
  await page.goto('/app/helper/onboarding/address');
  await expect(page.getByText(/We're reviewing your document/)).toBeVisible();
  await expect(page.getByText('1234 Example Lane, Apt 2, Austin, TX 78723')).toBeVisible();

  // Trust and safety review the proof
  await page.context().clearCookies();
  await staffSignIn(page, 'taylor@example.test');
  await page.goto('/admin/verifications?queue=address');
  await page.getByRole('link', { name: /Priya S\./ }).click();
  await expect(page).toHaveURL(/\/admin\/users\/usr_priya$/, { timeout: 60_000 });
  const section = page.getByRole('region', { name: 'Verification' });
  await section.getByRole('button', { name: 'Open the proof' }).click();
  const reveal = page.getByRole('dialog', { name: 'Open the proof of address' });
  await reveal.getByLabel('Reason').fill('Reviewing the proof Priya just sent.');
  await reveal.getByRole('button', { name: 'Open' }).click();
  await expect(section.getByText('Opened and logged')).toBeVisible();
  await expect(section.getByText('1234 Example Lane, Apt 2, Austin, TX 78723')).toBeVisible();
  await expect(section.getByRole('img', { name: 'The proof of address' })).toBeVisible();
  await section.getByRole('button', { name: 'Review' }).click();
  const decide = page.getByRole('dialog', { name: 'Review the proof of address' });
  await decide.getByLabel('Note for the audit log').fill('Name, address and date all match the bill.');
  await decide.getByRole('button', { name: 'Approve' }).click();
  await expect(section.getByText('Updated.')).toBeVisible();
  await expect(section.getByText('Address verified').first()).toBeVisible();

  // Priya: bookable, and the public profile is live with the address badge (never the address)
  await page.context().clearCookies();
  await devSignIn(page, 'priya@example.test');
  await page.goto('/app/helper/onboarding/done');
  await expect(page.getByText('You can make offers now')).toBeVisible();
  const response = await page.goto('/helpers/priya-s');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Priya S.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Address verified/ })).toBeVisible();
  await expect(page.getByText('1234 Example Lane')).toHaveCount(0);
});

test('locked onboarding steps send people back to the step still to do', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'reads Priya before onboarding; mobile only');
  await devSignIn(page, 'priya@example.test');
  await page.goto('/app/helper/onboarding/payout');
  await expect(page).toHaveURL(/\/app\/helper\/onboarding\/(profile|services|area|phone|identity)$/);
});
