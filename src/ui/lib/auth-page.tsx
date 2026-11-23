/**
 * Marks the sign-in and sign-up pages and the in-app phone and ID steps: a route dialog that opens over one of them (as
 * signing in goes on to where it was asked from, 2026-11-23) loads as its own page instead (RouteDialogFrame). A plain
 * module, not a client one: server layouts and pages render the marker.
 */
export const AUTH_PAGE = 'data-auth-page';

/** The marker itself: nothing to see or hear, but on screen while its page is. */
export function AuthPageMarker() {
  return <span {...{ [AUTH_PAGE]: '' }} aria-hidden="true" className="sr-only" />;
}
