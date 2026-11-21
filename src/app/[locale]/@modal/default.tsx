/**
 * The modal slot (src/app/[locale]/@modal): pages that open as a dialog over the page they're reached from. Nothing
 * when no dialog is open, which is every page loaded on its own.
 *
 * Deliberately no catch-all page here (the usual way to close such a dialog when a link inside it goes elsewhere): its
 * parameter is unknown when the build prerenders a page like /helpers/[handle], whose shell reads the pathname, so
 * those pages failed with a 500 (the e2e build, 2026-11-21). The dialog frame closes itself before following a link
 * instead (RouteDialogFrame).
 */
export default function NoDialog() {
  return null;
}
