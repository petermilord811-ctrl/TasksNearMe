import { expect, test, type Locator } from '@playwright/test';
import { openAccountGroup } from './support/account';
import { devSignIn } from './support/sign-in';

/**
 * The Bubble cursor (2026-11-24, round two): on a computer with a mouse, TasksNearMe's cursors are images set by CSS,
 * there from the first paint (before any script or movement); a press squeezes the bubble on the element under the
 * mouse; "Use the system pointer" turns them all off, also after a reload. Phones never get them.
 */

const cursorOf = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).cursor);
const htmlCursor = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.documentElement).cursor);

test('a mouse gets the Bubble cursors from the first paint, a press squeezes, and “Use the system pointer” turns them off', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'a mouse is a desktop thing; phones never get it');
  test.setTimeout(120_000);
  await devSignIn(page, 'ben@example.test');
  await page.goto('/app/account');
  await openAccountGroup(page, 'notifications');

  // Before the mouse has moved at all: the page's resting bubble, the press bubble on a control, text on a field.
  expect(await htmlCursor(page)).toContain('bcur-rest');
  const setting = page.getByText('Use the system pointer', { exact: true });
  expect(await cursorOf(setting)).toContain('bcur-press');
  const field = page.locator('input:is([type="text"], [type="email"], [type="search"], [type="tel"], :not([type])), textarea').first();
  expect(await field.count()).toBe(1);
  expect(await cursorOf(field)).toContain('bcur-text');

  // A press squeezes the bubble on what's under the mouse; releasing it (a click on the switch) turns them all off.
  // (The setting sits below the first screen: the mouse only reaches what's in view.)
  await setting.scrollIntoViewIfNeeded();
  const box = await setting.boundingBox();
  if (!box) throw new Error('The pointer setting is missing');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.down();
  await expect.poll(() => setting.evaluate((el) => (el as HTMLElement).style.getPropertyValue('cursor'))).toContain('bcur-press');
  await page.mouse.up();
  const toggle = page.getByRole('switch', { name: 'Use the system pointer' });
  await expect(toggle).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-pointer', 'system');
  expect(await htmlCursor(page)).not.toContain('bcur');
  expect(await cursorOf(setting)).not.toContain('bcur');

  // Kept on this device: the head script sets it again before the first paint.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-pointer', 'system');
  expect(await htmlCursor(page)).not.toContain('bcur');

  // And back.
  await openAccountGroup(page, 'notifications');
  await page.getByText('Use the system pointer', { exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Use the system pointer' })).not.toBeChecked();
  await expect(page.locator('html')).not.toHaveAttribute('data-pointer', 'system');
  expect(await htmlCursor(page)).toContain('bcur-rest');
});

test('phones never get the Bubble cursors', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'phones only');
  await page.goto('/pricing');
  expect(await htmlCursor(page)).not.toContain('bcur');
  expect(await cursorOf(page.getByRole('link').first())).not.toContain('bcur');
});
