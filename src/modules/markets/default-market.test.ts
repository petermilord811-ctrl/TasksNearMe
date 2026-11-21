import { describe, expect, it } from 'vitest';
import { DEFAULT_MARKET_SLUG, homeMarketOverridable, homeMarketSlug } from './default-market';

const headers = (values: Record<string, string>) => (name: string) => values[name] ?? null;
/** A browser or test runner on this machine. */
const local = headers({ host: 'localhost:3000', 'x-forwarded-for': '127.0.0.1' });
/** Someone reaching the dev server through its public address (the proxy passes their address and the public host). */
const viaPublicAddress = headers({ host: 'localhost:3000', 'x-forwarded-for': '203.0.113.7', 'x-forwarded-host': 'dev.tasksnearme.com' });

describe('the home page’s market', () => {
  it('can be named by a test’s cookie only in development (and the e2e build), and only on this machine', () => {
    expect(homeMarketOverridable({ NODE_ENV: 'development' }, local)).toBe(true);
    // A production build: never.
    expect(homeMarketOverridable({ NODE_ENV: 'production' }, local)).toBe(false);
    // The dev server through its public address: never.
    expect(homeMarketOverridable({ NODE_ENV: 'development' }, viaPublicAddress)).toBe(false);
    // A request without its own Host isn't local (security review SEC23).
    expect(homeMarketOverridable({ NODE_ENV: 'development' }, headers({ 'x-forwarded-for': '127.0.0.1' }))).toBe(false);
  });

  it('is the default one unless the request may name it; then only a plain slug', () => {
    expect(homeMarketSlug('zz-not-open', false)).toBe(DEFAULT_MARKET_SLUG);
    expect(homeMarketSlug(undefined, true)).toBe(DEFAULT_MARKET_SLUG);
    expect(homeMarketSlug('zz-not-open', true)).toBe('zz-not-open');
    expect(homeMarketSlug('../admin', true)).toBe(DEFAULT_MARKET_SLUG);
    expect(homeMarketSlug('a'.repeat(41), true)).toBe(DEFAULT_MARKET_SLUG);
  });
});
