/**
 * The landing page's mark: the public shell lays out a page holding it as the landing, full width, with the footer's
 * landing links (CSS `:has()`; PublicShell's `variant`). Its own module, so a page that imports it doesn't take in the
 * shell (and its client messages) a second time.
 */
export function LandingPageMarker() {
  return <span hidden data-landing-page="" />;
}
