/**
 * Which of Better Auth's HTTP endpoints (`/api/auth/*`) the internet may reach. The app signs in, links and signs
 * out through its own Server Actions (which add Turnstile, per-email and per-IP limits, the suspended-account
 * check, audit entries and notices) and calls Better Auth on the server (`auth.api.*`). From a browser, only the
 * providers' redirects back are needed: `/api/auth/callback/<provider>` (GET, or POST for a form post) and Better
 * Auth's error page. Everything else (sending and checking email codes, `update-user`, `unlink-account`, passkeys,
 * sessions) answers not found, so nobody can skip the app's checks by calling Better Auth directly.
 */
const ALLOWED = [/^\/callback\/[a-z][a-z0-9-]{0,30}$/, /^\/error$/];

export function authPathAllowed(pathname: string): boolean {
  if (!pathname.startsWith('/api/auth/')) return false;
  const rest = pathname.slice('/api/auth'.length).replace(/\/+$/, '');
  return ALLOWED.some((pattern) => pattern.test(rest));
}
