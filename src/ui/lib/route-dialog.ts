'use client';

import { createContext, useContext } from 'react';
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
}

export const RouteDialogContext = createContext<RouteDialogControls | null>(null);

/** The route dialog this component is shown in, or null on a full page. */
export function useRouteDialog(): RouteDialogControls | null {
  return useContext(RouteDialogContext);
}
