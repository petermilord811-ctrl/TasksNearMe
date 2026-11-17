import { expect, test } from '@playwright/test';

const SEASONS = ['fall', 'winter', 'spring', 'summer'];
/** Winter's examples in the hero's assistant (messages/en/ui/landing.json, hero.seasons.winter). */
const WINTER_EXAMPLES = /hang holiday lights|move boxes into storage|prune the trees before spring|clean up after a party|set up a new phone/;

/**
 * The landing dresses for the season (UI-062): the market's own on its calendar, or the one a link names
 * (`?season=`, to preview another). Read-only: it needs no reseed.
 */
test.describe('landing: the season', () => {
  test('dresses for its season, shows another one a link names, and ignores names it does not know', async ({ page }) => {
    await page.goto('/');
    const own = await page.locator('[data-season]').first().getAttribute('data-season');
    expect(SEASONS).toContain(own);

    await page.goto('/?season=winter');
    await expect(page.locator('[data-season="winter"]').first()).toBeAttached();
    // The weather over the hero is winter's, and so is the town's still picture (no GPU here, so the still shows).
    await expect(page.locator('canvas[data-weather="winter"]')).toBeAttached();
    await expect(page.locator('img[src$="-winter.webp"]').first()).toBeAttached();
    // The closing card wears winter's shapes; the assistant suggests winter's tasks.
    await expect(page.locator('[data-ornament="winter"]')).toBeAttached();
    await expect(page.locator('input[placeholder], textarea[placeholder]').first()).toBeAttached();
    const placeholders = await page.locator('input[placeholder], textarea[placeholder]').evaluateAll((fields) => fields.map((field) => field.getAttribute('placeholder') ?? ''));
    expect(placeholders.some((text) => WINTER_EXAMPLES.test(text))).toBe(true);
    // A preview is the same page: its address for search engines stays the home page's.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https?:\/\/[^/?#]+\/?$/);

    await page.goto('/?season=monsoon');
    await expect(page.locator(`[data-season="${own}"]`).first()).toBeAttached();
  });
});
