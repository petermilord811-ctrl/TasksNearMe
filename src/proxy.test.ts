import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The proxy's answers that search engines see (src/proxy.ts): one address per page and language, and a real 404 for
 * the sample marketplace's pages where samples are hidden. Which pages are samples is the database's answer
 * (src/modules/seo/sample-pages.ts), stood in for here.
 */

const state = vi.hoisted(() => ({ hidden: false, samples: new Set<string>(), asked: [] as string[] }));

vi.mock('@/modules/seo/sample-pages', () => ({
  isSamplePage: vi.fn(async (path: string) => {
    state.asked.push(path);
    return state.samples.has(path);
  }),
}));
vi.mock('@/shared/sample-data', async (original) => ({
  ...(await original<typeof import('@/shared/sample-data')>()),
  samplesHiddenInThisBuild: () => state.hidden,
}));

const { proxy, config } = await import('./proxy');

const navigate = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
const SESSION = 'better-auth.session_token=abc';

function get(path: string, headers: Record<string, string> = navigate, method = 'GET') {
  return proxy(new NextRequest(`http://localhost:3300${path}`, { headers, method }));
}
const target = (response: Response) => {
  const location = response.headers.get('location');
  if (location) return new URL(location).pathname + new URL(location).search;
  const rewrite = response.headers.get('x-middleware-rewrite');
  return rewrite ? `rewrite ${new URL(rewrite).pathname}${new URL(rewrite).search}` : null;
};
const localeCookie = (response: Response) => response.headers.getSetCookie().find((cookie) => cookie.startsWith('NEXT_LOCALE='))?.split(';')[0];

beforeEach(() => {
  state.hidden = false;
  state.samples = new Set();
  state.asked = [];
});

describe('proxy: language addresses', () => {
  it('moves /en/… to the plain address for good, keeps the query, and makes English this device’s choice', async () => {
    const response = await get('/en/become-a-helper?ref=footer', { ...navigate, cookie: 'NEXT_LOCALE=es' });
    expect(response.status).toBe(308);
    expect(target(response)).toBe('/become-a-helper?ref=footer');
    expect(localeCookie(response)).toBe('NEXT_LOCALE=en');
  });

  it('never lets a browser store that redirect, so switching back to English sets the choice again', async () => {
    for (const path of ['/en', '/en/pricing', '/en/gainesville/tasks/moving-help']) {
      expect((await get(path)).headers.get('cache-control'), path).toBe('no-store');
    }
    expect(target(await get('/en'))).toBe('/');
  });

  it('serves a plain address in English to anyone without a choice, search engines included', async () => {
    expect(target(await get('/pricing'))).toBe('rewrite /en/pricing');
    expect(target(await get('/', { ...navigate, 'accept-language': 'en-US,en;q=0.9' }))).toBe('rewrite /en');
  });

  it('sends a first visit from a browser in Spanish to the Spanish address, never Spanish at the plain one', async () => {
    const response = await get('/gainesville/furniture-assembly?sort=newest', { ...navigate, 'accept-language': 'es-MX,es;q=0.9,en;q=0.5' });
    expect(response.status).toBe(307);
    expect(target(response)).toBe('/es/gainesville/furniture-assembly?sort=newest');
    expect(target(await get('/', { ...navigate, 'accept-language': 'es' }))).toBe('/es');
  });

  it('follows the device’s choice over the browser’s languages', async () => {
    const spanishBrowser = { ...navigate, 'accept-language': 'es-MX,es;q=0.9' };
    expect(target(await get('/pricing', { ...spanishBrowser, cookie: 'NEXT_LOCALE=en' }))).toBe('rewrite /en/pricing');
    expect(target(await get('/pricing', { ...navigate, cookie: 'NEXT_LOCALE=es' }))).toBe('rewrite /es/pricing');
  });

  it('never redirects the router’s own fetches', async () => {
    const prefetch = await get('/pricing', { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', 'accept-language': 'es' });
    expect(prefetch.status).toBe(200);
    expect(target(prefetch)).toBe('rewrite /en/pricing');
  });

  it('serves /es/… as it is, and the board’s old ?category= address moves to its job hub permanently', async () => {
    const spanish = await get('/es/pricing');
    expect(spanish.status).toBe(200);
    expect(localeCookie(spanish)).toBe('NEXT_LOCALE=es');
    const hub = await get('/gainesville/tasks?category=moving-help&sort=newest');
    expect(hub.status).toBe(308);
    expect(target(hub)).toBe('/gainesville/tasks/moving-help?sort=newest');
  });
});

describe('proxy: the sample marketplace’s pages', () => {
  beforeEach(() => {
    state.samples = new Set(['/dallas', '/dallas/tasks/moving-help', '/tasks/rake-leaves-uptown-1a2b3c', '/helpers/paul-w']);
  });

  it('answer a real 404 to visitors without a session where samples are hidden, in their language', async () => {
    state.hidden = true;
    expect(target(await get('/dallas'))).toBe('rewrite /en/gone/sample/only/page');
    expect(target(await get('/es/dallas/tasks/moving-help'))).toBe('rewrite /es/gone/sample/only/page');
    expect(target(await get('/tasks/rake-leaves-uptown-1a2b3c', { ...navigate, 'accept-language': 'es' }))).toBe('rewrite /es/gone/sample/only/page');
    expect(target(await get('/helpers/paul-w', navigate, 'HEAD'))).toBe('rewrite /en/gone/sample/only/page');
  });

  it('stay for signed-in testers, and wherever samples are shown', async () => {
    state.hidden = true;
    expect(target(await get('/dallas', { ...navigate, cookie: SESSION }))).toBe('rewrite /en/dallas');
    state.hidden = false;
    expect(target(await get('/dallas'))).toBe('rewrite /en/dallas');
    expect(state.asked).toEqual([]);
  });

  it('leave real pages alone', async () => {
    state.hidden = true;
    expect(target(await get('/gainesville'))).toBe('rewrite /en/gainesville');
    expect(target(await get('/tasks/assemble-a-desk-duckpond-9f2e'))).toBe('rewrite /en/tasks/assemble-a-desk-duckpond-9f2e');
    // Only reads are answered this way; a form posting to a page goes through.
    expect(target(await get('/dallas', navigate, 'POST'))).toBe('rewrite /en/dallas');
  });
});

describe('proxy: text messages\' short links (messages pass J-M9)', () => {
  it('leaves /n/<code> to its route, outside [locale]: no language rewrite and no sample-page lookup', () => {
    expect(unstable_doesMiddlewareMatch({ config, url: '/n/Ab3dE6gH9k' })).toBe(false);
    expect(unstable_doesMiddlewareMatch({ config, url: '/n/Ab3dE6gH9k?utm=sms' })).toBe(false);
  });

  it('still runs for pages that only start with an n, and for /n without a code', () => {
    for (const url of ['/notifications', '/app/notifications', '/n', '/es/n/Ab3dE6gH9k', '/neighborhoods']) expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
  });
});
