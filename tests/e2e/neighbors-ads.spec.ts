import { expect, test, type Page } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Sponsored ads in Neighbors' rail, and the signed-in app 10% wider (2026-11-22, owner: "make a little full-wide (10%
 * more), and show some ads on the right"). Wide screens: two sponsored cards, each one link to its advertiser in a new
 * tab with the placement's tags; the first starts once half of it is on screen and moves on to its next frame; "About
 * this ad" says what it is; the second is pinned so it stays in view while the stream scrolls. Phones have no rail,
 * so no ads. Reduced motion: each ad rests on its last frame. Read-only.
 */

const ads = (page: Page) => ({
  humanizeWord: page.getByRole('region', { name: 'Sponsored HumanizeWord' }),
  capCue: page.getByRole('region', { name: 'Sponsored CapCue' }),
});

async function openNeighbors(page: Page) {
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/community');
  await expect(page.getByRole('region', { name: 'Start a post' })).toBeVisible({ timeout: 30_000 });
}

test('wide screens show two sponsored cards in the rail that link out and play; phones show none', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openNeighbors(page);
  const { humanizeWord, capCue } = ads(page);
  if (testInfo.project.name === 'app-mobile') {
    await expect(humanizeWord).toBeHidden();
    await expect(capCue).toBeHidden();
    return;
  }

  const humanizeLink = humanizeWord.getByRole('link', { name: /HumanizeWord/ });
  await expect(humanizeLink).toHaveAttribute('href', 'https://humanizeword.com/?utm_source=tasksnearme&utm_medium=display&utm_campaign=neighbors_rail');
  await expect(humanizeLink).toHaveAttribute('target', '_blank');
  await expect(humanizeLink).toHaveAttribute('rel', 'sponsored noopener');
  const capCueLink = capCue.getByRole('link', { name: /CapCue/ });
  await expect(capCueLink).toHaveAttribute('href', 'https://capcue.ai/?utm_source=tasksnearme&utm_medium=display&utm_campaign=neighbors_rail');
  await expect(capCueLink).toHaveAttribute('target', '_blank');

  // In view, the first ad starts (its stage goes live) and, after its first frame, shows the product.
  await expect(humanizeWord.locator('[data-live]')).toHaveCount(1, { timeout: 15_000 });
  await expect(humanizeWord.getByText('Example rewrite')).toBeVisible({ timeout: 15_000 });

  await humanizeWord.getByRole('button', { name: 'About this ad' }).click();
  const about = page.getByRole('dialog');
  await expect(about.getByText('These ads are the same for everyone.', { exact: false })).toBeVisible();
  await expect(about.getByText('Advertiser: HumanizeWord (humanizeword.com)')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(about).toHaveCount(0);

  // The second card is pinned in a column as tall as the stream, so it stays in view while the stream scrolls.
  const pinned = await capCue.evaluate((card) => {
    const holder = card.parentElement!;
    const column = holder.parentElement!;
    const row = column.parentElement!;
    return { position: getComputedStyle(holder).position, columnHeight: column.getBoundingClientRect().height, rowHeight: row.getBoundingClientRect().height };
  });
  expect(pinned.position).toBe('sticky');
  expect(Math.round(pinned.columnHeight)).toBe(Math.round(pinned.rowHeight));
});

test('with reduced motion each ad rests on its last frame', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === 'app-mobile', 'phones have no rail');
  test.setTimeout(120_000);
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await openNeighbors(page);
    const { humanizeWord, capCue } = ads(page);
    await expect(humanizeWord.getByText('Humanize your text')).toBeVisible({ timeout: 15_000 });
    await expect(capCue.getByText('Get started free')).toBeAttached();
    await expect(page.locator('[data-live]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('the signed-in app is 10% wider: 99rem across, 77rem for the page beside the navigation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'app-mobile', 'phones fill the screen either way');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openNeighbors(page);
  const main = await page.locator('#main').boundingBox();
  expect(main?.width).toBe(77 * 16);
  // The navigation's column and the page's, centered under the bar: 99rem in all.
  const frame = await page.locator('#main').evaluate((element) => element.parentElement!.getBoundingClientRect().width);
  expect(frame).toBe(99 * 16);
});
