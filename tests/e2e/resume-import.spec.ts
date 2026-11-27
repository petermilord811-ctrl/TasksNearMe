import { expect, test } from '@playwright/test';
import { freshHelper, retireFreshHelper, type FreshHelper } from './support/fresh-helper';
import { devSignIn } from './support/sign-in';

/**
 * "Import from resume" on the helper's own profile (owner, 2026-11-27: "By resume, configure user's profile ex: what user
 * can do, what user can like, what user can exclude"): the helper drops a resume, sees the suggestions to keep, adds them,
 * and the profile shows them. A test account gets the keyword suggestions (never an AI provider), so the run is the same
 * every time. A fresh copy of Priya each time (support/fresh-helper.ts). Desktop only.
 */

let helper: FreshHelper | undefined;
test.afterEach(async () => {
  if (helper) await retireFreshHelper(helper);
  helper = undefined;
});

const resume = [
  'Priya Sample',
  'Summary',
  'Careful, friendly helper who has spent five years putting furniture together and helping families settle into new homes.',
  'Experience',
  'Furniture assembler, Gator Home Goods, 2021 - present',
  'Assembled beds, desks, dressers and wardrobes for delivery customers, about fifteen pieces a week, and anchored tall pieces to the wall.',
  'Skills',
  'Furniture assembly, Wall mounting, Packing',
  'Languages: English, Spanish',
].join('\n');

test('a helper imports a resume, keeps the suggestions, and the profile shows them', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  helper = await freshHelper();
  await devSignIn(page, helper.email);
  await page.goto('/app/helper/profile');
  await page.getByRole('button', { name: 'Import from resume' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from resume' });
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'resume.txt', mimeType: 'text/plain', buffer: Buffer.from(resume) });
  await expect(dialog.getByText("Quick suggestions from your resume's words. Keep what fits.")).toBeVisible({ timeout: 60_000 });
  // Everything starts kept.
  await expect(dialog.getByRole('button', { name: 'Wall mounting', exact: true, pressed: true }).first()).toBeVisible();
  await dialog.getByRole('button', { name: /^Add \d+ items? to my profile$/ }).click();
  await expect(dialog.getByText('Added to your profile')).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  // The profile reads them as clients will.
  await expect(page.getByRole('heading', { level: 2, name: 'Skills' })).toBeVisible();
  await expect(page.getByText('Wall mounting').first()).toBeVisible();
  await expect(page.getByText('Furniture assembly').first()).toBeVisible();
});
