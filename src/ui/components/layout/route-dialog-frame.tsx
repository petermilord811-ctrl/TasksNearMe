'use client';

import { Fragment, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { chatViewOfHref } from '@/shared/chat-links';
import { openInChatWindow } from '@/ui/lib/chat-window-open';
import { AUTH_PAGE } from '@/ui/lib/auth-page';
import { OWN_NAVIGATION, RouteDialogContext, RouteDialogWidthContext, useRouteDialog, type RouteDialogControls } from '@/ui/lib/route-dialog';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent } from '@/ui/primitives/dialog';
import { Skeleton } from '@/ui/primitives/skeleton';
import { RouteDialogBody, RouteDialogHeader } from './route-dialog';

/** Where the chat window docks (src/app/[locale]/(app)/app/_chat): a conversation opens there from 1024 px. */
const WIDE = '(min-width: 1024px)';

/**
 * The dialog that a page opens in when it's reached from inside the site (src/app/[locale]/@modal): "Leave a
 * review", "Report a problem", "Save this search" and the like show over the page they were opened from, which stays
 * where it was underneath. One frame for all of them; each page fills it with a `RouteDialogHeader` and a
 * `RouteDialogBody`. A sheet from the bottom on phones, a centered dialog from 640 px.
 *
 * Closing (the X, Escape, a tap outside, the form's Cancel) goes back, as the browser's Back button does, so the URL and
 * the history always say what's on screen. It fades and slides in without scaling, so nothing in it is ever drawn at a
 * fraction of its size (a 1 px screen-reader radio scaled to 95% lost its click point in the e2e run). The router keeps a closed dialog's screen hidden for Back and Forward; a
 * dialog that finished (its form was sent) starts afresh the next time it opens, one closed half-way keeps its draft.
 */
