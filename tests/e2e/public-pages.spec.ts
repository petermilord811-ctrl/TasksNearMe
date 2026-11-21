import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { users } from '../../src/modules/accounts/schema';
import { areas } from '../../src/modules/markets/schema';
import { addressVerifications } from '../../src/modules/verification/schema';
import { fieldCipherFromEnv } from '../../src/platform/crypto/field-encryption';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn, untilShown } from './support/sign-in';
import { waitlistEntries } from '../../src/modules/marketing/schema';

/**
 * Scrolls to where the landing's map has arrived: on wide screens, past its pinned arrival (the explorer slides in as
 * the camera pulls back, and takes clicks once it's there); on phones, the map section's start.
 */
async function landOnMap(page: Page) {
  const landed = page.locator('[data-map-landed]');
  // Scroll to where the map has landed, and again on each try: the hero above can still change the page's height as
  // it loads (slowly under load, as on CI's phones), which moves the map away from a single scroll (Ship 44897520559).
  await expect
    .poll(
      async () => {
        await landed.evaluate((anchor) => anchor.scrollIntoView({ block: 'start' }));
        return page.locator('#tasks-near-you [data-task-map]').evaluate((frame) => frame.getBoundingClientRect().top < window.innerHeight * 0.9);
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  // The explorer takes clicks once the arrival has come far enough (wide screens), right away on phones.
  await expect.poll(() => page.locator('[data-map-explorer]').evaluate((panel) => getComputedStyle(panel).pointerEvents)).not.toBe('none');
  if (!(await page.evaluate(() => window.matchMedia('(min-width: 1024px)').matches))) return;
  // Wide screens: it takes clicks from 55% of the arrival but slides in until about 73%, and its card blooms in. Wait
  // until it's all the way in and has stopped moving. A click that finds it "not stable" makes Playwright retry with the
  // page scrolled to other alignments, which moves this pinned arrival back, so the explorer stops taking clicks (a
  // desktop flake, 2026-11-21). Each try scrolls back to the landing first: the hero above can still change the page's
  // height as it loads.
  await expect
    .poll(
      async () => {
        await landed.evaluate((anchor) => anchor.scrollIntoView({ block: 'start' }));
        return page.locator('[data-map-explorer]').evaluate(
          (panel) =>
            new Promise<boolean>((resolve) => {
              const parts = [panel.firstElementChild, panel.querySelector('[data-reveal]')].filter((part): part is Element => part !== null);
              const before = parts.map((part) => part.getBoundingClientRect());
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const still = parts.every((part, index) => {
                    const box = part.getBoundingClientRect();
                    const was = before[index]!;
                    return getComputedStyle(part).opacity === '1' && box.top === was.top && box.left === was.left && box.width === was.width;
                  });
                  resolve(parts.length === 2 && getComputedStyle(panel).pointerEvents !== 'none' && still);
                }),
              );
            }),
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

/**
 * A throwaway person (a copy of the seeded client Ana) whose address check names a home in `areaName` (Gainesville):
 * the landing's map starts from that neighborhood. `remove` takes them away again.
 */
async function withHomeArea(areaName: string): Promise<{ email: string; remove: () => Promise<void> }> {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example).');
  const id = `usr_e2e_home_${Date.now().toString(36)}`;
  const email = `${id.replaceAll('_', '-')}@example.test`;
  const { db, pool } = createDb(url, { max: 1 });
  const [ana] = await db.select().from(users).where(eq(users.id, 'usr_ana'));
  const [area] = await db.select({ id: areas.id }).from(areas).where(eq(areas.name, areaName));
  if (!ana || !area) throw new Error('The seeded client Ana or the neighborhood is missing');
  const phone = `+1352555${String(Date.now() % 10_000).padStart(4, '0')}`;
  await db.insert(users).values({ ...ana, id, email, name: 'Hana H.', firstName: 'Hana', lastName: 'Home', phone });
  const now = new Date();
  await db.insert(addressVerifications).values({
    id: `adr_${id}`,
    userId: id,
    status: 'verified',
    addressCiphertext: fieldCipherFromEnv().encrypt(JSON.stringify({ line1: '1 Example Lane', city: 'Gainesville', state: 'FL', zip: '32601' })),
    areaId: area.id,
    documentType: 'utility_bill',
    submittedAt: now,
    decidedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return {
    email,
    remove: async () => {
      try {
        await db.delete(addressVerifications).where(eq(addressVerifications.userId, id));
        await db.delete(users).where(eq(users.id, id));
      } finally {
        await pool.end();
      }
    },
  };
}

/** The e2e database, for the waitlist entry a spec makes (and removes). */
function waitlistDatabase() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  return createDb(process.env.DATABASE_URL ?? '', { max: 1 });
}

/** Public marketing pages, wired to the seeded Austin market, people, and launch policy. */
test.describe('public pages', () => {
  test('home: the landing page from the database', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('TasksNearMe: tasks near me, done by trusted local helpers');
    await expect(page.getByRole('heading', { level: 1, name: 'Everyday tasks, done by people nearby.' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Furniture assembly/ }).first()).toBeVisible();
    // The fee example comes from the fee engine and the published policy (the spoken values are final at once).
    await expect(page.getByText('A $60.00 task')).toBeAttached();
    await expect(page.getByText('$66.00', { exact: true }).first()).toBeAttached();
    await expect(page.getByText('$54.00', { exact: true }).first()).toBeAttached();
    // The welcome gift card, while the program is on.
    await expect(page.getByText('$50.00 gift card')).toBeAttached();
    // The landing is the first city's (Gainesville since 2026-11-17): its featured helpers are its own active helpers,
    // so Austin's cast (Sam K., or Priya, whose profile is a draft) never features here, and its open tasks show
    // Gainesville's neighborhoods.
    await expect(page.getByText('Sam K.')).toHaveCount(0);
    await expect(page.getByText('Priya')).toHaveCount(0);
    await expect(page.getByText('Duckpond').first()).toBeVisible();
  });

  test('home map: the newest open tasks until the visitor shares a location', async ({ page }) => {
    await page.goto('/');
    const map = page.locator('#tasks-near-you');
    await expect(map.getByRole('list', { name: 'Newest open tasks' })).toBeVisible();
    // Reaching the map asks the browser once; refused (as here), nothing changes and nothing complains.
    await landOnMap(page);
    await expect(map.getByRole('button', { name: 'Use my location' })).toBeVisible();
    await expect(map.getByRole('list', { name: 'Newest open tasks' })).toBeVisible();
    await expect(map.getByText(/Location is off/)).toHaveCount(0);
  });

  test('home map: the nearest open tasks to a shared location, one category at a time', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 29.6566, longitude: -82.3193 }); // Duckpond, Gainesville (the first city)
    await page.goto('/');
    const map = page.locator('#tasks-near-you');
    // Allowed before: the page finds the visitor by itself, with no press (the location stays in the browser).
    const nearest = map.getByRole('list', { name: 'Open tasks nearest you' });
    await expect(nearest).toBeVisible();
    await expect(map.getByRole('button', { name: 'Sorted by distance from you' })).toBeVisible();
    await landOnMap(page);
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

  test('home map: outside the service area, the city list and helper sign-up', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 32.7767, longitude: -96.797 }); // Dallas
    await page.goto('/');
    const map = page.locator('#tasks-near-you');
    // Found without a press (allowed before). National, cities open in turn (owner, 2026-11-14).
    await expect(map.getByText("We're not in your city yet: we're opening across the US one city at a time.")).toBeVisible();
    await expect(map.getByRole('link', { name: "Join your city's list" })).toHaveAttribute('href', '/waitlist');
    await expect(map.getByRole('link', { name: 'Can help? Get verified now' })).toHaveAttribute('href', '/become-a-helper');
  });

  test('home map: today, this weekend or this week, and one neighborhood at a time', async ({ page }) => {
    await page.goto('/');
    const map = page.locator('#tasks-near-you');
    await landOnMap(page);
    const count = map.getByRole('status').filter({ hasText: /open tasks? around/ });
    await expect(count).toContainText('around Gainesville');
    // The board's own "when", on the market's calendar: the count says which.
    const when = map.getByRole('group', { name: 'When' });
    await when.getByRole('button', { name: 'This week', exact: true }).click();
    await expect(when.getByRole('button', { name: 'This week', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(count).toContainText('· This week');
    await when.getByRole('button', { name: 'Any time', exact: true }).click();
    await expect(count).not.toContainText('This week');

    // A neighborhood picked narrows the list and the count to it; one press shows all of the city again.
    await map.getByRole('button', { name: 'Go to a neighborhood' }).click();
    await map.getByRole('button', { name: 'Duckpond', exact: true }).click();
    await expect(count).toContainText('around Duckpond');
    const rows = map.getByRole('list', { name: 'Newest open tasks' }).getByRole('link');
    for (const row of await rows.all()) await expect(row).toContainText('Duckpond');
    await map.getByRole('button', { name: 'Show all of the city, not just Duckpond' }).click();
    await expect(count).toContainText('around Gainesville');
  });

  test("home map: kept live by the market's public stream once the visitor comes to it", async ({ page }) => {
    const opened: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/realtime/')) opened.push(new URL(request.url()).pathname);
    });
    await page.goto('/');
    // Not before: a visit that never scrolls down opens nothing.
    await page.waitForTimeout(1500);
    expect(opened).toEqual([]);
    await landOnMap(page);
    await expect.poll(() => opened, { timeout: 30_000 }).toContain('/api/realtime/market/gainesville');
  });

  test("home map: a helper's home neighborhood, instead of asking where they are", async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 32.7767, longitude: -96.797 }); // Dallas: the device is never asked by itself
    const helper = await withHomeArea('Duckpond');
    try {
      await devSignIn(page, helper.email);
      await page.goto('/');
      const map = page.locator('#tasks-near-you');
      await expect(map.getByRole('button', { name: 'Tasks near your home' })).toBeVisible();
      await expect(map.getByText('Starting from your home area, Duckpond.')).toBeVisible();
      await expect(map.getByRole('list', { name: 'Open tasks nearest you' })).toBeVisible();
      // Not Dallas: the device's location wasn't used.
      await expect(map.getByText(/We're not in your city yet/)).toHaveCount(0);
      // "Where I am now" asks the device (here, Dallas: outside the city).
      await map.getByRole('button', { name: 'Use where I am now' }).click();
      await expect(map.getByText("We're not in your city yet: we're opening across the US one city at a time.")).toBeVisible();
    } finally {
      await helper.remove();
    }
  });

  test("home without its city (paused, or none open): every city's status, the waitlist and how it works, in both languages", async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(150_000);
    // As if the home city weren't public: a test's cookie (src/modules/markets/default-market.ts, honored only in the e2e
    // build), so Gainesville isn't paused under the specs running beside this one. A real pause is a DB test
    // (tests/integration/cityless-home.test.ts).
    await context.addCookies([{ name: 'tnm_home_market', value: 'zz-not-open', url: baseURL! }]);
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Everyday tasks, done by people nearby.' })).toBeVisible();
    // No city's counts, map or town.
    await expect(page.locator('#tasks-near-you')).toHaveCount(0);
    // Every city with its status (in the test world Gainesville is open or about to open, so it links to its page).
    const gainesville = page.getByRole('region', { name: 'Where we are' }).getByRole('listitem').filter({ hasText: 'Gainesville, FL' });
    await expect(gainesville).toContainText(/Open now|Opening soon/);
    await expect(gainesville.getByRole('link', { name: 'See Gainesville, FL' })).toHaveAttribute('href', '/gainesville');
    // The waitlist, right here (a fresh address each run, removed after).
    const email = `cityless-${testInfo.project.name}-${Date.now().toString(36)}@example.test`;
    const signup = page.getByRole('region', { name: 'Tell us where you are' });
    const db = waitlistDatabase();
    try {
      await untilShown(page.getByText("You're on the list."), async () => {
        await signup.getByLabel('Email').fill(email, { timeout: 5_000 });
        await signup.getByLabel('ZIP code').fill('74103', { timeout: 5_000 });
        await signup.getByLabel('I need help').check({ timeout: 5_000 });
        await signup.getByRole('button', { name: 'Join the waitlist' }).click({ timeout: 5_000 });
      });
      expect((await db.db.select().from(waitlistEntries).where(eq(waitlistEntries.email, email)))[0]).toMatchObject({ zip: '74103', locale: 'en' });
    } finally {
      await db.db.delete(waitlistEntries).where(eq(waitlistEntries.email, email));
      await db.pool.end();
    }
    // How it works (the landing's steps, with their eyebrow).
    await expect(page.getByText('How it works', { exact: true }).first()).toBeAttached();

    // In Spanish too.
    const spanish = await page.goto('/es');
    expect(spanish?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Tareas cotidianas, hechas por personas cercanas.' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Dónde estamos' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Dinos dónde estás' }).getByRole('button', { name: 'Unirme a la lista de espera' })).toBeVisible();
  });

  test('market and category pages', async ({ page }) => {
    await page.goto('/austin');
    await expect(page.getByRole('heading', { level: 1, name: 'Everyday help in Austin' })).toBeVisible();

    await page.goto('/austin/furniture-assembly');
    await expect(page).toHaveTitle('Furniture assembly near you in Austin · TasksNearMe');
    await expect(page.getByRole('heading', { level: 1, name: 'Furniture assembly in Austin' })).toBeVisible();
  });

  test('pricing: every number comes from the fee engine and the published policy', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The fees and the fixed example are open; the other examples sit behind a disclosure each (audit M25).
    await expect(page.getByText('$54.00', { exact: true }).first()).toBeVisible();
    for (const summary of await page.getByRole('main').locator('details > summary').all()) await summary.click();
    for (const amount of ['$66.00', '$54.00', '$28.00', '$154.00', '$134.75', '$19.25', '$86.00', '$74.00']) {
      await expect(page.getByText(amount, { exact: true }).first()).toBeVisible();
    }
  });

  test('become a helper: the welcome gift card for the three checks leads, with no spots to count', async ({ page }) => {
    await page.goto('/become-a-helper');
    await expect(page.getByRole('heading', { level: 1, name: 'Put your everyday skills to work nearby' })).toBeVisible();
    // Every helper who passes the phone, ID and background checks gets it (2026-11-14).
    const gift = page.getByRole('region', { name: 'Get verified, get a $50 gift card' });
    await expect(gift).toBeVisible();
    await expect(gift.getByText('Pass a background check')).toBeVisible();
    await expect(page.getByText(/spots? left/)).toHaveCount(0);
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
