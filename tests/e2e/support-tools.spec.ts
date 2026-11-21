import { expect, test, type Page } from '@playwright/test';
import { askClientForId, CLIENT_ASKED_FOR_ID } from './support/poster-identity';
import { devSignIn } from './support/sign-in';

/**
 * Completion plan P2 on the dev data: a client our team asked to verify goes through the ID check and back
 * to posting; a lead writes a saved reply that a case can start from; staff read the response times.
 */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('a client asked to verify their ID goes through the check and back to posting', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'one client, one run at a time; phones first');
  test.setTimeout(180_000);
  await askClientForId();
  await devSignIn(page, CLIENT_ASKED_FOR_ID.email);

  await page.goto('/app/tasks/new');
  await expect(page).toHaveURL(/\/app\/verify-identity\?next=%2Fapp%2Ftasks%2Fnew$/, { timeout: 45_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Verify your ID' })).toBeVisible();
  await expect(page.getByText(/Our team asked for an ID check on your account/)).toBeVisible();

  // The Texas biometric notice comes first.
  await page.getByRole('button', { name: 'Start ID check' }).click();
  await expect(page.getByText('Agree to the biometric check to start your ID check.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'I agree to the biometric check described here.' }).check();
  await page.getByRole('button', { name: 'Start ID check' }).click();

  // The provider's page (the stand-in in development), then back to the client's ID page.
  await expect(page).toHaveURL(/\/dev\/providers\/identity\?session=/, { timeout: 45_000 });
  await page.getByRole('button', { name: 'Pass: verified' }).click();
  await expect(page).toHaveURL(/\/app\/verify-identity\?next=%2Fapp%2Ftasks%2Fnew$/, { timeout: 45_000 });
  await expect(page.getByText('Your ID is verified. You can carry on.')).toBeVisible();

  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/app\/tasks\/new(\?step=[a-z]+)?$/, { timeout: 45_000 });
});

test('a lead writes a saved reply, a case starts from it, and staff read the response times', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(180_000);
  const title = `Check-in ${Date.now().toString(36)}`;
  await staffSignIn(page, 'morgan@example.test');

  await page.goto('/admin/saved-replies');
  await expect(page.getByRole('heading', { level: 1, name: 'Saved replies' })).toBeVisible({ timeout: 45_000 });
  const form = page.getByRole('form', { name: 'New saved reply' });
  await form.getByLabel('Title').fill(title);
  await form.getByLabel('Queue').selectOption('requests');
  await form.getByLabel('Reply', { exact: true }).fill('Hi {first_name}, just checking in. {staff_name}');
  await form.getByRole('button', { name: 'Save reply' }).click();
  await expect(page.getByRole('heading', { level: 3, name: title })).toBeVisible();

  // Maya's payment question is in Requests: the reply starts from the saved one.
  await page.goto('/admin/cases/case_seed_maya_payment');
  // Until the page is interactive, picking does nothing: pick again until the reply box fills.
  await expect(async () => {
    await page.getByLabel('Start from a saved reply').selectOption({ label: title });
    await expect(page.getByLabel('Reply message')).toHaveValue('Hi {first_name}, just checking in. {staff_name}', { timeout: 2_000 });
  }).toPass({ timeout: 45_000 });

  // Leave the shared list as it was.
  await page.goto('/admin/saved-replies');
  await page.getByRole('button', { name: `Archive ${title}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('heading', { level: 3, name: title })).toBeHidden();

  await page.goto('/admin/response-times');
  await expect(page.getByRole('heading', { level: 1, name: 'Response times' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('heading', { level: 3, name: 'Disputes' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Who has the waiting cases' })).toBeVisible();
});
