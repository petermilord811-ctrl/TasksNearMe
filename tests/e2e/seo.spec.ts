import { expect, test, type Page } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import { featureFlags } from '../../src/modules/markets/schema';
import { createDb } from '../../src/platform/db/connect';
import { exclusive } from './support/exclusive';
import { devSignIn } from './support/sign-in';

/**
 * What search engines read (src/modules/seo): robots.txt, the sitemap, and the head and structured data of public
 * pages. The e2e build is not the live site (src/shared/search-indexing.ts), so crawlers are asked to stay out, until
 * the last test sets the admin search setting (and removes it again).
 */

/**
 * The admin search setting is shared by the whole app: the tests that read or change it take turns across the phone
 * and desktop projects, which run this file at the same time.
 */
const SEARCH_SETTING = 'search-setting';

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

/** The e2e database (the suite's own; .env.local only when the shell sets none), for the setting's clean-up. */
function database() {
  try {
    if (!process.env.DATABASE_URL) process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  return createDb(process.env.DATABASE_URL ?? '', { max: 1 });
}

async function structuredData(page: Page): Promise<Array<Record<string, unknown>>> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((text) => (JSON.parse(text) as { '@graph': Array<Record<string, unknown>> })['@graph']);
}

test.describe('search engines', () => {
  test('with indexing off, robots.txt keeps crawlers out and pages say noindex', async ({ request }) => {
    test.setTimeout(240_000);
    await exclusive(SEARCH_SETTING, async () => {
      const robots = await request.get('/robots.txt');
      expect(robots.ok()).toBe(true);
      expect((await robots.text()).trim()).toBe('User-Agent: *\nDisallow: /');
      for (const path of ['/', '/es/austin']) {
        expect((await request.get(path)).headers()['x-robots-tag'], path).toBe('noindex, nofollow');
      }
    });
  });

  test('the sitemap lists the site pages in both languages, and nothing private, unfinished or held back', async ({ request }) => {
    test.setTimeout(240_000);
    await exclusive(SEARCH_SETTING, async () => {
      const response = await request.get('/sitemap.xml');
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('xml');
      const xml = await response.text();
      const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]!).pathname);
      for (const path of [
        '/',
        '/es',
        '/pricing',
        '/es/pricing',
        '/about',
        '/es/about',
        '/help/who-sees-my-address',
        '/help/contact',
        // The first city's pages (Gainesville since 2026-11-17).
        '/gainesville',
        '/gainesville/tasks',
        '/gainesville/furniture-assembly',
        '/es/gainesville/furniture-assembly',
        '/gainesville/furniture-assembly/cost',
        '/es/gainesville/furniture-assembly/cost',
        // A job hub is listed once it has an open task: the seed's Gainesville yard task (no other e2e test posts or
        // cancels yard tasks, so it stays open whatever the order).
        '/gainesville/tasks/yard-cleanup',
        '/es/gainesville/tasks/yard-cleanup',
        '/cities',
        '/es/cities',
        '/cities/florida',
      ]) {
        expect(paths, path).toContain(path);
      }
      // A later city (Austin, open here only for the test cast) stays out until it is live.
      expect(paths.filter((path) => /^\/(es\/)?austin(\/|$)/.test(path))).toEqual([]);
      expect(paths.filter((path) => /^\/(es\/)?(app|admin|dev|api|code|sign-in|waitlist|legal)(\/|$)/.test(path))).toEqual([]);
      // Task pages and helper profiles are listed only in the `on` mode (the unit tests cover that list).
      expect(paths.filter((path) => /^\/(es\/)?(tasks|helpers)\//.test(path))).toEqual([]);
      const entries = xml.split('<url>').slice(1);
      expect(entries).toHaveLength(paths.length);
      for (const entry of entries) expect(entry.match(/hreflang="(en-US|es-US|x-default)"/g)).toHaveLength(3);
    });
  });

  test('home: the site name and logo, the share card, and the other language', async ({ page, request }) => {
    await page.goto('/');
    const head = page.locator('head');
    await expect(head.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https?:\/\/[^/]+\/?$/);
    await expect(head.locator('link[rel="alternate"][hreflang="es-US"]')).toHaveAttribute('href', /\/es$/);
    await expect(head.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\/tasksnearme-en\.png$/);
    await expect(head.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    const nodes = await structuredData(page);
    expect(nodes.map((node) => node['@type'])).toEqual(['OnlineBusiness', 'WebSite']);
    expect(nodes[0]).toMatchObject({ name: 'TasksNearMe', areaServed: { '@type': 'Country', name: 'United States' } });
    const card = await request.get('/og/tasksnearme-en.png');
    expect(card.ok()).toBe(true);
    expect(card.headers()['content-type']).toBe('image/png');
  });

  test('one address per page and language: /en/… moves for good, a browser in Spanish goes to /es/…', async ({ request }) => {
    const at = (response: { headers(): Record<string, string> }) => {
      const url = new URL(response.headers()['location']!, 'http://localhost');
      return url.pathname + url.search;
    };
    // A first visit from a browser in Spanish (no choice made on this device yet) is sent to the Spanish address; the
    // plain one never shows Spanish.
    const spanish = await request.get('/pricing', { maxRedirects: 0, headers: { 'accept-language': 'es-MX,es;q=0.9' } });
    expect(spanish.status()).toBe(307);
    expect(at(spanish)).toBe('/es/pricing');
    const plain = await request.get('/pricing', { maxRedirects: 0, headers: { 'accept-language': 'en-US,en;q=0.9' } });
    expect(plain.status()).toBe(200);
    expect(await plain.text()).toMatch(/<html[^>]* lang="en"/);
    // English has no prefix: permanent, so search engines keep the plain address; never stored by browsers, since it
    // also makes English this device's choice (last here: from then on the cookie decides, not the browser).
    const english = await request.get('/en/pricing?ref=footer', { maxRedirects: 0 });
    expect(english.status()).toBe(308);
    expect(at(english)).toBe('/pricing?ref=footer');
    expect(english.headers()['cache-control']).toContain('no-store');
  });

  test('the about page says who runs the site, in both languages, and the footer leads to it', async ({ page, request }) => {
    // Every public page's footer links to it (folded into a row that opens on phones, so the address is what's checked).
    await page.goto('/how-it-works');
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'About us', includeHidden: true }).first()).toHaveAttribute('href', '/about');
    await page.goto('/about');
    await expect(page).toHaveTitle('About TasksNearMe: everyday help from verified people nearby');
    await expect(page.getByRole('heading', { level: 1, name: 'About TasksNearMe' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'What we stand for' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', '/help/contact');
    // The site's address in words, on every page.
    await expect(page.getByRole('contentinfo').getByText(/tasksnearme\.com/).first()).toBeVisible();

    // What crawlers read: the page as served. (Once it hydrates, this build adds a second canonical with the server's
    // own address: it's built for :3000 and served on :3300. On the live site both are the same address, and the page
    // has one.)
    const html = await (await request.get('/about')).text();
    expect(html.match(/<link rel="canonical" href="[^"]*\/about"\/>/g)).toHaveLength(1);
    expect(html).toMatch(/<link rel="alternate" hreflang="es-US" href="[^"]*\/es\/about"\/>/i);
    // The page about the organization, and the organization itself (the same node as the home page's).
    const nodes = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(
      (match) => (JSON.parse(match[1]!) as { '@graph': Array<Record<string, unknown>> })['@graph'],
    );
    expect(nodes.map((node) => node['@type'])).toEqual(['AboutPage', 'OnlineBusiness']);
    expect(nodes[0]).toMatchObject({ mainEntity: { '@id': nodes[1]!['@id'] } });
    expect(nodes[1]).toMatchObject({ name: 'TasksNearMe', contactPoint: { contactType: 'customer support' } });

    await page.goto('/es/about');
    await expect(page.getByRole('heading', { level: 1, name: 'Sobre TasksNearMe' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Contactar a soporte' })).toHaveAttribute('href', '/es/help/contact');
  });

  test('a category page in Spanish: its name in Spanish, its own canonical, a Spanish card, breadcrumbs and service', async ({ page }) => {
    await page.goto('/es/austin/furniture-assembly');
    await expect(page).toHaveTitle('Armado de muebles cerca de ti en Austin · TasksNearMe');
    const head = page.locator('head');
    await expect(head.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/es\/austin\/furniture-assembly$/);
    await expect(head.locator('link[rel="alternate"][hreflang="en-US"]')).toHaveAttribute('href', /^https?:\/\/[^/]+\/austin\/furniture-assembly$/);
    await expect(head.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'es_US');
    await expect(head.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\/tasksnearme-es\.png$/);
    const nodes = await structuredData(page);
    expect(nodes.map((node) => node['@type'])).toEqual(['BreadcrumbList', 'Service', 'ImageObject']);
    // The header's licensed photo, credited to its photographer and source, described in Spanish (plan 9.12).
    expect(nodes[2]).toMatchObject({ license: expect.stringMatching(/^https:\/\/(www\.pexels\.com|unsplash\.com)\//), creator: { '@type': 'Person' } });
    expect(nodes[1]).toMatchObject({ serviceType: 'Armado de muebles', areaServed: { '@type': 'City', name: 'Austin' } });
  });

  test('a category page gives Austin substance: the city guide, questions people ask, related links', async ({ page }) => {
    await page.goto('/austin/furniture-assembly');
    await expect(page.getByRole('region', { name: 'Good to know in Austin' })).toBeVisible();
    const faq = page.getByRole('region', { name: 'Questions people ask' });
    const cost = faq.getByRole('heading', { level: 3, name: 'How much does furniture assembly cost in Austin?' });
    await expect(cost).toBeVisible();
    await cost.click();
    await expect(faq.getByText(/^In Austin, typical prices are \$/)).toBeVisible();
    // Only this page's own links (audit L21): the footer below lists every service.
    const more = page.getByRole('region', { name: 'More in Austin' });
    await expect(more.getByRole('link', { name: 'How much does furniture assembly cost in Austin?' })).toHaveAttribute('href', '/austin/furniture-assembly/cost');
    await expect(more.getByRole('link', { name: 'Moving help' })).toHaveCount(0);
    // Seeded people aren't real, so no counts line.
    await expect(page.getByText(/^\d+ verified helpers?/)).toHaveCount(0);

    await page.goto('/es/austin/furniture-assembly');
    await expect(page.getByRole('region', { name: 'Lo que conviene saber en Austin' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: '¿Cuánto cuesta el armado de muebles en Austin?' })).toBeVisible();
  });

  test('a cost guide answers the question with the published fees, in both languages', async ({ page }) => {
    await page.goto('/austin/furniture-assembly');
    await page.getByRole('region', { name: 'More in Austin' }).getByRole('link', { name: 'How much does furniture assembly cost in Austin?' }).click();
    await expect(page).toHaveURL(/\/austin\/furniture-assembly\/cost$/);
    await expect(page).toHaveTitle('How much does furniture assembly cost in Austin? · TasksNearMe');
    await expect(page.getByRole('heading', { level: 1, name: 'How much does furniture assembly cost in Austin?' })).toBeVisible();
    await expect(page.getByRole('region', { name: /^At the low end: \$/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'What changes the price' }).getByRole('listitem')).toHaveCount(4);
    const [trail] = await structuredData(page);
    expect((trail!.itemListElement as Array<{ name: string }>).map((item) => item.name)).toEqual([
      'TasksNearMe',
      'Austin',
      'Furniture assembly',
      'How much does furniture assembly cost in Austin?',
    ]);

    await page.goto('/es/austin/moving-help/cost');
    await expect(page.getByRole('heading', { level: 1, name: '¿Cuánto cuesta la ayuda con mudanzas en Austin?' })).toBeVisible();
    await expect(page.getByRole('region', { name: /^Con el precio más bajo: \$/ })).toBeVisible();
    // Spanish pages link to Spanish pages (SEO plan S7.2).
    const more = page.getByRole('region', { name: 'Más en Austin' });
    await expect(more.getByRole('link', { name: 'Ayuda con mudanzas cerca de ti en Austin' })).toHaveAttribute('href', '/es/austin/moving-help');
    await expect(more.getByRole('link', { name: 'Precios y tarifas' })).toHaveAttribute('href', '/es/pricing');
  });

  test('a job hub is the board on one category, with its own title, heading and breadcrumbs', async ({ page, request }) => {
    // The board's older filtered address moves to the hub, its other filters kept.
    const old = await request.get('/austin/tasks?category=yard-cleanup&sort=newest', { maxRedirects: 0 });
    expect(old.status()).toBe(308);
    const moved = new URL(old.headers()['location']!, 'http://localhost');
    expect(moved.pathname + moved.search).toBe('/austin/tasks/yard-cleanup?sort=newest');

    // Yard cleanup: no other e2e test posts or cancels yard tasks.
    await page.goto('/austin/yard-cleanup');
    await page.getByRole('region', { name: 'More in Austin' }).getByRole('link', { name: 'Yard cleanup jobs near you in Austin' }).click();
    await expect(page).toHaveURL(/\/austin\/tasks\/yard-cleanup$/);
    await expect(page).toHaveTitle('Yard cleanup jobs near you in Austin · TasksNearMe');
    await expect(page.getByRole('heading', { level: 1, name: 'Yard cleanup jobs near you in Austin' })).toBeVisible();
    // After the soft navigation the hub's canonical replaces the category page's: one in the head.
    const canonical = page.locator('head link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    await expect(canonical).toHaveAttribute('href', /\/austin\/tasks\/yard-cleanup$/);
    await expect(page.getByRole('link', { name: 'Rake and bag front-yard leaves' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Assemble a desk (flat-pack, 1 item)' })).toHaveCount(0);
    const [trail] = await structuredData(page);
    expect((trail!.itemListElement as Array<{ name: string }>).map((item) => item.name)).toEqual([
      'TasksNearMe',
      'Austin',
      'Open tasks near you in Austin',
      'Yard cleanup jobs near you in Austin',
    ]);

    await page.goto('/es/austin/tasks/yard-cleanup');
    await expect(page).toHaveTitle('Trabajos de limpieza de jardín cerca de ti en Austin · TasksNearMe');
    await expect(page.getByRole('heading', { level: 1, name: 'Trabajos de limpieza de jardín cerca de ti en Austin' })).toBeVisible();
  });

  test('/cities: where we are and every state; a state page is indexed only with something real to show', async ({ page }) => {
    await page.goto('/cities');
    await expect(page).toHaveTitle('Cities: where TasksNearMe is open and coming next · TasksNearMe');
    await expect(page.getByRole('heading', { level: 1, name: 'TasksNearMe, city by city' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Tasks and helpers in Austin/ })).toHaveAttribute('href', '/austin');
    // Gainesville, the first city, is open (pre-launch).
    await expect(page.getByRole('link', { name: /Tasks and helpers in Gainesville/ })).toHaveAttribute('href', '/gainesville');
    const states = page.getByRole('region', { name: 'Every state' });
    // States with a city or people waiting first, the rest folded into one list of names (audit M49).
    await expect(states.getByRole('link', { name: /^Florida.*opening soon/ })).toBeVisible();
    await states.getByText(/^All other states \(\d+\)$/).click();
    await expect(states.getByRole('link')).toHaveCount(51);
    await states.getByRole('link', { name: /^Texas/ }).click();
    await expect(page).toHaveURL(/\/cities\/texas$/);
    await expect(page.getByRole('heading', { level: 1, name: 'TasksNearMe in Texas' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Tasks and helpers in Austin/ })).toBeVisible();
    await expect(page.locator('head meta[name="robots"]')).not.toHaveAttribute('content', /noindex/);
    const [trail] = await structuredData(page);
    expect((trail!.itemListElement as Array<{ name: string }>).map((item) => item.name)).toEqual(['TasksNearMe', 'Cities', 'Texas']);

    // Nothing open and nobody waiting: there for people, kept out of search.
    await page.goto('/cities/wyoming');
    await expect(page.getByRole('heading', { level: 1, name: 'TasksNearMe in Wyoming' })).toBeVisible();
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    await page.goto('/es/cities/new-york');
    await expect(page).toHaveTitle('TasksNearMe en Nueva York: ciudades abiertas y próximas · TasksNearMe');
    // The /es visit made Spanish this browser's language, so the site's not-found page answers in Spanish.
    await page.goto('/cities/narnia');
    await expect(page.getByRole('heading', { level: 1, name: 'No pudimos encontrar esta página' })).toBeVisible();
  });

  test('a public task and a helper profile carry only what their page shows', async ({ page }) => {
    await page.goto('/austin/tasks');
    await page.locator('a[href^="/tasks/"]').first().click();
    await expect(page).toHaveURL(/\/tasks\//);
    const [trail] = await structuredData(page);
    expect(trail).toMatchObject({ '@type': 'BreadcrumbList' });
    expect((trail!.itemListElement as unknown[]).length).toBe(4);

    await page.goto('/helpers/jordan-t');
    const [profile] = await structuredData(page);
    expect(profile).toMatchObject({ '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: 'Jordan T.' } });
    const person = JSON.stringify(profile);
    for (const field of ['familyName', 'telephone', 'email', 'address', 'image']) expect(person).not.toContain(`"${field}"`);
  });

  // Last in the file: it changes what the other tests read (robots.txt, the sitemap), and puts it back.
  test('launch day: an admin opens task pages and profiles to search from the config page, and keeps them out again, without a deploy', async ({ page, request }) => {
    test.setTimeout(420_000);
    const robotsTxt = async () => (await request.get('/robots.txt')).text();
    const sitemapTasks = async () => [...(await (await request.get('/sitemap.xml')).text()).matchAll(/<loc>https?:\/\/[^/<]+(\/tasks\/[^<]+)<\/loc>/g)].map((match) => match[1]!);
    await exclusive(SEARCH_SETTING, async () => {
      const { db, pool } = database();
      try {
        await staffSignIn(page, 'riley@example.test');
        await page.goto('/admin/config');
        const section = page.getByRole('region', { name: 'Search engines' });
        await expect(section.getByText('Site pages only', { exact: true })).toBeVisible({ timeout: 45_000 });
        // Never set, this build stays out of search.
        expect((await robotsTxt()).trim()).toBe('User-Agent: *\nDisallow: /');

        await section.getByRole('button', { name: 'Open tasks and profiles to search' }).click();
        const open = page.getByRole('alertdialog', { name: 'Open task pages and helper profiles to search?' });
        await open.getByLabel('Reason').fill('Launch rehearsal: listings open for the seo e2e.');
        await open.getByRole('button', { name: 'Open tasks and profiles to search' }).click();
        await expect(section.getByText('Site pages, tasks and profiles', { exact: true })).toBeVisible({ timeout: 30_000 });
        await expect(section.getByText(/^Reason: Launch rehearsal: listings open/)).toBeVisible();
        // robots.txt and the sitemap at once; a task page's X-Robots-Tag within the proxy's 15 seconds.
        expect(await robotsTxt()).toContain('Allow: /');
        const tasks = await sitemapTasks();
        expect(tasks.length).toBeGreaterThan(0);
        await expect.poll(async () => (await request.get(tasks[0]!)).headers()['x-robots-tag'] ?? 'none', { timeout: 40_000 }).toBe('none');

        await section.getByRole('button', { name: 'Keep tasks and profiles out' }).click();
        const close = page.getByRole('alertdialog', { name: 'Keep task pages and helper profiles out of search?' });
        await close.getByLabel('Reason').fill('Launch rehearsal: back to site pages only.');
        await close.getByRole('button', { name: 'Keep tasks and profiles out' }).click();
        await expect(section.getByText('Site pages only', { exact: true })).toBeVisible({ timeout: 30_000 });
        expect(await sitemapTasks()).toEqual([]);
        await expect.poll(async () => (await request.get(tasks[0]!)).headers()['x-robots-tag'] ?? 'none', { timeout: 40_000 }).toBe('noindex');
      } finally {
        // This build's own default again (nothing set: out of search) for every later test.
        await db.delete(featureFlags).where(and(eq(featureFlags.key, 'search.listings'), eq(featureFlags.marketId, 'global')));
        await pool.end();
      }
      // Back to it before other tests read it: robots.txt at once, the proxy's header within its 15 seconds.
      expect((await robotsTxt()).trim()).toBe('User-Agent: *\nDisallow: /');
      await expect.poll(async () => (await request.get('/')).headers()['x-robots-tag'], { timeout: 40_000 }).toBe('noindex, nofollow');
    });
  });
});
