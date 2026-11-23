'use client';

import { createContext, useContext, useLayoutEffect } from 'react';
import type { ActionResult } from '@/contracts/actions';

/**
 * What a form needs from the route dialog it's shown in (src/app/[locale]/@modal): a page such as "Leave a review",
 * opened from inside the site, shows as a dialog over the page it was opened from, and its URL still opens the full
 * page when loaded directly (a link in an email, a refresh).
 */
export interface RouteDialogControls {
  /**
   * Back to the page the dialog opened over, as the browser's Back button does. `done`: what it was for is done (a
   * report sent), so it opens afresh next time instead of keeping its state for Forward.
   */
  close: (options?: { done?: boolean }) => void;
  /**
   * After a successful submit: the message as a toast (the dialog's own success line would vanish with it), the
   * dialog closed, and the page under it refreshed so it shows the change. Takes the place of the full page's
   * redirect: the person stays where they were. `follow`: the result is a page of its own (a new booking, the task a
   * request went to), so the dialog closes and that page opens instead. `action`: the toast offers a page instead of
   * going there (a request's task, 2026-11-23: nothing happens on it until the helper answers).
   */
  finish: (result: ActionResult, message?: string, options?: { follow?: boolean; action?: { label: string; href: string } }) => void;
  /**
   * While a payment is on its way or the bank's step is open, the dialog can't be closed (Escape, its X, a tap outside,
   * a link): closing it then would leave the booking's hold to run out. The browser's Back still can, as on the page.
   */
  setBusy: (busy: boolean) => void;
  /**
   * The dialog closed first, then `href` (2026-11-23): what a link inside the dialog does (the frame catches their
   * clicks), for code that goes somewhere after its own work (a notification marks itself read, an action answers with
   * a page). A page with a dialog version opens over the page underneath (the router would keep this dialog over a page
   * its slot has no route for); on wide screens a conversation, Help or New message opens in the chat window there.
   */
  follow: (href: string) => void;
}

export const RouteDialogContext = createContext<RouteDialogControls | null>(null);

/** The route dialog this component is shown in, or null on a full page. */
export function useRouteDialog(): RouteDialogControls | null {
  return useContext(RouteDialogContext);
}

/**
 * Links that go somewhere after their own work (a notification row marks itself read, then opens) carry this attribute:
 * the frame leaves their clicks to them, and they go through `follow`.
 */
export const OWN_NAVIGATION = 'data-own-navigation';

/** The frame's width, for a page that needs a reading column's room (a task, an offer). */
export const RouteDialogWidthContext = createContext<((wide: boolean) => void) | null>(null);

/** Shown in a route dialog, the dialog is as wide as a page's reading column while this component is on screen. */
export function useWideRouteDialog(): void {
  const setWide = useContext(RouteDialogWidthContext);
  useLayoutEffect(() => {
    if (!setWide) return;
    setWide(true);
    return () => setWide(false);
  }, [setWide]);
}
