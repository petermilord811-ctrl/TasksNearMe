import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';
import { routes } from '@/contracts';
import { DEFAULT_LOCALE, isAppLocale } from '@/contracts/locale';
import { isSamplePage } from '@/modules/seo/sample-pages';
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS, localizedPath, negotiateLocale, splitLocalePath } from '@/shared/locale';
import { isLocalRequest } from '@/shared/local-request';
import { contentSecurityPolicy, cspHeaderName } from '@/shared/csp';
import { E2E_BUILD } from '@/shared/dev-helpers';
import { samplesHiddenInThisBuild } from '@/shared/sample-data';
import { robotsHeaderFor, searchIndexing } from '@/shared/search-indexing';
import { taskHubRedirect } from '@/shared/task-hub';

/**
 * Where a sample page is answered from: four segments, which no route but the catch-all (src/app/[locale]/(public)/
 * [...missing]) matches, and it calls notFound() before anything streams.
 */
const SAMPLE_PAGE_GONE = '/gone/sample/only/page';

/**
 * Every page request passes here (API routes, Next's own files and anything with a file extension don't).
 *
 * Language. Pages live under the [locale] root segment (src/app/[locale]), but URLs carry no language for English:
 * /pricing is rewritten to /en/pricing, or to /es/pricing once the device has chosen Spanish (the NEXT_LOCALE
 * cookie). A first visit from a browser set to Spanish, with no choice yet, is sent to the Spanish address
 * (/es/pricing) with a temporary redirect: a plain URL only ever shows English or the device's own choice, so search
 * engines (no cookies) always read English there, with its own canonical (docs/seo/PLAN.md §11). An explicit /es/... URL
 * (shareable, and what search engines index for Spanish) is served as it is and, opened as a page, becomes the device's
 * choice; /en/... does the same and then redirects to the plain URL, since English is the default. The router's
 * prefetches of /es links never change the choice.
 *
 * Sign-in. Optimistic check only: a visitor to /app without a session cookie is sent to sign-in with a
 * real redirect before anything renders. The app layout still verifies the session itself, so a stale
 * or forged cookie gets no further than this. `/admin` is deliberately not checked: it answers 404 to
 * anyone who is not signed-in staff.
 *
 * Sample pages. Where samples are hidden from the public (src/shared/sample-data.ts), a demo city's pages, a sample
 * task and a sample helper's profile answer a real 404 to a request without a session (src/modules/seo/sample-pages.ts);
 * signed-in testers still see them.
 *
 * Job hubs. A market's board filtered on one category (`/austin/tasks?category=moving-help`) is that category's job
 * hub, `/austin/tasks/moving-help` (src/shared/task-hub.ts): a permanent redirect keeps one address per page.
 *
 * Development tools. `/dev/*` (sign in as anyone, the outbox of emailed codes, the provider stand-ins, the
 * test clock) answers only requests made on this machine: a dev server behind a public proxy says not found
 * to everyone else (src/shared/local-request.ts). Production builds have no `/dev` at all, apart from the e2e
 * build (src/shared/dev-helpers.ts), which answers not found to every page request from elsewhere.
 */
