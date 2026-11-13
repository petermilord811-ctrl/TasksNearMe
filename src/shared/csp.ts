/**
 * The Content Security Policy for every page (B-061; blueprint 07 §8 "strict CSP"). It lists only what the app
 * loads in the browser:
 * - Stripe.js and its frames (the card field, 3-D Secure): js.stripe.com, hooks.stripe.com, api.stripe.com;
 * - Cloudflare Turnstile's script and frame: challenges.cloudflare.com;
 * - the map's style, tiles, glyphs and sprites (OpenFreeMap unless `MAP_STYLE_URL` names another host), drawn
 *   by MapLibre with its worker from this site (`/vendor/maplibre-gl-worker.mjs`) and the town's own workers;
 * - form posts that may end at Google's or Microsoft's sign-in page.
 *
 * Inline scripts stay allowed: pages are prerendered shells (Cache Components), which can't carry a per-request
 * nonce (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md, "Without Nonces"). Everything
 * else is closed: other script hosts, plugins (`object-src`), `<base>` changes, being framed, form posts elsewhere.
 * Development adds `eval` (React Refresh) and the dev server's websockets, and is sent report-only.
 */

const STRIPE = { script: ['https://js.stripe.com', 'https://*.js.stripe.com'], frame: ['https://js.stripe.com', 'https://*.js.stripe.com', 'https://hooks.stripe.com'], connect: ['https://api.stripe.com'] };
const TURNSTILE = 'https://challenges.cloudflare.com';
const DEFAULT_MAP_ORIGIN = 'https://tiles.openfreemap.org';
const SIGN_IN_PROVIDERS = ['https://accounts.google.com', 'https://login.microsoftonline.com'];

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

export interface CspOptions {
  development: boolean;
  /** `MAP_STYLE_URL`, when set: its host serves the style (and usually the tiles). */
  mapStyleUrl?: string | undefined;
}

export function contentSecurityPolicy({ development, mapStyleUrl }: CspOptions): string {
  const maps = [...new Set([DEFAULT_MAP_ORIGIN, originOf(mapStyleUrl)].filter((origin): origin is string => origin !== null))];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : []), ...STRIPE.script, TURNSTILE],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...maps],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...STRIPE.connect, TURNSTILE, ...maps, ...(development ? ['ws:', 'wss:'] : [])],
    'frame-src': [...STRIPE.frame, TURNSTILE],
    'worker-src': ["'self'", 'blob:'],
    'child-src': ["'self'", 'blob:'],
    'media-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", ...SIGN_IN_PROVIDERS],
    'frame-ancestors': ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`);
  if (!development) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

/** Enforced in production; report-only in development, so a new host shows up in the console instead of breaking. */
export function cspHeaderName(development: boolean): 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only' {
  return development ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
}
