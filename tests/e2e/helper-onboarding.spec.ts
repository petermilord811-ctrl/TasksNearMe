import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { freshHelper, retireFreshHelper, type FreshHelper } from './support/fresh-helper';
import { devSignIn, untilShown } from './support/sign-in';

/**
 * Helper onboarding with the checks in any order (owner, 2026-11-27: "not able to pick preferred verification. change
 * it."): the profile with the helper agreement, services and area, then Verifications, where every check is picked from
 * one list. The ID check opens as its own flow in a dialog (the Texas notice, the kind of ID, the front and back from
 * files, a live selfie from the camera, then "Verifying…" and the outcome); trust and safety open the photos with a
 * logged reason and approve them, and with no ID provider set up our own check is the verification. The home address
 * goes through its flow with a proof, payouts through the stand-in, then trust and safety approve the proof and Priya can
 * send offers. It onboards a fresh copy of Priya each time (support/fresh-helper.ts). Desktop only.
 */

// A camera for the live selfie: Chromium's fake device, with the permission granted.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

/** A plain white page as a PNG, as a photo of a bill would arrive. */
const bill = () => sharp({ create: { width: 800, height: 1000, channels: 3, background: '#ffffff' } }).png().toBuffer();
/** A card-shaped photo, as a photo of an ID would arrive. */
const card = () => sharp({ create: { width: 1000, height: 630, channels: 3, background: '#eef4fb' } }).png().toBuffer();

/** The copy the onboarding test made: back to a draft nobody sees afterwards, passed or not. */
let onboarded: FreshHelper | undefined;
test.afterEach(async () => {
  if (onboarded) await retireFreshHelper(onboarded);
  onboarded = undefined;
});

/** A check's row on Verifications (its link opens the check in a dialog). */
const checkRow = (page: Page, path: string) => page.locator(`a[href="${path}"]`).first();

