import { expect, test, type Page } from '@playwright/test';

/**
 * What search engines read (src/modules/seo): robots.txt, the sitemap, and the head and structured data of public
 * pages. The e2e build is not the live site (src/shared/search-indexing.ts), so crawlers are asked to stay out.
 */

async function structuredData(page: Page): Promise<Array<Record<string, unknown>>> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((text) => (JSON.parse(text) as { '@graph': Array<Record<string, unknown>> })['@graph']);
}

test.describe('search engines', () => {
  test('with indexing off, robots.txt keeps crawlers out and pages say noindex', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBe(true);
    expect((await robots.text()).trim()).toBe('User-Agent: *\nDisallow: /');
    for (const path of ['/', '/es/austin']) {
      expect((await request.get(path)).headers()['x-robots-tag'], path).toBe('noindex, nofollow');
    }
  });

  test('the sitemap lists the site pages in both languages, and nothing private, unfinished or held back', async ({ request }) => {
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
      '/help/who-sees-my-address',
      '/austin',
      '/austin/tasks',
      '/austin/furniture-assembly',
      '/es/austin/furniture-assembly',
      '/austin/furniture-assembly/cost',
      '/es/austin/furniture-assembly/cost',
      '/austin/tasks/furniture-assembly',
      '/es/austin/tasks/furniture-assembly',
      '/cities',
      '/es/cities',
      '/cities/texas',
    ]) {
      expect(paths, path).toContain(path);
    }
    expect(paths.filter((path) => /^\/(es\/)?(app|admin|dev|api|code|sign-in|waitlist|legal)(\/|$)/.test(path))).toEqual([]);
    // Task pages and helper profiles are listed only in the `on` mode (the unit tests cover that list).
    expect(paths.filter((path) => /^\/(es\/)?(tasks|helpers)\//.test(path))).toEqual([]);
    const entries = xml.split('<url>').slice(1);
    expect(entries).toHaveLength(paths.length);
    for (const entry of entries) expect(entry.match(/hreflang="(en-US|es-US|x-default)"/g)).toHaveLength(3);
  });

  test('home: the site name and logo, the share card, and the other language', async ({ page, request }) => {
    await page.goto('/');
    const head = page.locator('head');
    await expect(head.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https?:\/\/[^/]+\/?$/);
    await expect(head.locator('link[rel="alternate"][hreflang="es-US"]')).toHaveAttribute('href', /\/es$/);
    await expect(head.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\/tasksnearme-en\.png$/);
    await expect(head.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    const nodes = await structuredData(page);
    expect(nodes.map((node) => node['@type'])).toEqual(['Organization', 'WebSite']);
    expect(nodes[0]).toMatchObject({ name: 'TasksNearMe', areaServed: { '@type': 'Country', name: 'United States' } });
    const card = await request.get('/og/tasksnearme-en.png');
    expect(card.ok()).toBe(true);
    expect(card.headers()['content-type']).toBe('image/png');
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
    expect(nodes.map((node) => node['@type'])).toEqual(['BreadcrumbList', 'Service']);
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
    await expect(page.getByRole('region', { name: 'More in Austin' }).getByRole('link', { name: 'Moving help' })).toHaveAttribute('href', '/austin/moving-help');
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
    // Gainesville is paused until plan 8.1: not listed anywhere yet.
    await expect(page.getByRole('link', { name: /Tasks and helpers in Gainesville/ })).toHaveCount(0);
    const states = page.getByRole('region', { name: 'Every state' });
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
    await page.goto('/cities/narnia');
    await expect(page.getByRole('heading', { name: /could not be found/i })).toBeVisible();
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
});
