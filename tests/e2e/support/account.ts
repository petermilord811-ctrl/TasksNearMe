import { expect, type Page } from '@playwright/test';

type AccountGroup = 'profile' | 'security' | 'notifications' | 'helping' | 'privacy';

/**
 * Opens one of the account page's groups (plan 9.14b). Below 1024 px they start folded, except the one the visit is
 * for; from 1024 px all are open and this does nothing. A tap before the page hydrates does nothing, so it taps again
 * until the group says it's open.
 */
export async function openAccountGroup(page: Page, group: AccountGroup): Promise<void> {
  const toggle = page.locator(`#account-${group}-title button`);
  await page.locator(`#account-${group}`).waitFor({ timeout: 45_000 });
  if (!(await toggle.isVisible())) return;
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

/** Shows the account's passkeys, listed behind "Your passkeys (n)". */
export async function showPasskeys(page: Page): Promise<void> {
  const summary = page.locator('summary', { hasText: /^Your passkeys/ });
  await expect(async () => {
    const open = await summary.evaluate((element) => (element.parentElement as HTMLDetailsElement).open);
    if (!open) await summary.click();
    expect(await summary.evaluate((element) => (element.parentElement as HTMLDetailsElement).open)).toBe(true);
  }).toPass({ timeout: 30_000 });
}