export function RouteDialogFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const feedback = useTranslations('feedback');
  // Effects run while the dialog is on screen and are cleaned up when the router hides it, so this says whether a
  // late result (a submit that ended after the dialog was closed) should still close it.
  const visible = useRef(false);
  const finished = useRef(false);
  const [generation, setGeneration] = useState(0);
  // A payment on its way: no closing but the browser's Back (RouteDialogControls.setBusy). The ref is for the controls,
  // which stay the same object.
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  // A task or an offer needs a reading column's room (useWideRouteDialog); the rest are a form's width.
  const [wide, setWide] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  // What opened the dialog (the link or button that navigated here), for focus to go back to: Radix's own return
  // goes to a Dialog.Trigger, and a route dialog has none.
  const opener = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    // Signing in goes on to where it was asked from with the router (a page kept in memory comes back as it was, J-N2),
    // and a page with a dialog version would open as a dialog over the sign-in page, with no page under it to close to
    // (2026-11-23: an email's link to a proposal or a receipt, through sign-in). It loads as its own page instead.
    if (document.querySelector(`[${AUTH_PAGE}]`)?.checkVisibility?.()) {
      window.location.replace(window.location.href);
      return;
    }
    visible.current = true;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body && !content.current?.contains(active) ? active : null;
    if (finished.current) {
      finished.current = false;
      // The router is showing a finished dialog again (React Activity): it starts afresh before it paints.
      setGeneration((value) => value + 1);
    }
    return () => {
      visible.current = false;
    };
  }, []);

  const controls = useMemo<RouteDialogControls>(() => ({
    close: (options) => {
      if (!visible.current) return;
      if (options?.done) finished.current = true;
      router.back();
    },
    finish: (result, message, options) => {
      const action = options?.action;
      if (result.ok) {
        const text = message ?? feedback(`success.${result.code}`);
        if (action) toast.success(text, { action: { label: action.label, onClick: () => router.push(action.href) } });
        else toast.success(text);
      }
      const next = options?.follow && result.ok ? result.redirectTo : undefined;
      if (!visible.current) {
        if (next) router.push(next);
        else router.refresh();
        return;
      }
      finished.current = true;
      // Once the page underneath is back (the one the router had before the dialog opened): open the result's own page
      // in place of the dialog's history entry, or refresh the page underneath when that is the result's page (paying
      // a booking from the booking itself, "Finish paying").
      window.addEventListener('popstate', () => {
        if (next && next !== `${window.location.pathname}${window.location.search}`) router.push(next);
        else router.refresh();
      }, { once: true });
      router.back();
    },
    setBusy: (value) => {
      busyRef.current = value;
      setBusyState(value);
    },
    // Close first, then the page: the router keeps the dialog's slot as it is on a page the slot has no route for, so
    // the dialog would stay over the new page (and a page with a dialog version opens over the page underneath). On wide
    // screens a conversation opens in the chat window over that page (2026-11-23), unless nothing there takes it.
    follow: (href) => {
      if (!visible.current || busyRef.current) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) {
        window.location.assign(url.href);
        return;
      }
      const path = `${url.pathname}${url.search}${url.hash}`;
      const chat = chatViewOfHref(path, window.location.origin) !== null && typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches;
      window.addEventListener('popstate', () => {
        if (chat && openInChatWindow(path)) return;
        router.push(path);
      }, { once: true });
      router.back();
    },
  }), [router, feedback]);

  // A link inside the dialog (Get help, Manage your saved searches, View change) closes the dialog first, then opens its
  // page (`follow`). A new tab, a download, another site or a place in the dialog itself is left to the browser; a link
  // that goes after its own work (OWN_NAVIGATION: a notification marks itself read) to its own click handler.
  const followLink = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self') || link.hasAttribute('download') || link.hasAttribute(OWN_NAVIGATION)) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
    event.preventDefault();
    controls.follow(`${url.pathname}${url.search}${url.hash}`);
  };

  return <RouteDialogContext.Provider value={controls}>
    <RouteDialogWidthContext.Provider value={setWide}>
    <Dialog open onOpenChange={(open) => { if (!open && !busy) controls.close(); }}>
      <DialogContent
        ref={content}
        data-route-dialog=""
        aria-busy={busy || undefined}
        showCloseButton={!busy}
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
        onInteractOutside={(event) => { if (busy) event.preventDefault(); }}
        onClickCapture={followLink}
        // The primitive's zoom (95%) is set to none here: it fades, and slides up from the bottom on phones.
        style={{ '--tw-enter-scale': 1, '--tw-exit-scale': 1 } as CSSProperties}
        // The dialog itself takes focus, so its title is read first and a phone's keyboard doesn't open over a field.
        onOpenAutoFocus={(event) => { event.preventDefault(); content.current?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
        }}
        className={cn('top-auto bottom-0 flex max-h-[92dvh] w-full max-w-full translate-y-0 flex-col gap-0 overflow-hidden rounded-b-none bg-background p-0 max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-bottom sm:top-1/2 sm:bottom-auto sm:max-h-[min(88dvh,60rem)] sm:max-w-xl sm:-translate-y-1/2 sm:rounded-[1.75rem] sm:p-0', wide && 'sm:max-w-2xl')}
      >
        <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-foreground/15 sm:hidden" />
        <Fragment key={generation}>{children}</Fragment>
      </DialogContent>
    </Dialog>
    </RouteDialogWidthContext.Provider>
  </RouteDialogContext.Provider>;
}

/** While the page's data arrives: the frame is already open, so the tap answers at once. */
export function RouteDialogLoading() {
  const t = useTranslations('common');
  return <>
    <RouteDialogHeader title={<><span className="sr-only">{t('loading')}</span><span aria-hidden="true" className="ui-shimmer block h-7 w-2/3 max-w-72 rounded-xl" /></>} />
    <RouteDialogBody className="space-y-4">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-32 w-full rounded-[1.375rem]" />
      <Skeleton className="h-11 w-40 rounded-full" />
    </RouteDialogBody>
  </>;
}

/** A dialog's page that isn't there, or isn't this person's (its notFound()). */
export function RouteDialogNotFound() {
  const t = useTranslations('notFound');
  const common = useTranslations('common');
  const dialog = useRouteDialog();
  return <>
    <RouteDialogHeader title={t('title')} description={t('appBody')} />
    <RouteDialogBody><Button type="button" variant="outline" onClick={() => dialog?.close()}>{common('close')}</Button></RouteDialogBody>
  </>;
}
