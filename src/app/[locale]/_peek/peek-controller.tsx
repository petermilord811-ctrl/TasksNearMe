'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { routes, type HelperPeekData, type HelpPeekData, type LegalPeekData, type PeekData, type PeekHandlers, type PeekTarget } from '@/contracts';
import { isSamePage, peekKey, peekTargetOfHref } from '@/shared/peek-links';
import { openInChatWindow } from '@/ui/lib/chat-window-open';
import { openAfterMenu } from '@/ui/lib/menus';
import type { PeekLoad, PeekPlacement } from '@/ui/components/peek/peek-sheet';

/** The sheet's code loads the first time something is peeked at: a page that mounts this carries only the listener. */
const PeekSheet = dynamic(() => import('@/ui/components/peek/peek-sheet').then((module) => module.PeekSheet), { ssr: false, loading: () => null });

const WIDE = '(min-width: 1024px)';

/** Everything a peek can show: signed-in pages open all of them; the help center's and policies' own pages, help and policies. */
const EVERY_KIND: readonly PeekTarget['kind'][] = ['helper', 'help', 'legal'];

/** Where a peek loads from, by its target (the page's language for help). */
function peekUrl(target: PeekTarget, locale: string): string {
  if (target.kind === 'helper') return `/api/peek/helpers/${encodeURIComponent(target.handle)}`;
  if (target.kind === 'legal') return `/api/peek/legal/${encodeURIComponent(target.doc)}`;
  return `${target.slug ? `/api/peek/help/${encodeURIComponent(target.slug)}` : '/api/peek/help'}?locale=${encodeURIComponent(locale)}`;
}

function asPeekData(target: PeekTarget, body: unknown): PeekData {
  if (target.kind === 'helper') return { kind: 'helper', data: body as HelperPeekData };
  if (target.kind === 'legal') return { kind: 'legal', data: body as LegalPeekData };
  return { kind: 'help', data: body as HelpPeekData };
}

/**
 * Peeks on every signed-in page (2026-11-23, owner: "I hate redirect … you have to show new window for showing helper
 * profile instead of redirect … From the help center 'What to pay for a task near you' button"): a plain click on a link
 * to a helper's profile, the help center, a help article or a legal document opens it in a sheet instead of leaving the
 * page, the chat window's and route dialogs' links included. The sheet sits beside the page on wide screens (on the left
 * while a chat window is open, so the conversation stays in view and in use) and comes up from the bottom on phones; over
 * a route dialog it's modal, as a dialog over a dialog. Links opened in a new tab or with a modifier key, downloads,
 * links that do their own navigating (`data-own-navigation`), breadcrumbs, and links to the page they're on go their way.
 * The help center's and policies' public pages mount it too, for help and policies (`kinds`): an article from the help
 * center opens beside it.
 */
export function PeekController({ handlers, kinds = EVERY_KIND }: { handlers?: PeekHandlers; kinds?: readonly PeekTarget['kind'][] }) {
  const router = useRouter();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [stack, setStack] = useState<PeekTarget[]>([]);
  const [layout, setLayout] = useState<{ placement: PeekPlacement; modal: boolean }>({ placement: 'right', modal: true });
  const [load, setLoad] = useState<PeekLoad>({ status: 'idle' });
  const target = stack.at(-1) ?? null;
  const key = target ? peekKey(target) : '';

  // The latest ask wins: an answer to an earlier one that comes back late is dropped.
  const turn = useRef(0);
  const fetchPeek = useCallback(async (next: PeekTarget) => {
    const mine = ++turn.current;
    setLoad({ status: 'loading' });
    try {
      const response = await fetch(peekUrl(next, locale), { credentials: 'same-origin' });
      if (mine !== turn.current) return;
      if (response.status === 404) {
        setLoad({ status: 'error', notFound: true });
        return;
      }
      if (!response.ok) throw new Error(`peek ${response.status}`);
      const body: unknown = await response.json();
      if (mine === turn.current) setLoad({ status: 'ready', data: asPeekData(next, body) });
    } catch {
      if (mine === turn.current) setLoad({ status: 'error' });
    }
  }, [locale]);

  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });
  // Each target once, as it comes up (next tick: a quick run of clicks loads only the last).
  useEffect(() => {
    if (!open || !key) return;
    const current = targetRef.current;
    if (!current) return;
    const timer = setTimeout(() => void fetchPeek(current), 0);
    return () => clearTimeout(timer);
  }, [open, key, fetchPeek]);

  const show = useCallback((next: PeekTarget, fresh: boolean) => {
    if (fresh) {
      const wide = window.matchMedia(WIDE).matches;
      const chatOpen = Boolean(document.querySelector('[data-chat-window="open"], [data-chat-docked="open"]'));
      const overDialog = Boolean(document.querySelector('[data-route-dialog]'));
      setLayout({ placement: wide ? (chatOpen ? 'left' : 'right') : 'bottom', modal: !wide || overDialog });
      // Never the last peek's words while this one loads.
      turn.current += 1;
      setLoad({ status: 'loading' });
    }
    setStack((current) => (fresh ? [next] : current.length > 0 && peekKey(current.at(-1)!) === peekKey(next) ? current : [...current, next]));
    setOpen(true);
  }, []);

  const openRef = useRef(open);
  const kindsRef = useRef(kinds);
  useEffect(() => {
    openRef.current = open;
    kindsRef.current = kinds;
  });

  // A plain click on a peekable link, anywhere: the sheet instead of the page. Inside the sheet it opens in the sheet
  // (Back returns), elsewhere it starts afresh.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor || anchor.hasAttribute('download') || anchor.getAttribute('target') === '_blank' || anchor.closest('[data-own-navigation], [data-slot="breadcrumb"]')) return;
      const href = anchor.getAttribute('href') ?? '';
      const next = peekTargetOfHref(href, window.location.origin);
      if (!next || !kindsRef.current.includes(next.kind) || isSamePage(href, window.location.href)) return;
      event.preventDefault();
      // The page's own handlers never see it (some navigate after their own work). A menu it was in closes first: Radix
      // skips its own select on a prevented click (2026-11-23: a conversation's View profile left its menu open).
      event.stopPropagation();
      const fresh = !(openRef.current && anchor.closest('[data-peek-sheet]'));
      openAfterMenu(anchor, () => show(next, fresh));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [show]);

  // Closed, it stays mounted with what it showed, so it slides away; the next peek starts afresh.
  const close = (next: boolean) => {
    setOpen(next);
    if (!next) turn.current += 1;
  };

  if (!open && stack.length === 0) return null;
  return <PeekSheet
    open={open}
    onOpenChange={close}
    target={target}
    load={load}
    placement={layout.placement}
    modal={layout.modal}
    canGoBack={stack.length > 1}
    onBack={() => setStack((current) => current.slice(0, -1))}
    onShow={(next) => show(next, false)}
    onRetry={() => {
      if (target) void fetchPeek(target);
    }}
    onMessage={(handle) => {
      close(false);
      // On wide screens the chat window takes it; on phones, New message opens as a dialog over the page.
      const href = routes.app.newMessage({ helper: handle });
      if (!openInChatWindow(href)) router.push(href);
    }}
    onRequest={(handle) => {
      close(false);
      // The request opens as a dialog over the page (its route dialog).
      router.push(routes.app.requestHelper(handle));
    }}
    onToggleSaved={async (helperId, saved) => {
      if (!handlers) return false;
      try {
        return (await handlers.onToggleSaved({ helperId, saved })).ok;
      } catch {
        return false;
      }
    }}
  />;
}
