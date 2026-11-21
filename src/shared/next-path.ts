import { routes } from '@/contracts';

/**
 * Where to go after signing in. Only same-site paths are allowed: anything else (other hosts,
 * protocol-relative "//", backslashes, or the sign-in page itself) falls back to the app home.
 */
export function safeNextPath(raw: string | null | undefined): string {
  const fallback = routes.app.home();
  if (!raw || typeof raw !== 'string') return fallback;
  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  // Control characters and whitespace in a path are never legitimate here.
  if (/[\s\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'http://localhost');
    if (url.origin !== 'http://localhost') return fallback;
    if (url.pathname === '/sign-in' || url.pathname === '/sign-up' || url.pathname.startsWith('/api/')) return fallback;
    // The parser resolves dot segments, so "/.//evil.example" or "/app/..//evil.example" comes out as "//evil.example",
    // which a browser reads as another host: check the path it returns, not only the one it was given.
    if (url.pathname.startsWith('//')) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
