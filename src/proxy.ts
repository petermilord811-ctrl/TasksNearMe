import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';
import { routes } from '@/contracts';

/**
 * Optimistic check only: a visitor without a session cookie is sent to sign-in with a real
 * redirect before anything renders. The app layout still verifies the session itself, so a
 * stale or forged cookie gets no further than this. `/admin` is deliberately not matched:
 * it answers 404 to anyone who is not signed-in staff.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(new URL(routes.signIn(`${pathname}${search}`), request.url));
}

export const config = {
  matcher: ['/app/:path*'],
};
