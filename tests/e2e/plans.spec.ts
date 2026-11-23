import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { submitEmailStep } from './support/sign-in';
import { openAccountGroup } from './support/account';

/**
 * The optional plans (completion plan 9.13; a ladder since 2026-11-23) with the billing stand-in: a new account sees
 * Starter, Plus and Pro with their numbers, subscribes to Plus, cancels it (it stays to the period's end), keeps it
 * again, upgrades to Pro (Plus stops renewing), and finds the plans from the account page. A fresh account per run, so
 * no shared test person ever holds a plan (Pro would waive their hold fees and change other specs' money).
 */

async function latestCode(context: BrowserContext, to: string): Promise<string> {
  const outbox = await context.newPage();
  try {
    await outbox.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
    const body = await outbox.locator(`[data-testid="outbox-message"][data-to="${to}"]:not([data-tag="welcome"]) pre`).first().textContent();
    const code = body?.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`no code sent to ${to}`);
    return code;
  } finally {
    await outbox.close();
  }
}

async function freshMember(page: Page, context: BrowserContext, project: string): Promise<void> {
  const email = `e2e-plans-${project}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto('/sign-in');
  await submitEmailStep(page, email);
  await page.getByLabel('6-digit code').fill(await latestCode(context, email));
  await expect(page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('First name').fill('Paz');
  await page.getByLabel('Last name').fill('Quinn');
  await page.getByLabel(/18 or older/).check();
  await page.getByLabel(/I agree to the Terms of service/).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

test('a new account subscribes to Plus, cancels it to the period’s end, keeps it, upgrades to Pro, and finds the plans from the account', async ({ page, context }, testInfo) => {
  test.setTimeout(180_000);
  await freshMember(page, context, testInfo.project.name);

  await page.goto('/app/plan');
  await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible({ timeout: 30_000 });
  const starter = page.getByRole('region', { name: 'Starter' });
  const plus = page.getByRole('region', { name: 'Plus' });
  const pro = page.getByRole('region', { name: 'Pro' });
  // A ladder since 2026-11-23: Starter 3 AI searches a day, Plus 5, Pro unlimited; only Pro waives the hold fee.
  await expect(starter.getByText('Your plan')).toBeVisible();
  await expect(starter.getByText('Start 3 new direct conversations a day, up to 60 as you earn Sparks')).toBeVisible();
  await expect(plus.getByText('$4.99 a month')).toBeVisible();
  await expect(plus.getByText('Start 25 new direct conversations a day')).toBeVisible();
  await expect(plus.getByText(/^No hold fee/)).toHaveCount(0);
  await expect(pro.getByText('$7.99 a month')).toBeVisible();
  await expect(pro.getByText(/^No hold fee/)).toBeVisible();
  await expect(pro.getByText('Your offers shown first to clients')).toBeVisible();
  await expect(pro.getByText(/^Offer insights on every task/)).toBeVisible();
  await expect(page.getByText('3 AI searches left today.')).toBeVisible();
  await expect(page.getByText(/A plan never changes reviews, checks or the verified badge/)).toBeVisible();

  // Subscribe (the stand-in starts it at once and comes back with the thank-you).
  await expect(async () => {
    await plus.getByRole('button', { name: 'Subscribe monthly: Plus, $4.99 a month' }).click({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/app\/plan\?checkout=done&plan=plus$/, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Thanks for subscribing' })).toBeVisible();
  await expect(plus.getByText('Your plan')).toBeVisible({ timeout: 15_000 });
  await expect(plus.getByText(/^Renews .+ at \$4\.99\.$/)).toBeVisible();
  await expect(page.getByText('5 AI searches left today.')).toBeVisible();
  // Plus can't be bought twice; Pro is the upgrade.
  await expect(plus.getByRole('button', { name: /Subscribe/ })).toHaveCount(0);
  await expect(pro.getByRole('button', { name: 'Upgrade monthly: Pro, $7.99 a month' })).toBeVisible();
  await expect(pro.getByText(/^When Pro starts, your Plus stops renewing/)).toBeVisible();

  // Cancel: it stays until the period ends and won't renew. Then keep it.
  await plus.getByRole('button', { name: 'Manage or cancel' }).click();
  await expect(plus.getByText(/^Ends .+ and won't renew\.$/)).toBeVisible({ timeout: 30_000 });
  await plus.getByRole('button', { name: 'Manage or cancel' }).click();
  await expect(plus.getByText(/^Renews .+ at \$4\.99\.$/)).toBeVisible({ timeout: 30_000 });

  // Upgrade to Pro: Pro starts at once, AI search is unlimited, and Plus ends with its month instead of renewing.
  await expect(async () => {
    await pro.getByRole('button', { name: 'Upgrade monthly: Pro, $7.99 a month' }).click({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/app\/plan\?checkout=done&plan=pro$/, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  await expect(pro.getByText('Your plan')).toBeVisible({ timeout: 15_000 });
  await expect(pro.getByText(/^Renews .+ at \$7\.99\.$/)).toBeVisible();
  await expect(plus.getByText(/^Ends .+ and won't renew\.$/)).toBeVisible();
  await expect(page.getByText('Unlimited AI searches with your Pro.')).toBeVisible();

  // The account page leads here (on phones its Plan group starts folded, plan 9.14b).
  await page.goto('/app/account');
  await openAccountGroup(page, 'helping');
  await page.getByRole('link', { name: 'See plans' }).click();
  await expect(page).toHaveURL(/\/app\/plan$/, { timeout: 30_000 });
});
