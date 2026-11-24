import { expect, test } from '@playwright/test';
import { openAccountGroup } from './support/account';
import { devSignIn } from './support/sign-in';

/**
 * The Bubble cursor (2026-11-24): on a computer with a mouse, TasksNearMe draws its own pointer once the mouse moves,
 * turns gold over things you can press, steps aside over text fields, and gives the system pointer back when someone
 * chooses it on the account page. Phones never get it.
 */

test('a mouse gets the Bubble cursor, and “Use the system pointer” gives the usual one back', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'a mouse is a desktop thing; phones never get it');
  test.setTimeout(120_000);
  await devSignIn(page, 'ben@example.test');
  await page.goto('/app/account');
  await openAccountGroup(page, 'notifications');
  const html = page.locator('html');
  const cursor = page.getByTestId('bubble-cursor');

  // Nothing until the mouse moves: the system pointer stays until the bubble can be placed.
  await expect(html).not.toHaveAttribute('data-pointer', 'bubble');
  await page.mouse.move(400, 300);
  await page.mouse.move(420, 320, { steps: 4 });
  await expect(html).toHaveAttribute('data-pointer', 'bubble');
  await expect(cursor).toBeVisible();

  // Gold over something to press.
  const toggle = page.getByRole('switch', { name: 'Use the system pointer' });
  const box = await page.getByText('Use the system pointer', { exact: true }).boundingBox();
  if (!box) throw new Error('The pointer setting is missing');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
  await expect(cursor).toHaveAttribute('data-hover', 'press');

  // The system pointer, on this device: the bubble goes at once and stays gone after a reload.
  await page.getByText('Use the system pointer', { exact: true }).click();
  await expect(toggle).toBeChecked();
  await expect(html).not.toHaveAttribute('data-pointer', 'bubble');
  await expect(cursor).toBeHidden();
  await page.reload();
  await openAccountGroup(page, 'notifications');
  await page.mouse.move(300, 300);
  await page.mouse.move(320, 320, { steps: 4 });
  await expect(page.getByRole('switch', { name: 'Use the system pointer' })).toBeChecked();
  await expect(html).not.toHaveAttribute('data-pointer', 'bubble');

  // And back.
  await page.getByText('Use the system pointer', { exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Use the system pointer' })).not.toBeChecked();
  await page.mouse.move(340, 340, { steps: 4 });
  await expect(html).toHaveAttribute('data-pointer', 'bubble');
});

test('phones never get the Bubble cursor or lose their pointer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'phones only');
  await page.goto('/pricing');
  await page.mouse.move(100, 200);
  await page.mouse.move(120, 220, { steps: 3 });
  await expect(page.locator('html')).not.toHaveAttribute('data-pointer', 'bubble');
  await expect(page.getByTestId('bubble-cursor')).toBeHidden();
});
