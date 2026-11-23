'use client';

import { useWideRouteDialog } from '@/ui/lib/route-dialog';

/**
 * Shown in a route dialog, it makes the dialog as wide as a page's reading column while it's on screen (a task, an
 * offer: 2026-11-23); on a full page it does nothing. For screens that stay server components.
 */
export function WideRouteDialog() {
  useWideRouteDialog();
  return null;
}
