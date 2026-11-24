'use client';

import { Toaster } from '@/ui/primitives/sonner';
import { PushToasts } from './push-toasts';

/**
 * Where the toasts show, under the top bar while it's in view (owner, 2026-11-24: a toast over the bar covered its
 * buttons), and on top once the bar has scrolled away: the app bar and the public pages' bar publish their height on
 * <html>. Narrow screens get the full width, with a little less room.
 */
const BELOW_BAR = 'calc(max(var(--app-header-offset, 0px), var(--top-bar-offset, 0px)) + 0.75rem)';
const BELOW_BAR_PHONE = 'calc(max(var(--app-header-offset, 0px), var(--top-bar-offset, 0px)) + 0.5rem)';

/**
 * Mounted by the app; previews mount their own instance without changing the root layout. The styled toaster (rounded
 * cards, icons, a close button; no keyboard trap at the toasts: ToastTabGuard, 5.19), and pushes that arrive while a
 * page is in front shown as toasts too (PushToasts).
 */
export function AppToaster() {
  return <>
    <Toaster position="top-right" closeButton offset={{ top: BELOW_BAR }} mobileOffset={{ top: BELOW_BAR_PHONE }} />
    <PushToasts />
  </>;
}
