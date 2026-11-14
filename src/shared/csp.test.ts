import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, cspHeaderName } from './csp';

const directive = (policy: string, name: string) => policy.split('; ').find((part) => part.startsWith(`${name} `)) ?? '';

describe('the Content Security Policy', () => {
  const production = contentSecurityPolicy({ development: false });

  it('allows only the script and frame hosts the app uses (Stripe, Turnstile)', () => {
    expect(directive(production, 'script-src')).toBe("script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.js.stripe.com https://challenges.cloudflare.com");
    expect(directive(production, 'frame-src')).toBe('frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com');
    expect(production).not.toContain('unsafe-eval');
  });

  it('lets the map load its style and tiles, and run its workers', () => {
    expect(directive(production, 'connect-src')).toContain('https://tiles.openfreemap.org');
    expect(directive(production, 'worker-src')).toBe("worker-src 'self' blob:");
    const custom = contentSecurityPolicy({ development: false, mapStyleUrl: 'https://api.maptiler.com/maps/streets/style.json?key=x' });
    expect(directive(custom, 'connect-src')).toContain('https://api.maptiler.com');
    // Only https origins, and never a broken value.
    expect(contentSecurityPolicy({ development: false, mapStyleUrl: 'http://tiles.local/style.json' })).not.toContain('tiles.local');
    expect(contentSecurityPolicy({ development: false, mapStyleUrl: 'not a url' })).toBe(production);
  });

  it('closes plugins, <base> changes, framing and posts to other sites (except the sign-in providers)', () => {
    expect(directive(production, 'object-src')).toBe("object-src 'none'");
    expect(directive(production, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(production, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(production, 'form-action')).toBe("form-action 'self' https://accounts.google.com https://login.microsoftonline.com");
    expect(production.endsWith('upgrade-insecure-requests')).toBe(true);
  });

  it('adds eval and the dev server’s websockets in development, where it only reports', () => {
    const development = contentSecurityPolicy({ development: true });
    expect(directive(development, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(development, 'connect-src')).toContain('ws:');
    expect(development).not.toContain('upgrade-insecure-requests');
    expect(cspHeaderName(true)).toBe('Content-Security-Policy-Report-Only');
    expect(cspHeaderName(false)).toBe('Content-Security-Policy');
  });

  it('keeps the production policy over plain http (the e2e build on localhost), without the upgrade to https', () => {
    const plain = contentSecurityPolicy({ development: false, plainHttp: true });
    expect(plain).not.toContain('upgrade-insecure-requests');
    expect(directive(plain, 'script-src')).toBe(directive(production, 'script-src'));
    expect(plain).toBe(production.replace('; upgrade-insecure-requests', ''));
  });
});
