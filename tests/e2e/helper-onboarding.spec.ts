import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { freshHelper, retireFreshHelper, type FreshHelper } from './support/fresh-helper';
import { devSignIn, untilShown } from './support/sign-in';

/**
 * Helper onboarding through the dev provider stand-ins: the profile with the helper agreement, services,
 * area, the phone (already verified for Priya), the ID check in two stages (our own photos after the
 * Texas notice: the ID's front and back from files and a live selfie from the camera, which trust and
 * safety open with a logged reason and approve; then the provider's double check), the home address with
 * a proof of address, and payouts. Trust and safety then review the proof (opened with a logged reason)
 * and approve it, and Priya can send offers. It onboards a fresh copy of Priya each time (support/fresh-helper.ts), so
 * a retry or a repeat starts over, and seeded Priya stays as the next test reads her. Desktop only.
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

test('a new helper finishes onboarding, staff verify the ID photos and the home address, and the helper becomes bookable', async ({ page, context, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  // Two staff reviews and two provider stand-ins: on a dev server that compiles each page on first use, it's long.
  test.setTimeout(600_000);
  const helper = (onboarded = await freshHelper());
  // Staff find this copy in their queues by its page (other runs' copies share the name).
  const helperLink = () => page.getByRole('link', { name: /Priya S\./ }).and(page.locator(`[href*="/admin/users/${helper.id}"]`));
  // Address search uses the sample addresses, never Mapbox.
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
  // The dev server compiles routes on first use; warm up the provider stand-ins before the flow needs them.
  for (const provider of ['identity', 'payout', 'background']) await page.request.get(`/dev/providers/${provider}`);
  for (const path of ['/admin/verifications', `/admin/users/${helper.id}`, '/app/helper/onboarding/identity', '/app/helper/onboarding/address']) await page.request.get(path);
  // A draft profile isn't public yet.
  expect((await page.goto(`/helpers/${helper.handle}`))?.status()).toBe(404);
  await devSignIn(page, helper.email);

  // The profile in one flow (plan 9.11): What you do, Where you help, Introduce yourself. The copy, like seeded Priya, has
  // her area but no services, so the flow opens at What you do. Yard cleanup needs no background check.
  await page.goto('/app/helper/onboarding/profile');
  await expect(page.getByRole('heading', { level: 2, name: 'What you do' })).toBeVisible();
  // Pressed again if the first press came before the page hydrated.
  await untilShown(page.getByRole('button', { name: /^Yard cleanup/, pressed: true }), () => page.getByRole('button', { name: /^Yard cleanup/ }).click());
  // The segmented control's label covers its visually hidden radio: press the label.
  await page.getByText('By the hour', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'By the hour' })).toBeChecked();
  await page.getByLabel('Your hourly rate').fill('30');
  await page.getByLabel('Minimum hours').fill('2');
  await page.getByRole('button', { name: 'Add a note' }).click();
  await page.getByLabel('About your yard cleanup (optional)').fill('Leaves, weeding, and light hand pruning.');
  await page.getByRole('button', { name: 'Next: Where you help' }).click();
  // The part is in the address's fragment (the page's path stays).
  await expect(page).toHaveURL(/\/onboarding\/profile#area$/);
  await expect(page.getByLabel('Home area')).toHaveValue('area_north_loop');
  await page.getByRole('button', { name: 'Next: Introduce yourself' }).click();

  // Introduce yourself, with the helper agreement
  await expect(page).toHaveURL(/\/onboarding\/profile#about$/);
  // A part that opens takes focus to its heading a frame after the address changes (and scrolls up to it): typing waits
  // for that, so the focus can't move off a field while it's filled.
  await expect(page.getByRole('heading', { level: 2, name: 'Introduce yourself' })).toBeFocused();
  await page.getByLabel('Headline').fill('Careful yard help in North Loop');
  await page.getByLabel('About you', { exact: true }).fill('I rake, weed, and tidy yards carefully, and I bag everything for curbside pickup.');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Agree to the Helper agreement and the Community guidelines to continue.')).toBeVisible();
  await page.getByRole('checkbox', { name: /I agree to the Helper agreement/ }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  // The home address is next (owner, 2026-11-23: it opens helping); the checks come in any order, so the ID goes first here.
  await expect(page).toHaveURL(/\/onboarding\/address$/);
  await page.goto('/app/helper/onboarding/identity');

  // ID check, stage 1: our own photos, after the Texas biometric notice
  await expect(page).toHaveURL(/\/onboarding\/identity$/);
  const idCheck = page.getByRole('region', { name: 'ID check' });
  await idCheck.getByRole('button', { name: 'Continue' }).click();
  await expect(idCheck.getByText('Agree to the ID and selfie check to take your photos.')).toBeVisible();
  await idCheck.getByRole('checkbox', { name: 'I agree to the ID and selfie check described here.' }).check();
  await idCheck.getByRole('button', { name: 'Continue' }).click();
  await idCheck.getByRole('radio', { name: /Driver's license/ }).check();
  await idCheck.getByRole('button', { name: 'Continue' }).click();
  // The front and the back from files (as on a computer); the selfie live from the camera, with its prompt.
  await expect(idCheck.getByRole('heading', { name: 'The front of your ID' })).toBeVisible();
  await idCheck.getByLabel('Upload a photo').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: await card() });
  await idCheck.getByRole('button', { name: 'Use this photo' }).click();
  await expect(idCheck.getByRole('heading', { name: 'The back of your ID' })).toBeVisible();
  await idCheck.getByLabel('Upload a photo').setInputFiles({ name: 'back.png', mimeType: 'image/png', buffer: await card() });
  await idCheck.getByRole('button', { name: 'Use this photo' }).click();
  await expect(idCheck.getByText('For your selfie:')).toBeVisible();
  await idCheck.getByRole('button', { name: 'Take selfie' }).click();
  await expect(idCheck.getByRole('img', { name: 'Your selfie' })).toBeVisible();
  await idCheck.getByRole('button', { name: 'Use this photo' }).click();
  await expect(idCheck.getByRole('img', { name: 'Your photo of the front of your ID' })).toBeVisible();
  await idCheck.getByRole('button', { name: 'Send for review' }).click();
  await expect(idCheck.getByText(/We're comparing your photos/)).toBeVisible({ timeout: 30_000 });

  // Trust and safety open the photos (a logged reason) and approve them
  await page.context().clearCookies();
  await staffSignIn(page, 'taylor@example.test');
  await page.goto('/admin/verifications?queue=identity');
  await helperLink().click();
  await expect(page).toHaveURL(new RegExp(`/admin/users/${helper.id}$`), { timeout: 60_000 });
  const staffSection = page.getByRole('region', { name: 'Verification' });
  // Before the photos: the ID's details from its barcode, with a logged reason (a test account's are made up from it).
  await staffSection.getByRole('button', { name: "Show the ID's details" }).click();
  const details = page.getByRole('dialog', { name: "Show the ID's details" });
  await details.getByLabel('Why you need it').fill('Comparing the name with the account before the photos.');
  await details.getByRole('button', { name: 'Show the details' }).click();
  await expect(staffSection.getByText("Shown and logged: read from the ID's barcode.")).toBeVisible();
  await expect(staffSection.getByText('(matches the account)')).toBeVisible();
  await staffSection.getByRole('button', { name: 'Open the photos' }).click();
  const openPhotos = page.getByRole('dialog', { name: 'Open the ID photos' });
  await openPhotos.getByLabel('Reason').fill('Comparing the ID photos Priya just sent.');
  await openPhotos.getByRole('button', { name: 'Open' }).click();
  await expect(staffSection.getByText('Opened and logged')).toBeVisible();
  for (const photo of ['The front of the ID', 'The back of the ID', 'The selfie']) {
    await expect(staffSection.getByRole('img', { name: photo })).toBeVisible();
    // The photo loaded through its 5-minute link (decrypted for this staff member).
    await expect.poll(() => staffSection.getByRole('img', { name: photo }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  }
  await staffSection.getByRole('button', { name: 'Review' }).click();
  const reviewPhotos = page.getByRole('dialog', { name: 'Review the ID photos' });
  await reviewPhotos.getByLabel('Note for the audit log').fill('The selfie matches the ID and follows its prompt.');
  await reviewPhotos.getByRole('button', { name: 'Approve' }).click();
  await expect(staffSection.getByText('Updated.')).toBeVisible();
  await expect(staffSection.getByText('Approved').first()).toBeVisible();

  // ID check, stage 2: the double check through the provider stand-in
  await page.context().clearCookies();
  await devSignIn(page, helper.email);
  // Signing out dropped every cookie: address search keeps to the sample addresses.
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
  await page.goto('/app/helper/onboarding/identity');
  await expect(page.getByText('Our team approved your photos.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Start the double check' }).click();
  await expect(page).toHaveURL(/\/dev\/providers\/identity\?session=/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Pass: verified', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/identity$/);
  await expect(page.getByRole('button', { name: /ID verified/ })).toBeVisible();

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

  // Not helping yet while the address is in review: the last page waits for it, and sends her back to the address.
  await page.goto('/app/helper/onboarding/done');
  await expect(page).toHaveURL(/\/onboarding\/address$/);
  await expect(page.getByText(/We're reviewing your document/)).toBeVisible();
  await expect(page.getByText('1234 Example Lane, Apt 2, Austin, TX 78723')).toBeVisible();

  // Trust and safety review the proof
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
  await expect(section.getByRole('img', { name: 'The proof of address' })).toBeVisible();
  await section.getByRole('button', { name: 'Review' }).click();
  const decide = page.getByRole('dialog', { name: 'Review the proof of address' });
  await decide.getByLabel('Note for the audit log').fill('Name, address and date all match the bill.');
  await decide.getByRole('button', { name: 'Approve' }).click();
  await expect(section.getByText('Updated.')).toBeVisible();
  await expect(section.getByText('Address verified').first()).toBeVisible();

  // Priya: bookable, and the public profile is live with the address badge (never the address)
  await page.context().clearCookies();
  await devSignIn(page, helper.email);
  await page.goto('/app/helper/onboarding/done');
  // Every check that applies is done (yard work needs no background check): a verified helper, not only helping.
  await expect(page.getByRole('heading', { name: "You're a verified helper" })).toBeVisible();
  const response = await page.goto(`/helpers/${helper.handle}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: helper.displayName })).toBeVisible();
  // The profile's verified line (2026-11-27): "Verified: ID · Background · Address · Phone", each word explained on tap.
  await expect(page.getByRole('list', { name: 'Verification badges' }).getByRole('button', { name: 'Address', exact: true })).toBeVisible();
  await expect(page.getByText('1234 Example Lane')).toHaveCount(0);
});

test('locked onboarding steps send people back to the step still to do', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'reads Priya before onboarding; mobile only');
  await devSignIn(page, 'priya@example.test');
  await page.goto('/app/helper/onboarding/payout');
  await expect(page).toHaveURL(/\/app\/helper\/onboarding\/(profile|services|area|phone|identity)$/);
});
