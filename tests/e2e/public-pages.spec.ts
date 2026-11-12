import { expect, test } from '@playwright/test';

/** Public marketing pages, wired to the seeded Austin market, people, and launch policy. */
test.describe('public pages', () => {
  test('home: the landing page from the database', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/everyday help from people near you in Austin/);
    await expect(page.getByRole('heading', { level: 1, name: 'Everyday tasks, done by people nearby.' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Furniture assembly/ }).first()).toBeVisible();
    // The fee example comes from the fee engine and the published policy (the spoken values are final at once).
    await expect(page.getByText('A $60.00 task')).toBeAttached();
    await expect(page.getByText('$66.00', { exact: true }).first()).toBeAttached();
    await expect(page.getByText('$54.00', { exact: true }).first()).toBeAttached();
    // The founding helper reward, while the program is on.
    await expect(page.getByText('$50.00 gift card')).toBeAttached();
    // Featured helpers are active helpers only (Priya's profile is still a draft); they float around the
    // hero on wide screens.
    if (testInfo.project.name === 'app-desktop') await expect(page.getByText('Sam K.').first()).toBeVisible();
    await expect(page.getByText('Priya')).toHaveCount(0);
    await expect(page.getByText('Travis Heights').first()).toBeVisible();
  });

  test('home map: the nearest open tasks to a shared location, one category at a time', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 30.2989, longitude: -97.7064 }); // Mueller
    await page.goto('/');
    const map = page.locator('#tasks-near-you');
    await expect(map.getByRole('list', { name: 'Newest open tasks' })).toBeVisible();

    await map.getByRole('button', { name: 'Use my location' }).click();
    const nearest = map.getByRole('list', { name: 'Open tasks nearest you' });
    await expect(nearest).toBeVisible();
    await expect(nearest.getByRole('link').first()).toHaveAttribute('href', /^\/tasks\//);
    await expect(nearest.getByText(/\d mi$/).first()).toBeVisible();

    const yard = map.getByRole('button', { name: 'Yard cleanup', exact: true });
    await yard.click();
    await expect(yard).toHaveAttribute('aria-pressed', 'true');
    const rows = nearest.getByRole('link');
    await expect(rows.first()).toContainText('Yard cleanup');
    for (const row of await rows.all()) await expect(row).toContainText('Yard cleanup');
    // Areas only: never an address.
    await expect(page.getByText(/\d+ (Example|Sample) (Lane|Street|Road)/)).toHaveCount(0);
  });

  test('home map: outside the service area, the waitlist', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 32.7767, longitude: -96.797 }); // Dallas
    await page.goto('/');
    const map = page.locator('#tasks-near-you');
    await map.getByRole('button', { name: 'Use my location' }).click();
    await expect(map.getByText("We're not in your area yet.")).toBeVisible();
    await expect(map.getByRole('link', { name: 'Join the waitlist' })).toHaveAttribute('href', '/waitlist');
  });

  test('market and category pages', async ({ page }) => {
    await page.goto('/austin');
    await expect(page.getByRole('heading', { level: 1, name: 'Everyday help in Austin' })).toBeVisible();

    await page.goto('/austin/furniture-assembly');
    await expect(page).toHaveTitle('Furniture assembly in Austin · TasksNearMe');
    await expect(page.getByRole('heading', { level: 1, name: 'Furniture assembly in Austin' })).toBeVisible();
  });

  test('pricing: every number comes from the fee engine and the published policy', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const amount of ['$66.00', '$54.00', '$28.00', '$154.00', '$134.75', '$19.25', '$86.00', '$74.00']) {
      await expect(page.getByText(amount, { exact: true }).first()).toBeVisible();
    }
  });

  test('become a helper: reward cards follow the flags and the founding cohort', async ({ page }) => {
    await page.goto('/become-a-helper');
    await expect(page.getByRole('heading', { level: 1, name: 'Put your everyday skills to work nearby' })).toBeVisible();
    // One founding number is taken in the seed (Jordan, #63).
    await expect(page.getByText('99 spots left')).toBeVisible();
    await expect(page.getByText('$54.00').first()).toBeVisible();
  });

  test('how it works and trust and safety', async ({ page }) => {
    await page.goto('/how-it-works');
    await expect(page.getByRole('heading', { level: 1, name: 'A clear plan, from start to finish' })).toBeVisible();
    await page.goto('/trust-and-safety');
    await expect(page.getByRole('heading', { level: 1, name: 'Trust starts with clear information' })).toBeVisible();
  });

  test('unknown markets and categories are not found', async ({ page }) => {
    await page.goto('/nowhere');
    await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible();
    await page.goto('/austin/underwater-welding');
    await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible();
  });
});
