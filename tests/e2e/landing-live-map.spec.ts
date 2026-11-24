import { expect, test, type Page } from '@playwright/test';

/**
 * The landing's live map (MapLibre): drawing an area to watch, switching cities, drive times, bringing a task to the
 * middle of the free map, and the neighborhoods' cards.
 * It needs WebGL (software, through SwiftShader, here) and OpenFreeMap's style and tiles from the internet, so it runs
 * locally and not on CI, where a slow tile server would fail a ship. The filters, the stream and the home
 * neighborhood, which don't need the live map, are in public-pages.spec.ts.
 */
test.skip(Boolean(process.env.CI), 'needs WebGL and the map tiles from OpenFreeMap');
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
test.setTimeout(180_000);

/** Scrolls to the landed map and waits for the live map and its controls (software WebGL is slow to start). */
async function openLiveMap(page: Page) {
  await page.goto('/');
  const landed = page.locator('[data-map-landed]');
  await landed.evaluate((anchor) => anchor.scrollIntoView({ block: 'start' }));
  const map = page.locator('#tasks-near-you');
  await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 90_000 });
  // The hero's town can still change the page's height as it draws (slowly, on software WebGL): scroll to where the map
  // has landed again until the explorer takes clicks.
  await expect
    .poll(
      async () => {
        await landed.evaluate((anchor) => anchor.scrollIntoView({ block: 'start' }));
        return page.locator('[data-map-explorer]').evaluate((panel) => getComputedStyle(panel).pointerEvents);
      },
      { timeout: 60_000, intervals: [1000] },
    )
    .not.toBe('none');
  await expect(map.getByRole('button', { name: 'Watch an area' })).toBeVisible({ timeout: 60_000 });
  return map;
}

