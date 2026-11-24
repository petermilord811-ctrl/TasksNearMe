'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { MessagesSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts/routes';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useKeyboardOpen } from '@/ui/lib/use-keyboard-open';
import { cn } from '@/ui/lib/utils';

export interface ChatLauncherProps {
  unread: number;
  /** The window is open or minimized (wide screens): the button steps aside for it. */
  windowShown: boolean;
  /** Nowhere: the page is Messages itself. */
  hidden?: boolean;
  /** Not on phones: a step-by-step or detail page whose own bar owns the bottom of the screen. */
  hiddenOnPhones?: boolean;
  /** Changes with the page, so the button looks again for a bar it should rise above. */
  routeKey?: string;
  onOpen(): void;
}

const SIZE = 56;
const EDGE = 24;

/**
 * How far the wide-screen button rises above a bar pinned to the bottom of the page (the booking, task and offer pages'
 * actions, a form's footer: anything that sits on `bottom-app-navigation`) when that bar is under it. Measured on the
 * button's own corner, never through a variable on the shell.
 */
function useTrayLift(enabled: boolean, button: RefObject<HTMLButtonElement | null>, routeKey: string | undefined): number {
  const [lift, setLift] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const self = button.current;
        if (!self) return;
        const height = window.innerHeight;
        const right = window.innerWidth - EDGE;
        const left = right - SIZE;
        const bottom = height - EDGE;
        const top = bottom - SIZE;
        let next = 0;
        for (const tray of document.querySelectorAll<HTMLElement>('.bottom-app-navigation')) {
          if (tray.closest('[data-chat-window]')) continue;
          const box = tray.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          if (box.left < right + 8 && box.right > left - 8 && box.top < bottom + 8 && box.bottom > top - 8) next = Math.max(next, height - box.top + 12 - EDGE);
        }
        setLift((current) => (Math.abs(current - next) < 1 ? current : Math.max(0, Math.round(next))));
      });
    };
    measure();
    // A page streams in after its address changes: look again a few times.
    const timers = [150, 600, 1500].map((ms) => window.setTimeout(measure, ms));
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [enabled, button, routeKey]);
  return enabled ? lift : 0;
}

/** Past this many pixels from the top, scrolling down puts the phone's button aside. */
const AWAY_FROM_TOP = 96;
/** How far a scroll must go, down or back up, before the button moves. */
const DOWN_SLOP = 24;
const UP_SLOP = 8;

/**
 * True while the page is being scrolled down (phones' floating button steps aside, as floating buttons do), false again
 * on any scroll up or near the top. Off (false) when `on` is false.
 */
function useScrollingDown(on: boolean, routeKey: string | undefined): boolean {
  // The page it went aside on: a new page shows it again, whatever was scrolled before.
  const [awayOn, setAwayOn] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    const page = routeKey ?? '';
    let last = window.scrollY;
    let pending = false;
    const read = () => {
      pending = false;
      const y = window.scrollY;
      if (y < AWAY_FROM_TOP) {
        setAwayOn(null);
        last = y;
      } else if (y - last > DOWN_SLOP) {
        setAwayOn(page);
        last = y;
      } else if (last - y > UP_SLOP) {
        setAwayOn(null);
        last = y;
      }
    };
    // Once a frame at most (a timeout where frames aren't drawn, as in tests).
    const schedule = typeof window.requestAnimationFrame === 'function' ? (run: () => void) => window.requestAnimationFrame(run) : (run: () => void) => window.setTimeout(run, 16);
    const onScroll = () => {
      if (pending) return;
      pending = true;
      schedule(read);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [on, routeKey]);
  return on && awayOn !== null && awayOn === (routeKey ?? '');
}

/**
 * Messages, as a round button fixed at the bottom right of every signed-in page (2026-11-22, owner: "Reddit similar
 * chat, right bottom fixed chat icon"), with the unread count. Wide screens: a button that opens the chat window. Phones:
 * a link to the Messages page, floating just above the tab dock; it steps aside while the keyboard is up, while the page
 * scrolls down (sweep 2026-11-24: it sat over prices, titles and form fields at the right of every list), and on pages
 * whose own bar owns the bottom of the screen. It's back on any scroll up, and near the top.
 */
export function ChatLauncher({ unread, windowShown, hidden = false, hiddenOnPhones = false, routeKey, onOpen }: ChatLauncherProps) {
  const t = useTranslations('chat.launcher');
  const typing = useKeyboardOpen();
  const away = useScrollingDown(!hidden && !hiddenOnPhones, routeKey);
  const stepAside = typing || away;
  const own = useRef<HTMLButtonElement | null>(null);
  const lift = useTrayLift(!hidden && !windowShown, own, routeKey);
  if (hidden) return null;
  const label = unread > 0 ? t('labelUnread', { count: unread }) : t('label');
  const badge = unread > 0 && <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-5 rounded-full bg-foreground px-1.5 text-center text-[0.6875rem] leading-5 font-semibold text-background tabular-nums ring-2 ring-background">{unread > 99 ? '99+' : unread}</span>;
  const look = 'group relative inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_28px_-10px_rgb(60_25_5/0.65),0_2px_6px_rgb(23_18_14/0.18)] transition-[transform,box-shadow,background-color] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-12px_rgb(60_25_5/0.7),0_3px_8px_rgb(23_18_14/0.2)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:shadow-[0_12px_30px_-10px_rgb(0_0_0/0.85)]';
  const icon = <MessagesSquare aria-hidden="true" className="size-6 transition-transform duration-200 ease-[var(--ease-out)] group-hover:scale-105 motion-reduce:transition-none" />;
  return <>
    {!hiddenOnPhones && <Link href={routes.app.messages()} aria-label={label} data-chat-launcher="phone" className={cn(look, 'fixed right-4 bottom-[calc(var(--app-bottom-offset,0px)+0.75rem)] z-30 lg:hidden', stepAside && 'pointer-events-none translate-y-4 opacity-0')} {...(stepAside ? { tabIndex: -1, 'aria-hidden': true } : {})}>
      {icon}{badge}
    </Link>}
    {!windowShown && <button ref={own} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={false} data-chat-launcher="window" onClick={onOpen} style={{ bottom: `${EDGE + lift}px` }} title={t('label')} className={cn(look, 'fixed right-6 z-40 hidden transition-[bottom,transform,box-shadow,background-color] lg:inline-flex')}>
      {icon}{badge}
    </button>}
  </>;
}
