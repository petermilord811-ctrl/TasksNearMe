import { describe, expect, it } from 'vitest';
import { absoluteUrl, latestDate, MAX_SITEMAP_URLS, sitemapEntries, sitemapPages, type SitemapData } from './sitemap-entries';

const BASE = 'https://tasksnearme.com';
/** The `on` mode (src/shared/search-indexing.ts): task pages and helper profiles too. */
const ALL = { listings: true };

const data: SitemapData = {
  homeMarketSlug: 'austin',
  markets: [
    {
      slug: 'austin',
      indexable: true,
      categorySlugs: ['furniture-assembly', 'moving-help', 'computer-help'],
      tasks: [
        { slug: 'assemble-a-desk-mueller-7f3k', categorySlug: 'furniture-assembly', updatedAt: '2026-11-14T09:00:00.000Z' },
        { slug: 'help-loading-a-moving-truck-crestview-9d2a', categorySlug: 'moving-help', updatedAt: '2026-11-13T18:30:00.000Z' },
        { slug: 'assemble-two-nightstands-mueller-8n2v', categorySlug: 'furniture-assembly', updatedAt: '2026-11-12T15:00:00.000Z' },
      ],
    },
  ],
  helpers: [{ handle: 'jordan-t', updatedAt: '2026-11-10T12:00:00.000Z' }],
  helpArticles: [
    { slug: 'post-your-first-task', updatedAt: '2026-11-11T17:00:00.000Z' },
    { slug: 'who-sees-my-address', updatedAt: '2026-11-12T17:00:00.000Z' },
  ],
  legalDocs: [{ doc: 'terms', updatedAt: '2026-11-01T17:00:00.000Z' }],
  cityStates: ['texas'],
};