test.describe('the live map', () => {
  // A mouse draws, points and presses: desktop only.
  test.skip(({ isMobile }) => isMobile, 'a mouse: desktop only');

  test('watch an area: a loop drawn around part of the map becomes alerts for its neighborhoods', async ({ page }) => {
    const map = await openLiveMap(page);
    await map.getByRole('button', { name: 'Watch an area' }).click();
    await expect(map.getByText('Draw a loop around the area you want to watch.')).toBeVisible();
    // A loop in the open middle of the map (clear of the heading's button and the explorer).
    const box = (await map.locator('[data-task-map]').boundingBox())!;
    const cx = box.x + box.width * 0.45;
    const cy = box.y + 470;
    await page.mouse.move(cx + 110, cy);
    await page.mouse.down();
    for (let step = 1; step <= 32; step += 1) {
      const angle = (step / 32) * Math.PI * 2;
      await page.mouse.move(cx + Math.cos(angle) * 110, cy + Math.sin(angle) * 90);
    }
    await page.mouse.up();
    const alerts = map.getByRole('link', { name: 'Get alerts' });
    await expect(alerts).toBeVisible();
    await expect(alerts).toHaveAttribute('href', /^\/app\/saved-searches\/new\?from=%2Fgainesville%2Ftasks%3Farea%3D[a-z-]+/);
    await expect(map.getByText(/^Watch /)).toBeVisible();
    // Draw again starts over; Escape-free: Cancel leaves it.
    await map.getByRole('button', { name: 'Draw again' }).click();
    await expect(map.getByText('Draw a loop around the area you want to watch.')).toBeVisible();
    await map.getByRole('button', { name: 'Cancel' }).click();
    await expect(map.getByText('Draw a loop around the area you want to watch.')).toHaveCount(0);
  });

  test('the city switcher: a pick flies the map to that city, its tasks follow, and the next visit opens there', async ({ page, context }) => {
    // Gainesville and Austin are both open in the test world (owner, 2026-11-23: "This platform is not for only Gainesville").
    const map = await openLiveMap(page);
    await map.getByRole('button', { name: 'City: Gainesville, FL. Show another city' }).click();
    const cities = page.getByRole('group', { name: 'Cities' });
    await expect(cities.getByRole('button', { name: /Gainesville, FL/ })).toHaveAttribute('aria-pressed', 'true');
    await cities.getByRole('button', { name: /Austin, TX/ }).click();
    await expect(map.getByRole('button', { name: 'City: Austin, TX. Show another city' })).toBeVisible({ timeout: 20_000 });
    await expect(map.getByRole('status').filter({ hasText: /open tasks? around/ })).toContainText('around Austin');
    // Its neighborhoods: the picker lists Austin's.
    await map.getByRole('button', { name: 'Go to a neighborhood' }).click();
    await expect(map.getByRole('button', { name: 'Mueller', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    // Remembered (the city's slug only), so the next visit opens on Austin.
    expect((await context.cookies()).find((cookie) => cookie.name === 'tnm_city')?.value).toBe('austin');
    await page.goto('/');
    await expect(page.locator('#tasks-near-you').getByRole('button', { name: 'City: Austin, TX. Show another city' })).toBeVisible();
  });

  test('a task shown from the list comes to the middle of the free map with its card above it, and the heading folds', async ({ page }) => {
    const map = await openLiveMap(page);
    const row = map.getByRole('list', { name: 'Newest open tasks' }).getByRole('listitem').first();
    await row.getByRole('button', { name: /^Show “.+” on the map$/ }).click();
    // The map is in use: the heading folds to one line.
    await expect(map.locator('[data-map-heading] [data-compact]')).toHaveCount(1);
    await expect(map.getByText('View task')).toBeVisible();
    // Once the camera has come to rest: the picked task sits in the middle of the map the explorer leaves free (its
    // card's room above it), not lower down and to the left as before.
    await page.waitForTimeout(2500);
    const at = await page.evaluate(() => {
      const explorer = document.querySelector('[data-map-explorer]')!.getBoundingClientRect();
      const picked = [...document.querySelectorAll<HTMLElement>('.tnm-marker')].find((marker) => marker.style.zIndex === '4')!.getBoundingClientRect();
      const card = [...document.querySelectorAll('a')].find((link) => link.closest('.group\\/pin'))!.closest('.group\\/pin')!.getBoundingClientRect();
      return { x: picked.left + picked.width / 2, y: picked.top + picked.height / 2, freeLeft: 16, freeRight: explorer.left - 20, height: window.innerHeight, cardBottom: card.bottom, cardTop: card.top };
    });
    const lift = Math.min(145, (at.height - 32) / 2 - 48);
    expect(Math.abs(at.x - (at.freeLeft + at.freeRight) / 2)).toBeLessThan(14);
    expect(Math.abs(at.y - (at.height / 2 + lift))).toBeLessThan(14);
    // The card opens above the task, whole, under the window's top.
    expect(at.cardBottom).toBeLessThanOrEqual(at.y);
    expect(at.cardTop).toBeGreaterThan(0);
  });

  test('drive times from a shared location, as an estimate', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 29.6566, longitude: -82.3193 }); // Duckpond
    const map = await openLiveMap(page);
    await map.getByRole('button', { name: 'Map layers' }).click();
    await map.getByRole('switch', { name: 'Drive times' }).click();
    await expect(map.getByText('Driving from you, estimated:')).toBeVisible({ timeout: 30_000 });
    await expect(map.getByText('10 min')).toBeVisible();
  });

  test('far away: how far the city is and the nearest open one, and the marker pointing to the visitor stays clear of the panels', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 32.7767, longitude: -96.797 }); // Dallas
    const map = await openLiveMap(page);
    await expect(map.getByText(/^You're [\d,]+ mi from Gainesville: we're opening city by city\.$/)).toBeVisible();
    await expect(map.getByText(/^The nearest open city is Austin, [\d,]+ mi away\.$/)).toBeVisible();
    // The marker on the map's edge: solid, with the distance and the drive, and over none of the page's panels.
    const pill = map.getByRole('button', { name: /^You're [\d,]+ mi from the middle of the map/ });
    await expect(pill).toBeVisible();
    await expect(pill).toContainText(/h drive/);
    const box = (await pill.boundingBox())!;
    for (const panel of await page.locator('[data-map-panel]').all()) {
      const rect = await panel.boundingBox();
      if (!rect || !(await panel.isVisible())) continue;
      const overlaps = box.x < rect.x + rect.width && box.x + box.width > rect.x && box.y < rect.y + rect.height && box.y + box.height > rect.y;
      expect(overlaps, `the marker over ${await panel.evaluate((element) => element.className.slice(0, 60))}`).toBe(false);
    }
    // Showing the nearest city instead: the map goes there.
    await map.getByRole('button', { name: 'Show Austin' }).click();
    await expect(map.getByRole('button', { name: 'City: Austin, TX. Show another city' })).toBeVisible({ timeout: 20_000 });
  });

  test("a task's card takes the pointer: crossing to it keeps it open, and its link opens the task in a new tab", async ({ page }) => {
    const map = await openLiveMap(page);
    // The page's panels over the map (the card, the explorer, the tool bars): a task under one can't be pointed at.
    const panels = await page.evaluate(() => [...document.querySelectorAll('[data-map-panel]')].map((panel) => panel.getBoundingClientRect().toJSON() as DOMRect));
    const clear = (box: { x: number; y: number; width: number; height: number }) =>
      box.y > 40 &&
      box.y + box.height < 760 &&
      panels.every((panel) => box.x + box.width + 30 < panel.left || box.x - 30 > panel.right || box.y + box.height + 30 < panel.top || box.y - 30 > panel.bottom);
    let hovered = false;
    for (const marker of await map.locator('.tnm-marker > div').all()) {
      const box = await marker.boundingBox();
      if (!box || !clear(box)) continue;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
      if (await map.getByText('View task').isVisible()) {
        hovered = true;
        break;
      }
      await page.waitForTimeout(700);
      if (await map.getByText('View task').isVisible()) {
        hovered = true;
        break;
      }
    }
    expect(hovered).toBe(true);
    const card = map.getByText('View task');
    const target = (await card.boundingBox())!;
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.waitForTimeout(600);
    await expect(card).toBeVisible();
    await expect(card.locator('xpath=ancestor::div[contains(@class,"group/pin")]//a')).toHaveAttribute('target', '_blank');
  });

  test('full screen: the row of tasks turns with a mouse wheel, and the map keeps its attribution', async ({ page }) => {
    const map = await openLiveMap(page);
    await map.getByRole('button', { name: 'Open the map full screen' }).click();
    const rail = page.getByRole('list', { name: 'Tasks on the map' });
    await expect(rail).toBeVisible();
    await expect(page.getByText(/OpenStreetMap/).first()).toBeVisible();
    const box = (await rail.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const before = await rail.evaluate((element) => element.scrollLeft);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
  });

  test("a neighborhood's card under the pointer, and a click narrows the list to it", async ({ page }) => {
    const map = await openLiveMap(page);
    const box = (await map.locator('[data-task-map]').boundingBox())!;
    // Over the map itself (not a pin): rest there a moment.
    let found = false;
    for (const [fx, y] of [[0.45, 470], [0.4, 520], [0.5, 430], [0.35, 560]] as const) {
      await page.mouse.move(box.x + box.width * fx, box.y + y);
      await page.waitForTimeout(900);
      if (await map.getByText('Click to see its tasks').isVisible()) {
        found = true;
        await page.mouse.click(box.x + box.width * fx, box.y + y);
        break;
      }
    }
    expect(found).toBe(true);
    await expect(map.getByRole('status').filter({ hasText: /open tasks? around/ })).not.toContainText('around Gainesville');
    await expect(map.getByRole('button', { name: /^Show all of the city, not just / })).toBeVisible();
  });
});
