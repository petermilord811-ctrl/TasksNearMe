import 'server-only';
import { cookies, headers } from 'next/headers';

/**
 * Request headers for Better Auth, with the Cookie header rebuilt from the current cookie jar.
 * `headers()` keeps the cookies the request arrived with, while `cookies()` also reflects cookies
 * set earlier in the same Server Action (e.g. the session cookie right after sign-in), so the
 * re-render after `refresh()` sees the new session.
 */
export async function authRequestHeaders(): Promise<Headers> {
  const [incoming, jar] = await Promise.all([headers(), cookies()]);
  const merged = new Headers(incoming);
  const cookieHeader = jar.toString();
  if (cookieHeader) merged.set('cookie', cookieHeader);
  else merged.delete('cookie');
  return merged;
}