describe('sitemapPages', () => {
  const pages = sitemapPages(data, ALL);
  const byPath = new Map(pages.map((page) => [page.path, page]));

  it('lists the public pages, markets and their categories (page, cost guide, job hub with open tasks), helpers, then tasks', () => {
    expect(pages.map((page) => page.path)).toEqual([
      '/',
      '/how-it-works',
      '/pricing',
      '/become-a-helper',
      '/trust-and-safety',
      '/about',
      '/help',
      '/help/post-your-first-task',
      '/help/who-sees-my-address',
      '/help/contact',
      '/legal/terms',
      '/cities',
      '/cities/texas',
      '/austin',
      '/austin/tasks',
      '/austin/furniture-assembly',
      '/austin/furniture-assembly/cost',
      '/austin/tasks/furniture-assembly',
      '/austin/moving-help',
      '/austin/moving-help/cost',
      '/austin/tasks/moving-help',
      '/austin/computer-help',
      '/austin/computer-help/cost',
      '/helpers/jordan-t',
      '/tasks/assemble-a-desk-mueller-7f3k',
      '/tasks/help-loading-a-moving-truck-crestview-9d2a',
      '/tasks/assemble-two-nightstands-mueller-8n2v',
    ]);
  });

  it('dates pages by their content, and leaves the date out when there is none', () => {
    expect(byPath.get('/')?.lastModified).toBe('2026-11-14T09:00:00.000Z');
    expect(byPath.get('/austin')?.lastModified).toBe('2026-11-14T09:00:00.000Z');
    expect(byPath.get('/austin/tasks')?.lastModified).toBe('2026-11-14T09:00:00.000Z');
    expect(byPath.get('/austin/furniture-assembly')?.lastModified).toBe('2026-11-14T09:00:00.000Z');
    expect(byPath.get('/austin/moving-help')?.lastModified).toBe('2026-11-13T18:30:00.000Z');
    expect(byPath.get('/austin/computer-help')?.lastModified).toBeUndefined();
    // A job hub changes when its category's tasks do.
    expect(byPath.get('/austin/tasks/moving-help')?.lastModified).toBe('2026-11-13T18:30:00.000Z');
    expect(byPath.get('/help')?.lastModified).toBe('2026-11-12T17:00:00.000Z');
    expect(byPath.get('/help/post-your-first-task')?.lastModified).toBe('2026-11-11T17:00:00.000Z');
    expect(byPath.get('/legal/terms')?.lastModified).toBe('2026-11-01T17:00:00.000Z');
    expect(byPath.get('/helpers/jordan-t')?.lastModified).toBe('2026-11-10T12:00:00.000Z');
    expect(byPath.get('/tasks/assemble-two-nightstands-mueller-8n2v')?.lastModified).toBe('2026-11-12T15:00:00.000Z');
    for (const path of ['/how-it-works', '/pricing', '/become-a-helper', '/trust-and-safety', '/about', '/help/contact', '/austin/furniture-assembly/cost']) {
      expect(byPath.get(path)?.lastModified, path).toBeUndefined();
    }
  });

  it('never lists signed-in, staff, development or noindex pages', () => {
    for (const { path } of pages) {
      expect(path).not.toMatch(/^\/(app|admin|dev|api|code|email|invite|sign-in|sign-up|signup|waitlist)(\/|$)/);
      expect(path).not.toContain('?');
    }
  });

  it('without listings (SEARCH_INDEXING=site), leaves out task pages and helper profiles but still dates markets by them', () => {
    const site = sitemapPages(data, { listings: false });
    expect(site.map((page) => page.path)).toEqual(pages.map((page) => page.path).filter((path) => !/^\/(tasks|helpers)\//.test(path)));
    expect(site.find((page) => page.path === '/austin/furniture-assembly')?.lastModified).toBe('2026-11-14T09:00:00.000Z');
    expect(site.find((page) => page.path === '/')?.lastModified).toBe('2026-11-14T09:00:00.000Z');
  });

  it('leaves out a market that is not open yet, with its board, categories and tasks', () => {
    const chicago = { slug: 'chicago', indexable: false, categorySlugs: ['moving-help' as const], tasks: [{ slug: 'help-moving-a-sofa-loop-1a2b', categorySlug: 'moving-help', updatedAt: '2026-11-14T10:00:00.000Z' }] };
    const paths = sitemapPages({ ...data, markets: [...data.markets, chicago] }, ALL).map((page) => page.path);
    expect(paths.filter((path) => path.includes('chicago') || path.includes('loop-1a2b'))).toEqual([]);
    expect(paths).toContain('/austin/moving-help');
  });

  it('lists a market with no open tasks by its city, category pages and cost guides, not its empty board and job hubs', () => {
    const quiet = { slug: 'gainesville', indexable: true, categorySlugs: ['moving-help' as const, 'yard-cleanup' as const], tasks: [] };
    const paths = sitemapPages({ ...data, homeMarketSlug: 'gainesville', markets: [quiet] }, ALL).map((page) => page.path);
    expect(paths.filter((path) => path.startsWith('/gainesville'))).toEqual([
      '/gainesville',
      '/gainesville/moving-help',
      '/gainesville/moving-help/cost',
      '/gainesville/yard-cleanup',
      '/gainesville/yard-cleanup/cost',
    ]);
    // Its first open task brings in the board and that category's hub, dated by the task.
    const first = { slug: 'rake-oak-leaves-duckpond-a1b2', categorySlug: 'yard-cleanup', updatedAt: '2026-11-21T08:00:00.000Z' };
    const busy = sitemapPages({ ...data, homeMarketSlug: 'gainesville', markets: [{ ...quiet, tasks: [first] }] }, { listings: false });
    expect(busy.filter((page) => page.path.startsWith('/gainesville/tasks'))).toEqual([
      { path: '/gainesville/tasks', lastModified: '2026-11-21T08:00:00.000Z' },
      { path: '/gainesville/tasks/yard-cleanup', lastModified: '2026-11-21T08:00:00.000Z' },
    ]);
  });

  it('works with no markets, tasks, helpers or published legal texts', () => {
    const empty = sitemapPages({ homeMarketSlug: 'austin', markets: [], helpers: [], helpArticles: [], legalDocs: [] }, ALL);
    expect(empty.map((page) => page.path)).toEqual(['/', '/how-it-works', '/pricing', '/become-a-helper', '/trust-and-safety', '/about', '/help', '/help/contact', '/cities']);
    expect(empty.every((page) => page.lastModified === undefined)).toBe(true);
  });
});

describe('sitemapEntries', () => {
  const entries = sitemapEntries(BASE, sitemapPages(data, ALL));

  it('lists each page in English and in Spanish, each naming both languages and the default', () => {
    const board = entries.filter((entry) => entry.url.endsWith('/austin/tasks'));
    expect(board).toEqual([
      {
        url: 'https://tasksnearme.com/austin/tasks',
        lastModified: '2026-11-14T09:00:00.000Z',
        alternates: {
          languages: {
            'en-US': 'https://tasksnearme.com/austin/tasks',
            'es-US': 'https://tasksnearme.com/es/austin/tasks',
            'x-default': 'https://tasksnearme.com/austin/tasks',
          },
        },
      },
      {
        url: 'https://tasksnearme.com/es/austin/tasks',
        lastModified: '2026-11-14T09:00:00.000Z',
        alternates: {
          languages: {
            'en-US': 'https://tasksnearme.com/austin/tasks',
            'es-US': 'https://tasksnearme.com/es/austin/tasks',
            'x-default': 'https://tasksnearme.com/austin/tasks',
          },
        },
      },
    ]);
    expect(entries).toHaveLength(sitemapPages(data, ALL).length * 2);
  });

  it('writes the home page as the bare origin, as its canonical link does, and Spanish home as /es', () => {
    expect(entries[0]).toMatchObject({ url: BASE, alternates: { languages: { 'en-US': BASE, 'es-US': `${BASE}/es`, 'x-default': BASE } } });
    expect(entries[1]?.url).toBe(`${BASE}/es`);
  });

  it('has no duplicate addresses, and omits lastModified rather than guessing', () => {
    expect(new Set(entries.map((entry) => entry.url)).size).toBe(entries.length);
    const pricing = entries.find((entry) => entry.url === `${BASE}/pricing`);
    expect(pricing).toBeDefined();
    expect(pricing && 'lastModified' in pricing).toBe(false);
  });

  it('stops at the 50,000 addresses one sitemap may hold, dropping the oldest tasks first', () => {
    const tasks = Array.from({ length: MAX_SITEMAP_URLS }, (_, index) => ({
      slug: `task-${index}`,
      categorySlug: 'moving-help',
      updatedAt: '2026-11-14T09:00:00.000Z',
    }));
    const big = sitemapEntries(BASE, sitemapPages({ ...data, markets: [{ ...data.markets[0]!, tasks }] }, ALL));
    expect(big).toHaveLength(MAX_SITEMAP_URLS);
    expect(big.some((entry) => entry.url === `${BASE}/helpers/jordan-t`)).toBe(true);
    expect(big.at(-1)?.url).not.toBe(`${BASE}/es/tasks/task-${MAX_SITEMAP_URLS - 1}`);
  });
});

describe('helpers', () => {
  it('latestDate compares by time and skips missing dates', () => {
    expect(latestDate(['2026-11-12T15:00:00.000Z', undefined, '2026-11-14T09:00:00.000Z', '2026-11-13T00:00:00.000Z'])).toBe('2026-11-14T09:00:00.000Z');
    expect(latestDate([])).toBeUndefined();
    expect(latestDate([undefined])).toBeUndefined();
  });

  it('absoluteUrl tolerates a base address with a trailing slash', () => {
    expect(absoluteUrl('https://tasksnearme.com/', '/pricing')).toBe('https://tasksnearme.com/pricing');
    expect(absoluteUrl('https://tasksnearme.com/', '/')).toBe('https://tasksnearme.com');
  });
});
