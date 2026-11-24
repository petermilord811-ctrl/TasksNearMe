import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * The task map on every task page (owner, 2026-11-23: "packaged as useful component … in every each task page … show
 * current location, drive or walk distance and estimated time, weather, nearby building infos"). The e2e build uses the
 * sample forecast and the sample places (src/integrations/weather, src/integrations/places), never the real services.
 */

const YARD = '/tasks/rake-and-bag-front-yard-leaves-crestview-2m9q';
/** About a mile and a quarter south of the yard task's area (Crestview, Austin). */
const NEARBY = { latitude: 30.33, longitude: -97.72 };

test('a task page shows its area, the trip there from this device, the weather and what is around (2026-11-23)', async ({ page, context }) => {
  await page.goto(YARD);
  await expect(page.getByRole('region', { name: "Map of Crestview: the task's general area" })).toBeVisible();
  await expect(page.getByText(/The circle is the general area/)).toBeVisible();
  // Asked for first: the location is only used after the press, and it stays on the device. (Allowed only once the page
  // has hydrated: allowed before that, the page finds it by itself, as the next test shows.)
  const use = page.getByRole('button', { name: 'Use my location' });
  await expect(use).toBeVisible();
  await expect(page.locator('[data-hydrating]')).toHaveCount(0, { timeout: 30_000 });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(NEARBY);
  await use.click();
  const modes = page.getByRole('radiogroup', { name: "How you'd get there" });
  await expect(modes.getByRole('radio', { name: /Drive/ })).toHaveAttribute('aria-checked', 'true');
  await expect(modes.getByRole('radio', { name: /Bike/ })).toBeVisible();
  await modes.getByRole('radio', { name: /Walk/ }).click();
  await expect(modes.getByRole('radio', { name: /Walk/ })).toHaveAttribute('aria-checked', 'true');

  await expect(page.getByRole('heading', { name: 'Weather for the task' })).toBeVisible();
  await expect(page.getByText('Sample forecast (development)').or(page.getByText(/The forecast reaches a week ahead/))).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Around the area' })).toBeVisible();
  await expect(page.getByText('Sample Garden Center')).toBeVisible();

  // Opened large, then closed with Escape: focus is back on the button.
  const open = page.getByRole('button', { name: 'Open map' });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Crestview' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'What the map shows' }).getByRole('button', { name: '3D buildings' })).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
});

test('allowed before, the trip starts from where the device is without asking again', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(NEARBY);
  await page.goto(YARD);
  await expect(page.getByRole('radiogroup', { name: "How you'd get there" }).getByRole('radio', { name: /Drive/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use my location' })).toHaveCount(0);
});

test('a helper plans the trip from their home neighborhood on Find work (2026-11-23)', async ({ page }) => {
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/find-work/tsk_shelves');
  const from = page.getByRole('group', { name: 'Start from' });
  await expect(from.getByRole('button', { name: /^Home: / })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('radiogroup', { name: "How you'd get there" }).getByRole('radio', { name: /Drive/ })).toBeVisible();
  await expect(page.getByText(/^From the middle of .+ to the middle of the task's area/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Around the area' })).toBeVisible();
});

test("the poster sees their task's area as helpers do, with the weather for it", async ({ page }) => {
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks/tsk_desk');
  await expect(page.getByRole('heading', { name: 'Where helpers see it' })).toBeVisible();
  await expect(page.getByRole('region', { name: "Map of Mueller: the task's general area" })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Weather for the task' })).toBeVisible();
});