test('a new helper picks the checks in any order: the ID in its flow, the home address with a proof, payouts, and becomes a verified helper', async ({ page, context, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(600_000);
  const helper = (onboarded = await freshHelper());
  const helperLink = () => page.getByRole('link', { name: /Priya S\./ }).and(page.locator(`[href*="/admin/users/${helper.id}"]`));
  // Address search uses the sample addresses, never Mapbox.
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
  for (const provider of ['payout']) await page.request.get(`/dev/providers/${provider}`);
  for (const path of ['/admin/verifications', `/admin/users/${helper.id}`, '/app/helper/verification', '/app/helper/onboarding/identity']) await page.request.get(path);
  // A draft profile isn't public yet.
  expect((await page.goto(`/helpers/${helper.handle}`))?.status()).toBe(404);
  await devSignIn(page, helper.email);

  // The profile in one flow (plan 9.11): What you do, Where you help, Introduce yourself.
  await page.goto('/app/helper/onboarding/profile');
  await expect(page.getByRole('heading', { level: 2, name: 'What you do' })).toBeVisible();
  await untilShown(page.getByRole('button', { name: /^Yard cleanup/, pressed: true }), () => page.getByRole('button', { name: /^Yard cleanup/ }).click());
  await page.getByText('By the hour', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'By the hour' })).toBeChecked();
  await page.getByLabel('Your hourly rate').fill('30');
  await page.getByLabel('Minimum hours').fill('2');
  await page.getByRole('button', { name: 'Add a note' }).click();
  await page.getByLabel('About your yard cleanup (optional)').fill('Leaves, weeding, and light hand pruning.');
  await page.getByRole('button', { name: 'Next: Where you help' }).click();
  await expect(page).toHaveURL(/\/onboarding\/profile#area$/);
  await expect(page.getByLabel('Home area')).toHaveValue('area_north_loop');
  await page.getByRole('button', { name: 'Next: Introduce yourself' }).click();
  await expect(page).toHaveURL(/\/onboarding\/profile#about$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Introduce yourself' })).toBeFocused();
  await page.getByLabel('Headline').fill('Careful yard help in North Loop');
  await page.getByLabel('About you', { exact: true }).fill('I rake, weed, and tidy yards carefully, and I bag everything for curbside pickup.');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Agree to the Helper agreement and the Community guidelines to continue.')).toBeVisible();
  await page.getByRole('checkbox', { name: /I agree to the Helper agreement/ }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // Verifications: every check on one list, picked in any order. The ID first.
  await expect(page).toHaveURL(/\/app\/helper\/verification$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Verifications' })).toBeVisible();
  await checkRow(page, '/app/helper/checks/identity').click();
  const idFlow = page.getByRole('dialog', { name: 'Verify your ID' });
  await expect(idFlow.getByRole('heading', { name: 'Verify your identity' })).toBeVisible({ timeout: 30_000 });
  await idFlow.getByRole('button', { name: 'Start' }).click();
  await expect(idFlow.getByText('Agree to continue.')).toBeVisible();
  await idFlow.getByRole('checkbox', { name: 'I agree to the ID and selfie check.' }).check();
  await idFlow.getByRole('button', { name: 'Start' }).click();
  await idFlow.getByRole('button', { name: /^Driver's license/ }).click();
  // The front and the back from files (as on a computer); the selfie live from the camera.
  await expect(idFlow.getByRole('heading', { name: 'Front of your license' })).toBeVisible();
  await idFlow.getByLabel('Upload a photo').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: await card() });
  await expect(idFlow.getByRole('heading', { name: 'Check your photo' })).toBeVisible();
  await idFlow.getByRole('button', { name: 'Looks good' }).click();
  await expect(idFlow.getByRole('heading', { name: 'Back of your license' })).toBeVisible();
  await idFlow.getByLabel('Upload a photo').setInputFiles({ name: 'back.png', mimeType: 'image/png', buffer: await card() });
  await idFlow.getByRole('button', { name: 'Looks good' }).click();
  await expect(idFlow.getByRole('heading', { name: 'Now a quick selfie' })).toBeVisible();
  await idFlow.getByRole('button', { name: 'Open camera' }).click();
  await idFlow.getByRole('button', { name: 'Take selfie' }).click();
  await expect(idFlow.getByRole('img', { name: 'Your selfie' })).toBeVisible();
  await idFlow.getByRole('button', { name: 'Submit' }).click();
  await expect(idFlow.getByRole('heading', { name: 'Verifying your ID' })).toBeVisible({ timeout: 30_000 });
  // A test account's photos are read by the stand-in, which is never sure: our team decides.
  await expect(idFlow.getByRole('heading', { name: 'Almost done' })).toBeVisible({ timeout: 90_000 });
  await idFlow.getByRole('button', { name: 'Done' }).click();
  await expect(idFlow).toBeHidden();

  // Trust and safety open the photos (a logged reason) and approve them.
  await page.context().clearCookies();
  await staffSignIn(page, 'taylor@example.test');
  await page.goto('/admin/verifications?queue=identity');
  await helperLink().click();
  await expect(page).toHaveURL(new RegExp(`/admin/users/${helper.id}$`), { timeout: 60_000 });
  const staffSection = page.getByRole('region', { name: 'Verification' });
  await staffSection.getByRole('button', { name: 'Open the photos' }).click();
  const openPhotos = page.getByRole('dialog', { name: 'Open the ID photos' });
  await openPhotos.getByLabel('Reason').fill('Comparing the ID photos Priya just sent.');
  await openPhotos.getByRole('button', { name: 'Open' }).click();
  await expect(staffSection.getByText('Opened and logged')).toBeVisible();
  for (const photo of ['The front of the ID', 'The back of the ID', 'The selfie']) {
    await expect(staffSection.getByRole('img', { name: photo })).toBeVisible();
    await expect.poll(() => staffSection.getByRole('img', { name: photo }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  }
  await staffSection.getByRole('button', { name: 'Review' }).click();
  const reviewPhotos = page.getByRole('dialog', { name: 'Review the ID photos' });
  await reviewPhotos.getByLabel('Note for the audit log').fill('The selfie matches the ID and follows its prompt.');
  await reviewPhotos.getByRole('button', { name: 'Approve' }).click();
  await expect(staffSection.getByText('Updated.')).toBeVisible();

  // With no ID provider set up, our own check is the verification: no double check.
  await page.context().clearCookies();
  await devSignIn(page, helper.email);
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
  await page.goto('/app/helper/verification');
  await expect(checkRow(page, '/app/helper/checks/identity').getByText('Verified').first()).toBeAttached();

  // The home address with a proof of address, in its flow.
  await checkRow(page, '/app/helper/checks/address').click();
  const addressFlow = page.getByRole('dialog', { name: 'Verify your home address' });
  await addressFlow.getByRole('button', { name: 'Start' }).click();
  await addressFlow.getByRole('combobox', { name: 'Your home address' }).fill('1234 Example');
  await addressFlow.getByRole('option', { name: /1234 Example Lane/ }).first().click();
  await addressFlow.getByLabel('Apartment or unit (optional)').fill('Apt 2');
  await addressFlow.getByRole('button', { name: 'Continue' }).click();
  await addressFlow.getByRole('button', { name: /^Utility bill/ }).click();
  await addressFlow.locator('input[type="file"]').first().setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: await bill() });
  await expect(addressFlow.getByText('bill.png')).toBeVisible();
  await addressFlow.getByRole('checkbox', { name: /It shows my name and this address/ }).check();
  await addressFlow.getByRole('button', { name: 'Submit' }).click();
  await expect(addressFlow.getByRole('heading', { name: 'Checking your document' })).toBeVisible({ timeout: 30_000 });
  await expect(addressFlow.getByRole('heading', { name: 'Almost done' })).toBeVisible({ timeout: 90_000 });
  await addressFlow.getByRole('button', { name: 'Done' }).click();
  await expect(addressFlow).toBeHidden();

  // Payouts through the stand-in, while the proof waits.
  await page.getByRole('button', { name: 'Set up' }).click();
  await expect(page).toHaveURL(/\/dev\/providers\/payout$/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Complete: payouts active' }).click();
  await expect(page).toHaveURL(/\/onboarding\/payout$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Verifications' })).toBeVisible();

  // Trust and safety review the proof.
  await page.context().clearCookies();
  await staffSignIn(page, 'taylor@example.test');
  await page.goto('/admin/verifications?queue=address');
  await helperLink().click();
  await expect(page).toHaveURL(new RegExp(`/admin/users/${helper.id}$`), { timeout: 60_000 });
  const section = page.getByRole('region', { name: 'Verification' });
  await section.getByRole('button', { name: 'Open the proof' }).click();
  const reveal = page.getByRole('dialog', { name: 'Open the proof of address' });
  await reveal.getByLabel('Reason').fill('Reviewing the proof Priya just sent.');
  await reveal.getByRole('button', { name: 'Open' }).click();
  await expect(section.getByText('Opened and logged')).toBeVisible();
  await expect(section.getByText('1234 Example Lane, Apt 2, Austin, TX 78723')).toBeVisible();
  await section.getByRole('button', { name: 'Review' }).click();
  const decide = page.getByRole('dialog', { name: 'Review the proof of address' });
  await decide.getByLabel('Note for the audit log').fill('Name, address and date all match the bill.');
  await decide.getByRole('button', { name: 'Approve' }).click();
  await expect(section.getByText('Updated.')).toBeVisible();

  // Priya: every check that applies is done (yard work needs no background check): a verified helper.
  await page.context().clearCookies();
  await devSignIn(page, helper.email);
  await page.goto('/app/helper/verification');
  await expect(page.getByText("You're a verified helper.")).toBeVisible();
  const response = await page.goto(`/helpers/${helper.handle}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: helper.displayName })).toBeVisible();
  // The profile's verified line (2026-11-27): "Verified: ID · Background · Address · Phone", each word explained on tap.
  await expect(page.getByRole('list', { name: 'Verification badges' }).getByRole('button', { name: 'Address', exact: true })).toBeVisible();
  await expect(page.getByText('1234 Example Lane')).toHaveCount(0);
});

test('every check opens before the profile is set up (owner, 2026-11-27)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'reads Priya before onboarding; mobile only');
  await devSignIn(page, 'priya@example.test');
  await page.goto('/app/helper/onboarding/payout');
  await expect(page).toHaveURL(/\/app\/helper\/onboarding\/payout$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Verifications' })).toBeVisible();
  await page.goto('/app/helper/onboarding/identity');
  await expect(page.getByRole('heading', { name: 'Verify your identity' })).toBeVisible();
});
