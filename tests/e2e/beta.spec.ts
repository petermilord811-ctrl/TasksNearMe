import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { latestCode } from './support/outbox';
import { devSignIn, submitEmailStep } from './support/sign-in';

/**
 * Private beta (blueprint 11 B-068). Staff make an invite on /admin/beta; a newcomer signs up through its link;
 * someone without a working code is held at the invite step (and out of the app) with the waitlist on offer;
 * helper setup asks for a helper invite. The markets' switches stay off for the other suites: the newcomers'
 * browsers carry `tnm_beta_gate=on`, which turns both on for that browser only (never in production).
 */

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

/** A newcomer's browser, on the same device as the project, that sees the beta switches on. */
async function newcomerBrowser(browser: Browser, testInfo: TestInfo): Promise<{ context: BrowserContext; page: Page }> {
  const baseURL = testInfo.project.use.baseURL!;
  const context = await browser.newContext({ ...testInfo.project.use, baseURL });
  await context.addCookies([{ name: 'tnm_beta_gate', value: 'on', url: baseURL }]);
  return { context, page: await context.newPage() };
}

/** The email step and its code, as a new person. */
async function verifyNewEmail(page: Page, context: BrowserContext, email: string) {
  await submitEmailStep(page, email);
  await page.getByLabel('6-digit code').fill(await latestCode(context, email));
  // The sixth digit sends the code.
}

const inviteStep = (page: Page) => page.getByRole('heading', { level: 1, name: 'Enter your invite code' });

test('staff make an invite, a newcomer joins with its link, and others are held at the invite step', async ({ page, browser }, testInfo) => {
  test.setTimeout(300_000);
  const tag = `${testInfo.project.name === 'app-mobile' ? 'M' : 'D'}${Date.now().toString(36).toUpperCase()}`;
  const code = `E2E${tag}`;
  const label = `e2e invite ${tag}`;

  // Staff: a one-use invite for clients.
  await staffSignIn(page, 'morgan@example.test');
  await page.goto('/admin/beta');
  await expect(page.getByRole('heading', { level: 1, name: 'Private beta' })).toBeVisible();
  // One section per open market (Gainesville, and the test world's Austin). New accounts start in Gainesville, the
  // first city, so the invites here are Gainesville's.
  const gainesville = page.getByRole('region', { name: 'Gainesville' });
  await gainesville.getByLabel('Name', { exact: true }).fill(label);
  await gainesville.getByLabel('How many people').fill('1');
  await gainesville.getByLabel('Your own code (optional)').fill(code);
  await gainesville.getByRole('button', { name: 'Create invite' }).click();
  await expect(page.getByText('Invite created.')).toBeVisible();
  const card = gainesville.getByRole('listitem').filter({ hasText: label });
  await expect(card).toContainText(code);
  await expect(card).toContainText('0 of 1');

  // A newcomer opens the link: sign-up asks for the invite after the email code, with the code filled in.
  const first = await newcomerBrowser(browser, testInfo);
  const firstEmail = `e2e-beta-${tag.toLowerCase()}-a@example.test`;
  await first.page.goto(`/invite/${code}`);
  await expect(first.page).toHaveURL(/\/sign-in/);
  await verifyNewEmail(first.page, first.context, firstEmail);
  await expect(inviteStep(first.page)).toBeVisible({ timeout: 30_000 });
  await expect(first.page.getByLabel('Invite code')).toHaveValue(code);
  await first.page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(first.page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toBeVisible({ timeout: 30_000 });
  await first.page.getByLabel('First name').fill('Bea');
  await first.page.getByLabel('Last name').fill('Tester');
  await first.page.getByLabel(/18 or older/).check();
  await first.page.getByLabel(/I agree to the Terms of service/).check();
  await first.page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(first.page).toHaveURL(/\/app$/, { timeout: 30_000 });

  // Helper setup needs a helper invite: a client invite doesn't open it.
  await first.page.goto('/app/helper/onboarding/profile');
  await expect(first.page.getByRole('heading', { name: 'Enter your helper invite' })).toBeVisible({ timeout: 30_000 });
  await first.page.getByLabel('Invite code').fill(code);
  await first.page.getByRole('button', { name: 'Start helper setup' }).click();
  await expect(first.page.getByText('This invite is for a client account.')).toBeVisible();
  await first.context.close();

  // Staff see who joined; the used-up invite moves to the past ones.
  await page.reload();
  await gainesville.getByText(/^Used up, expired and withdrawn/).click();
  const usedUp = page.getByRole('listitem').filter({ hasText: label });
  await usedUp.getByText('1 person joined').click();
  await expect(usedUp.getByRole('link', { name: 'Bea T.' })).toBeVisible();
  await expect(usedUp).toContainText('Used up');

  // Someone else: the used-up code doesn't work, the app sends them back to the invite step, and the
  // waitlist is on offer.
  const second = await newcomerBrowser(browser, testInfo);
  const secondEmail = `e2e-beta-${tag.toLowerCase()}-b@example.test`;
  await second.page.goto('/sign-in');
  await verifyNewEmail(second.page, second.context, secondEmail);
  await expect(inviteStep(second.page)).toBeVisible({ timeout: 30_000 });
  await second.page.getByLabel('Invite code').fill(code.toLowerCase());
  await second.page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(second.page.getByText("This invite can't be used anymore.")).toBeVisible();
  await second.page.goto('/app');
  await expect(inviteStep(second.page)).toBeVisible({ timeout: 30_000 });
  await second.page.getByRole('link', { name: 'Join the waitlist' }).click();
  await expect(second.page.getByRole('heading', { level: 1, name: 'TasksNearMe is invite-only for now' })).toBeVisible({ timeout: 30_000 });
  await second.context.close();

  // Staff withdraw a live invite: it leaves the active ones.
  const spare = `${label} spare`;
  await page.reload();
  await gainesville.getByLabel('Name', { exact: true }).fill(spare);
  await gainesville.getByRole('button', { name: 'Create invite' }).click();
  await expect(page.getByText('Invite created.')).toBeVisible();
  const spareCard = gainesville.getByRole('listitem').filter({ hasText: spare });
  await spareCard.getByRole('button', { name: /^Withdraw invite/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Withdraw invite' }).click();
  await expect(spareCard).toHaveCount(0);
  await gainesville.getByText(/^Used up, expired and withdrawn/).click();
  await expect(gainesville.getByRole('listitem').filter({ hasText: spare })).toContainText('Withdrawn');
});
