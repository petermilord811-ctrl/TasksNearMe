import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';
import { routes } from '@/contracts';
import { DEFAULT_LOCALE } from '@/contracts/locale';
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS, pickLocale, splitLocalePath } from '@/shared/locale';
import { isLocalRequest } from '@/shared/local-request';

/**
 * Every page request passes here (API routes, Next's own files and anything with a file extension don't).
 *
 * Language. Pages live under the [locale] root segment (src/app/[locale]), but URLs carry no language:
 * /pricing is rewritten to /en/pricing or /es/pricing, from the device's choice (the NEXT_LOCALE cookie),
 * else the browser's languages, else English. An explicit /es/... URL (shareable, and what search engines
 * index for Spanish) is served as it is and becomes the device's choice; /en/... does the same and then
 * redirects to the plain URL, since English is the default.
 *
 * Sign-in. Optimistic check only: a visitor to /app without a session cookie is sent to sign-in with a
 * real redirect before anything renders. The app layout still verifies the session itself, so a stale
 * or forged cookie gets no further than this. `/admin` is deliberately not checked: it answers 404 to
 * anyone who is not signed-in staff.
 *
 * Development tools. `/dev/*` (sign in as anyone, the outbox of emailed codes, the provider stand-ins, the
 * test clock) answers only requests made on this machine: a dev server behind a public proxy says not found
 * to everyone else (src/shared/local-request.ts). Production builds have no `/dev` at all.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const explicit = splitLocalePath(pathname);
  const path = explicit?.path ?? pathname;
  if (isDevToolPath(path) && !isLocalRequest((name) => request.headers.get(name))) {
    return new NextResponse('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }

  let response: NextResponse;
  if (isAppPath(path) && !getSessionCookie(request)) {
    response = NextResponse.redirect(new URL(routes.signIn(`${path}${search}`), request.url));
  } else if (explicit?.locale === DEFAULT_LOCALE) {
    response = NextResponse.redirect(new URL(`${path}${search}`, request.url));
  } else if (explicit) {
    response = NextResponse.next();
  } else {
    const locale = pickLocale({ cookie: request.cookies.get(LOCALE_COOKIE)?.value, acceptLanguage: request.headers.get('accept-language') });
    response = NextResponse.rewrite(new URL(`/${locale}${pathname === '/' ? '' : pathname}${search}`, request.url));
  }
  if (explicit && request.cookies.get(LOCALE_COOKIE)?.value !== explicit.locale) {
    response.cookies.set(LOCALE_COOKIE, explicit.locale, LOCALE_COOKIE_OPTIONS);
  }
  return response;
}

function isDevToolPath(path: string): boolean {
  return path === '/dev' || path.startsWith('/dev/');
}

function isAppPath(path: string): boolean {
  return path === '/app' || path.startsWith('/app/');
}

export const config = {
  // Everything but API routes, Next's internals (/_next, /__nextjs…), the map worker and files with an
  // extension; and all of /app, where a route can have one (a booking's calendar.ics).
  matcher: ['/((?!api|_next|__next|_vercel|vendor|.*\\..*).*)', '/app/:path*'],
};