export async function proxy(request: NextRequest) {
  if (E2E_BUILD && !isLocalRequest((name) => request.headers.get(name))) {
    return new NextResponse('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const { pathname, search } = request.nextUrl;
  const explicit = splitLocalePath(pathname);
  const path = explicit?.path ?? pathname;
  if (isDevToolPath(path) && !isLocalRequest((name) => request.headers.get(name))) {
    return new NextResponse('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  // A page load, not the router's own fetches (prefetches, client navigations and actions say Sec-Fetch-Mode "cors";
  // Next hides its RSC headers from the proxy).
  const pageLoad = (request.headers.get('sec-fetch-mode') ?? 'navigate') === 'navigate';
  const chosen = request.cookies.get(LOCALE_COOKIE)?.value;
  const signedIn = Boolean(getSessionCookie(request));

  let response: NextResponse;
  const hub = taskHubRedirect(path, request.nextUrl.searchParams);
  if (hub) {
    response = NextResponse.redirect(new URL(explicit ? localizedPath(hub, explicit.locale) : hub, request.url), 308);
  } else if (isAppPath(path) && !signedIn) {
    response = NextResponse.redirect(new URL(routes.signIn(`${path}${search}`), request.url));
  } else if (explicit?.locale === DEFAULT_LOCALE) {
    // English has no prefix, for good: a permanent redirect, so search engines keep the plain address (with a 307,
    // Google kept /en/become-a-helper as a page of its own; every page's language switch links to its /en/ copy).
    // Never stored by browsers: this response also makes English the device's choice (below), and a cached redirect
    // would skip that the next time someone switches back from Spanish.
    response = NextResponse.redirect(new URL(`${path}${search}`, request.url), 308);
    response.headers.set('Cache-Control', 'no-store');
  } else if (!signedIn && isReadRequest(request) && samplesHiddenInThisBuild() && (await isSamplePage(path))) {
    // The site's not-found page, with a real 404, in the visitor's language (no page of this address is indexable).
    const locale = explicit?.locale ?? (isAppLocale(chosen) ? chosen : negotiateLocale(request.headers.get('accept-language')));
    response = NextResponse.rewrite(new URL(`/${locale}${SAMPLE_PAGE_GONE}`, request.url));
  } else if (explicit) {
    response = NextResponse.next();
  } else if (isAppLocale(chosen)) {
    response = NextResponse.rewrite(new URL(`/${chosen}${pathname === '/' ? '' : pathname}${search}`, request.url));
  } else {
    const browser = negotiateLocale(request.headers.get('accept-language'));
    response =
      pageLoad && browser !== DEFAULT_LOCALE
        ? // Temporary: it depends on the visitor. The Spanish page makes Spanish this device's choice when it loads.
          NextResponse.redirect(new URL(`${localizedPath(path, browser)}${search}`, request.url), 307)
        : NextResponse.rewrite(new URL(`/${DEFAULT_LOCALE}${pathname === '/' ? '' : pathname}${search}`, request.url));
  }
  // An explicit-language page load becomes this device's choice, but not the router's own fetches: Spanish pages
  // prefetch their /es links (LocaleLink), and a late prefetch would undo a switch to English made a moment before.
  if (explicit && pageLoad && chosen !== explicit.locale) {
    response.cookies.set(LOCALE_COOKIE, explicit.locale, LOCALE_COOKIE_OPTIONS);
  }
  // The Content Security Policy for every page (src/shared/csp.ts): enforced in production, reported in development.
  const development = process.env.NODE_ENV !== 'production';
  response.headers.set(cspHeaderName(development), contentSecurityPolicy({ development, mapStyleUrl: process.env.MAP_STYLE_URL, plainHttp: E2E_BUILD }));
  // Search engines (src/shared/search-indexing.ts): only the live site is indexed, its listings only in the `on` mode,
  // and signed-in and staff pages never, whatever their own metadata says.
  const robots = robotsHeaderFor(searchIndexing(), path);
  if (robots) response.headers.set('X-Robots-Tag', robots);
  return response;
}

function isReadRequest(request: NextRequest): boolean {
  return request.method === 'GET' || request.method === 'HEAD';
}

function isDevToolPath(path: string): boolean {
  return path === '/dev' || path.startsWith('/dev/');
}

function isAppPath(path: string): boolean {
  return path === '/app' || path.startsWith('/app/');
}

export const config = {
  // Everything but API routes, text messages' short links (/n/<code>, outside [locale]: no language rewrite or
  // sample-page lookup, messages pass J-M9), Next's internals (/_next, /__nextjs…), the map worker and files with an
  // extension; and all of /app, where a route can have one (a booking's calendar.ics).
  matcher: ['/((?!api|n/|_next|__next|_vercel|vendor|.*\\..*).*)', '/app/:path*'],
};
