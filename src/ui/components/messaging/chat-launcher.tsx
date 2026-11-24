'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { MessagesSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/ui/lib/utils';

export interface ChatLauncherProps {
  unread: number;
  /** The window is open or minimized (wide screens): the button steps aside for it. */
  windowShown: boolean;
  /** Nowhere: the page is Messages itself. */
  hidden?: boolean;
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

/**
 * Messages on wide screens, as a round button fixed at the bottom right of every signed-in page (2026-11-22, owner:
 * "Reddit similar chat, right bottom fixed chat icon"), with the unread count: it opens the chat window. Phones and
 * tablets have Messages in the top bar instead (owner, 2026-11-24: "add message button on appbar … remove app sticky
 * button"), so nothing floats over a phone's page.
 */
export function ChatLauncher({ unread, windowShown, hidden = false, routeKey, onOpen }: ChatLauncherProps) {
  const t = useTranslations('chat.launcher');
  const own = useRef<HTMLButtonElement | null>(null);
  const lift = useTrayLift(!hidden && !windowShown, own, routeKey);
  if (hidden) return null;
  const label = unread > 0 ? t('labelUnread', { count: unread }) : t('label');
  const badge = unread > 0 && <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-5 rounded-full bg-foreground px-1.5 text-center text-[0.6875rem] leading-5 font-semibold text-background tabular-nums ring-2 ring-background">{unread > 99 ? '99+' : unread}</span>;
  const look = 'group relative inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_28px_-10px_rgb(60_25_5/0.65),0_2px_6px_rgb(23_18_14/0.18)] transition-[transform,box-shadow,background-color] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-12px_rgb(60_25_5/0.7),0_3px_8px_rgb(23_18_14/0.2)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:shadow-[0_12px_30px_-10px_rgb(0_0_0/0.85)]';
  const icon = <MessagesSquare aria-hidden="true" className="size-6 transition-transform duration-200 ease-[var(--ease-out)] group-hover:scale-105 motion-reduce:transition-none" />;
  if (windowShown) return null;
  return <button ref={own} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={false} data-chat-launcher="window" onClick={onOpen} style={{ bottom: `${EDGE + lift}px` }} title={t('label')} className={cn(look, 'fixed right-6 z-40 hidden transition-[bottom,transform,box-shadow,background-color] lg:inline-flex')}>
    {icon}{badge}
  </button>;
}
