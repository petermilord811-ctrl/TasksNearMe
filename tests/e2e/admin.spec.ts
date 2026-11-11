import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/** Staff queues and case work (UI-018) on the seeded data: Maya's payment question waits on her in Requests. */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('staff see the queues and open a case', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  test.setTimeout(150_000);
  await staffSignIn(page, 'alex@example.test');
  await expect(page.getByRole('heading', { level: 1, name: 'Queues' })).toBeVisible();
  await expect(page.locator('a[href="/admin/cases?queue=requests&status=active"]')).toBeVisible();
  await page.goto('/admin/cases?queue=requests&status=waiting');
  await expect(page.getByRole('heading', { level: 1, name: 'Cases' })).toBeVisible();
  // Phones get cards, desktops a table: the role query skips the hidden one.
  await page.getByRole('link', { name: /Payment/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/cases\/case_seed_maya_payment$/, { timeout: 30_000 });
  await expect(page.getByText('I see a pending charge on my card for a booking I canceled. When does it go away?').first()).toBeVisible();
});

test('an agent takes the case and writes to Maya, who sees the reply', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  await staffSignIn(page, 'alex@example.test');
  await page.goto('/admin/cases/case_seed_maya_payment');
  await page.getByRole('button', { name: 'Assign to me' }).click();
  await expect(page.getByRole('button', { name: 'Unassign' })).toBeVisible();
  await page.getByLabel('Send to').selectOption({ label: 'Maya R.' });
  await page.getByLabel('Reply message').fill('The pending charge was released this morning.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText('The pending charge was released this morning.').first()).toBeVisible();

  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/support/case_seed_maya_payment');
  await expect(page.getByText('The pending charge was released this morning.')).toBeVisible();
});

test('members never see the staff area', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'read-only; one project is enough');
  await devSignIn(page, 'maya@example.test');
  // The page streams, so the not-found screen arrives after the status line.
  await page.goto('/admin/cases/case_seed_maya_payment');
  await expect(page.getByText(/could not be found/i)).toBeVisible();
  await expect(page.getByText('I see a pending charge on my card')).toHaveCount(0);
});
