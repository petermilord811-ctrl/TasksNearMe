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
