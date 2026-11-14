import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The development helpers' switch (src/shared/dev-helpers.ts): on in development and in the e2e suite's production
 * build, off in every other production build. The e2e build answers only this machine (src/proxy.ts). The flag is
 * read when the module loads, as next.config.ts inlines it at build time, so each case loads the modules afresh.
 */

const outside = { host: 'tasksnearme.com', 'x-forwarded-for': '203.0.113.7' };
const local = { host: 'localhost:3300' };

async function load(e2eBuild: boolean) {
  vi.resetModules();
  if (e2eBuild) vi.stubEnv('TNM_E2E_BUILD', '1');
  const [helpers, { proxy }, { NextRequest }] = await Promise.all([import('@/shared/dev-helpers'), import('@/proxy'), import('next/server')]);
  const page = (headers: Record<string, string>) => proxy(new NextRequest('http://localhost:3300/pricing', { headers }));
  return { ...helpers, page };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('devHelpersOn', () => {
  it('is on in development and tests, and off in a production build', async () => {
    const { devHelpersOn, E2E_BUILD } = await load(false);
    expect(E2E_BUILD).toBe(false);
    expect(devHelpersOn({ NODE_ENV: 'development' })).toBe(true);
    expect(devHelpersOn({ NODE_ENV: 'test' })).toBe(true);
    expect(devHelpersOn({ NODE_ENV: 'production' })).toBe(false);
  });

  it('is on in the e2e build, which is a production build', async () => {
    const { devHelpersOn, E2E_BUILD } = await load(true);
    expect(E2E_BUILD).toBe(true);
    expect(devHelpersOn({ NODE_ENV: 'production' })).toBe(true);
  });
});

describe('the e2e build serves this machine only', () => {
  it('answers not found to a page request from elsewhere, and serves this machine', async () => {
    const { page } = await load(true);
    expect(page(outside).status).toBe(404);
    expect(page(local).status).not.toBe(404);
  });

  it('leaves the public pages of any other build open to everyone', async () => {
    const { page } = await load(false);
    expect(page(outside).status).not.toBe(404);
  });
});
