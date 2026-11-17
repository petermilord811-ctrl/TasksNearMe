import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import account from '../../messages/en/ui/account.json';
import adminUser from '../../messages/en/ui/adminUser.json';
import { devSignIn, submitEmailStep } from './support/sign-in';

/**
 * "Not you?" (completion plan 5.23) end to end, on a fresh account: its email changes, the old address's notice
 * in the dev outbox carries the link, and opening it on another device, without signing in, signs every device
 * out and puts the old address back. The owner signs in again with a code to the old address and finds changes
 * paused; trust and safety clear the hold from the person page, with a reason; the used link is dead.
 */

const notMe = account.notMe;
const codeIn = (body: string) => body.match(/\b(\d{6})\b/)?.[1] ?? '';

/** A fresh address per run and project. No standalone 6-digit run, so it's never mistaken for a code. */
function fresh(project: string, label: string): string {
  return `e2e-${label}-${project}-${Date.now()}-r${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** The newest message of one kind to one address, from the dev outbox (waits for it to arrive). */
async function outboxMessage(context: BrowserContext, to: string, tag: string): Promise<string> {
  const outbox = await context.newPage();
  try {
    const message = outbox.locator(`[data-testid="outbox-message"][data-to="${to}"][data-tag="${tag}"]`).first();
    await expect(async () => {
      await outbox.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
      await expect(message).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    return (await message.locator('pre').textContent()) ?? '';
  } finally {
    await outbox.close();
  }
}

async function signInWithCode(page: Page, context: BrowserContext, email: string) {
  await page.goto('/sign-in');
  await submitEmailStep(page, email);
  await page.getByLabel('6-digit code').fill(codeIn(await outboxMessage(context, email, 'sign-in-code')));
}

async function staffSignIn(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
  return { context, page };
}

test('the "Not you?" link signs every device out, puts the old email back and holds changes until trust and safety clear them', async ({ page, context, browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(300_000);
  const email = fresh(testInfo.project.name, 'notme-old');
  const next = fresh(testInfo.project.name, 'notme-new');

  // A new account, then its email changes on the account page.
  await signInWithCode(page, context, email);
  await expect(page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toBeVisible();
  await page.getByLabel('First name').fill('Casey');
  await page.getByLabel('Last name').fill('Morgan');
  await page.getByLabel(/18 or older/).check();
  await page.getByLabel(/I agree to the Terms of service/).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/account');
  await page.getByRole('button', { name: 'Change your email' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change your email' });
  await dialog.getByLabel('New email').fill(next);
  await dialog.getByRole('button', { name: 'Send code' }).click();
  await dialog.getByLabel('6-digit code').fill(codeIn(await outboxMessage(context, next, 'email-change-code')));
  await expect(page.getByText(`Your email is now ${next}.`)).toBeVisible();

  // The old address's notice has the link. It's followed by its path: the sender's address may be another server's.
  const notice = await outboxMessage(context, email, 'email-changed');
  expect(notice).toContain(next);
  const link = new URL(notice.match(/https?:\/\/\S+\/account\/not-me\?token=\S+/)?.[0] ?? '');
  expect(link.pathname).toBe('/account/not-me');

  // Somewhere else, not signed in: the page asks first, then secures the account.
  const elsewhere = await browser.newContext();
  const owner = await elsewhere.newPage();
  await owner.goto(`${link.pathname}${link.search}`);
  await expect(owner.getByRole('heading', { level: 1, name: notMe.ask.title })).toBeVisible({ timeout: 30_000 });
  await expect(owner.getByText(notMe.ask.items.pause, { exact: true })).toBeVisible();
  await expect(async () => {
    if (await owner.getByRole('button', { name: notMe.ask.confirm }).isVisible()) await owner.getByRole('button', { name: notMe.ask.confirm }).click({ timeout: 5_000 });
    await expect(owner.getByRole('heading', { level: 1, name: notMe.done.title })).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  await expect(owner.getByRole('link', { name: notMe.contactSupport })).toHaveAttribute('href', '/help/contact');
  // Used once, it reads like any broken link.
  await owner.reload();
  await expect(owner.getByRole('heading', { level: 1, name: notMe.invalid.title })).toBeVisible({ timeout: 30_000 });
  await expect(owner.getByRole('button', { name: notMe.ask.confirm })).toHaveCount(0);
  await elsewhere.close();

  // The session that made the change is gone.
  await page.goto('/app/account');
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });

  // The old address signs in to the same account, which uses it again, with changes paused.
  await signInWithCode(page, context, email);
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  await page.goto('/app/account');
  await expect(page.getByLabel('First name')).toHaveValue('Casey');
  await expect(page.getByText(account.contact.heldTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole('list').getByText(email, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change your email' })).toHaveCount(0);

  // Trust and safety find the account, its urgent case and the hold, and clear it with a reason.
  const staff = await staffSignIn(browser, 'taylor@example.test');
  await staff.page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  await staff.page.getByRole('link', { name: /Casey M\./ }).first().click();
  await expect(staff.page).toHaveURL(/\/admin\/users\/usr_/, { timeout: 30_000 });
  await expect(staff.page.getByRole('region', { name: 'Cases' }).getByRole('link', { name: '“Not you?” on a contact change' }).first()).toBeVisible({ timeout: 45_000 });
  const section = staff.page.getByRole('region', { name: adminUser.account.title });
  await expect(section.getByText(/Email, phone and sign-in changes held since/)).toBeVisible();
  await section.getByRole('button', { name: adminUser.account.actions.clear_contact_hold.trigger }).click();
  const clear = staff.page.getByRole('alertdialog', { name: adminUser.account.actions.clear_contact_hold.title });
  await clear.getByLabel('Reason').fill('Spoke with the owner at the restored address; the account is theirs.');
  await clear.getByRole('button', { name: adminUser.account.actions.clear_contact_hold.submit }).click();
  await expect(clear).toBeHidden({ timeout: 30_000 });
  await expect(section.getByText(/Email, phone and sign-in changes held since/)).toHaveCount(0, { timeout: 30_000 });
  await staff.context.close();

  // The owner can change things again.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Change your email' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(account.contact.heldTitle, { exact: true })).toHaveCount(0);
});
