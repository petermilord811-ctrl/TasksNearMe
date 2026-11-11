import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/** Helper onboarding through the dev provider stand-ins. Changes Priya's data: desktop only. */

test('a new helper finishes onboarding and becomes bookable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(240_000);
  // The dev server compiles routes on first use; warm up the provider stand-ins before the flow needs them.
  for (const provider of ['identity', 'payout', 'background']) await page.request.get(`/dev/providers/${provider}`);
  // A draft profile isn't public yet.
  expect((await page.goto('/helpers/priya-s'))?.status()).toBe(404);
  await devSignIn(page, 'priya@example.test');

  // Profile
  await page.goto('/app/helper/onboarding/profile');
  await page.getByLabel('Headline').fill('Careful yard help in North Loop');
  await page.getByLabel('About you').fill('I rake, weed, and tidy yards carefully, and I bag everything for curbside pickup.');
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

  // Area
  await expect(page).toHaveURL(/\/onboarding\/area$/);
  await page.getByLabel('Home area').selectOption({ label: 'North Loop' });
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // ID check through the stand-in
  await expect(page).toHaveURL(/\/onboarding\/identity$/);
  await page.getByRole('button', { name: 'Start ID check' }).click();
  await expect(page).toHaveURL(/\/dev\/providers\/identity\?session=/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Pass: verified' }).click();
  await expect(page).toHaveURL(/\/onboarding\/identity$/);

  // Payouts through the stand-in
  await page.goto('/app/helper/onboarding/payout');
  await page.getByRole('button', { name: 'Set up payouts' }).click();
  await expect(page).toHaveURL(/\/dev\/providers\/payout$/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Complete: payouts active' }).click();
  await expect(page).toHaveURL(/\/onboarding\/payout$/);

  // Done: bookable, and the public profile is live
  await page.goto('/app/helper/onboarding/done');
  await expect(page.getByText('You can make offers now')).toBeVisible();
  const response = await page.goto('/helpers/priya-s');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Priya S.' })).toBeVisible();
});

test('locked onboarding steps send people back to the step still to do', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'reads Priya before onboarding; mobile only');
  await devSignIn(page, 'priya@example.test');
  await page.goto('/app/helper/onboarding/payout');
  await expect(page).toHaveURL(/\/app\/helper\/onboarding\/(profile|services|area|identity)$/);
});
