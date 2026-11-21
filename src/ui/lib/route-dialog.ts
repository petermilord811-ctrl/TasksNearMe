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
   * redirect: the person stays where they were.
   */
  finish: (result: ActionResult, message?: string) => void;
}

export const RouteDialogContext = createContext<RouteDialogControls | null>(null);

/** The route dialog this component is shown in, or null on a full page. */
export function useRouteDialog(): RouteDialogControls | null {
  return useContext(RouteDialogContext);
}
