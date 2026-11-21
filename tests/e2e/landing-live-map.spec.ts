import { expect, test, type Page } from '@playwright/test';

/**
 * The landing's live map (MapLibre): drawing an area to watch, the minimap, drive times and the neighborhoods' cards.
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

  test('the minimap frames what the map shows, and a press there moves the map', async ({ page }) => {
    const map = await openLiveMap(page);
    const minimap = map.locator('[data-minimap-city]');
    await expect(minimap).toBeVisible();
    const frame = minimap.locator('polygon').last();
    await expect.poll(() => frame.getAttribute('points')).toMatch(/\d/);
    // Once the map has come to rest: the frame stops changing.
    let before = await frame.getAttribute('points');
    await expect
      .poll(
        async () => {
          const now = await frame.getAttribute('points');
          const still = now === before;
          before = now;
          return still;
        },
        { timeout: 30_000, intervals: [1500] },
      )
      .toBe(true);
    const area = (await minimap.boundingBox())!;
    await minimap.click({ position: { x: area.width * 0.15, y: area.height * 0.8 } });
    await expect.poll(() => frame.getAttribute('points'), { timeout: 15_000 }).not.toBe(before);
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

  test('far away: the minimap opens on the country, and the marker pointing to the visitor stays clear of the panels', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 32.7767, longitude: -96.797 }); // Dallas
    const map = await openLiveMap(page);
    const minimap = map.locator('[data-minimap]');
    await expect(minimap.getByRole('button', { name: 'US', pressed: true })).toBeVisible();
    // The nearest open city (or opening one, while none is open), and about how long the drive is.
    await expect(minimap.getByText(/^You're [\d,]+ mi from [A-Z][a-z]+ · ≈\d+ (h|min) drive$/)).toBeVisible();
    // Open cities link to their page, opening ones to the waitlist.
    await expect(minimap.getByRole('link', { name: 'Gainesville' })).toHaveAttribute('href', /^\/(gainesville|waitlist)$/);
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
    // Back to the city's view.
    await minimap.getByRole('button', { name: 'City' }).click();
    await expect(map.locator('[data-minimap-city]')).toBeVisible();
  });

  test("a task's card takes the pointer: crossing to it keeps it open, and its link opens the task in a new tab", async ({ page }) => {
    const map = await openLiveMap(page);
    const free = await page.evaluate(() => {
      const heading = document.querySelector('[data-map-heading]')!.getBoundingClientRect();
      const explorer = document.querySelector('[data-map-explorer]')!.getBoundingClientRect();
      return { left: heading.right + 20, right: explorer.left - 20, top: 140, bottom: window.innerHeight - 160 };
    });
    let hovered = false;
    for (const marker of await map.locator('.tnm-marker > div').all()) {
      const box = await marker.boundingBox();
      if (!box || box.x < free.left || box.x + box.width > free.right || box.y < free.top || box.y > free.bottom) continue;
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
