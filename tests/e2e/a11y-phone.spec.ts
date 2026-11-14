import { expect, test, type Page } from '@playwright/test';
import { auditPage, noTransitions } from './support/keyboard';
import { devSignIn } from './support/sign-in';

/**
 * WCAG 2.2 AA at phone width (completion plan 5.8): the pages of the core journeys, on the seeded data, checked
 * with axe (serious and critical) and for 24 × 24 px targets (2.5.8). Read-only. The keyboard journeys that make
 * and change data are in a11y-keyboard.spec.ts (desktop).
 */

test.skip(({ isMobile }) => !isMobile, 'phone width only');
test.beforeEach(async ({ context, baseURL }) => {
  await noTransitions(context);
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
});

async function audit(page: Page, path: string, project: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  await auditPage(page, project);
}

test('phone width: public pages and signing in', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  for (const path of ['/', '/austin', '/help', '/sign-in']) await audit(page, path, testInfo.project.name);
});

test('phone width: a client’s pages', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await devSignIn(page, 'ben@example.test');
  for (const path of ['/app', '/app/tasks', '/app/tasks/new', '/app/bookings', '/app/bookings/bkg_tv', '/app/messages', '/app/notifications', '/app/account', '/app/support']) {
    await audit(page, path, testInfo.project.name);
  }
});

test('phone width: a helper’s pages', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await devSignIn(page, 'jordan@example.test');
  for (const path of ['/app/find-work', '/app/find-work/tsk_desk', '/app/offers', '/app/bookings/bkg_tv', '/app/earnings']) await audit(page, path, `${testInfo.project.name}:helper`);
});
