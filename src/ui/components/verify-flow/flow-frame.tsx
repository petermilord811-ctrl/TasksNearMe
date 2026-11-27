'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, LazyMotion, domAnimation, m, type Variants } from 'motion/react';
import { ChevronLeft, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePrefersReducedMotion } from '@/ui/motion/use-reduced-motion';
import { cn } from '@/ui/lib/utils';
import { DialogTitle } from '@/ui/primitives/dialog';

/**
 * The frame every verification flow runs in (owner, 2026-11-27: "should look same as Persona. simple and tidy and
 * clear … clear & natural animation + clear output"): a back arrow, a thin progress line, one screen at a time that
 * slides in from the side it came from, and the screen's one main action pinned at the bottom.
 *
 * `variant`: `dialog` fills a route dialog (the dialog draws the close button and the phone's handle; the flow's name is
 * its accessible title), `page` is its own card centered on the page (a check's page loaded directly).
 */
export interface FlowFrameProps {
  variant: 'dialog' | 'page';
  /** The flow's name: the dialog's title (read first), the page card's label. */
  title: string;
  /** The screen on show: a new one slides in. */
  screen: string;
  /** 1: forward (from the right); -1: back (from the left). */
  direction: 1 | -1;
  /** 0 to 1, the line under the header; absent on screens outside the steps (a result). */
  progress?: number;
  onBack?: () => void;
  /** The page card's close (a dialog closes itself). */
  onClose?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/** A screen comes in from its side and fades; the one before leaves a little the other way, quicker. `offset` 0: a fade. */
const screenMotion: Variants = {
  enter: (offset: number) => ({ opacity: 0, x: offset }),
  center: (offset: number) => ({ opacity: 1, x: 0, transition: { duration: offset === 0 ? 0.12 : 0.28, ease: [0.22, 1, 0.36, 1] } }),
  exit: (offset: number) => ({ opacity: 0, x: -offset * 0.6, transition: { duration: offset === 0 ? 0.08 : 0.14, ease: [0.65, 0, 0.35, 1] } }),
};

export function FlowFrame({ variant, title, screen, direction, progress, onBack, onClose, footer, children }: FlowFrameProps) {
  const t = useTranslations('verifyFlow.frame');
  const reduced = usePrefersReducedMotion();
  const offset = reduced ? 0 : 28 * direction;
  const body = useRef<HTMLDivElement>(null);
  // A new screen starts at its top (the last one may have been scrolled).
  useEffect(() => {
    body.current?.scrollTo?.({ top: 0 });
  }, [screen]);
  const dialog = variant === 'dialog';
  return <section
    aria-label={dialog ? undefined : title}
    className={cn(
      'flex min-h-0 flex-col bg-card',
      dialog ? 'flex-1' : 'mx-auto w-full max-w-[30rem] overflow-hidden rounded-[1.75rem] border shadow-card max-sm:min-h-[calc(100dvh-var(--app-bottom-offset,0px)-7rem)] max-sm:rounded-none max-sm:border-x-0',
    )}
  >
    {dialog && <DialogTitle className="sr-only">{title}</DialogTitle>}
    <header className={cn('grid shrink-0 grid-cols-[3rem_1fr_3rem] items-center px-2', dialog ? 'h-14 pr-14 sm:pr-14' : 'h-14')}>
      {onBack
        ? <button type="button" onClick={onBack} className="flex size-11 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <ChevronLeft aria-hidden="true" className="size-5" /><span className="sr-only">{t('back')}</span>
        </button>
        : <span />}
      <div aria-hidden={progress === undefined} className="flex justify-center px-2">
        {progress !== undefined && <div role="progressbar" aria-label={t('progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-1 w-full max-w-40 overflow-hidden rounded-full bg-foreground/[0.08]">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[var(--ease-out)]" style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }} />
        </div>}
      </div>
      {!dialog && onClose
        ? <button type="button" onClick={onClose} className="flex size-11 items-center justify-center justify-self-end rounded-full text-foreground/70 transition-colors hover:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <X aria-hidden="true" className="size-5" /><span className="sr-only">{t('close')}</span>
        </button>
        : <span />}
    </header>
    <div ref={body} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pt-2 pb-6 sm:px-8">
      <LazyMotion features={domAnimation}>
        {/* The leaving screen reads the new direction through `custom`, so both move the same way. */}
        <AnimatePresence mode="wait" initial={false} custom={offset}>
          <m.div key={screen} custom={offset} variants={screenMotion} initial="enter" animate="center" exit="exit">
            {children}
          </m.div>
        </AnimatePresence>
      </LazyMotion>
    </div>
    {footer && <footer className="shrink-0 space-y-2 border-t border-foreground/[0.06] bg-card px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8">{footer}</footer>}
  </section>;
}

/** A screen's heading: focused when the screen opens, so a screen reader says where it is. */
export function FlowHeading({ children, description, icon }: { children: ReactNode; description?: ReactNode; icon?: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return <div className="space-y-2 pt-2 pb-6 text-center">
    {icon && <div className="mb-5 flex justify-center">{icon}</div>}
    <h2 ref={ref} tabIndex={-1} className="font-display text-[1.375rem] leading-tight font-semibold tracking-[-0.02em] text-balance outline-none">{children}</h2>
    {description && <p className="mx-auto max-w-[22rem] text-[0.9375rem] leading-6 text-pretty text-muted-foreground">{description}</p>}
  </div>;
}

/** The round soft badge an intro or result screen leads with. */
export function FlowIcon({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'success' | 'info' | 'warning' | 'danger' }) {
  const tones = {
    brand: 'bg-brand-soft text-primary',
    success: 'bg-badge-success text-badge-success-foreground',
    info: 'bg-badge-info text-badge-info-foreground',
    warning: 'bg-badge-warning text-badge-warning-foreground',
    danger: 'bg-destructive/10 text-destructive',
  } as const;
  return <span aria-hidden="true" className={cn('flex size-16 items-center justify-center rounded-full [&_svg]:size-7', tones[tone])}>{children}</span>;
}

/** A row that picks something and moves on (an ID type, a kind of document), as Persona lists them. */
export function FlowChoice({ icon, label, hint, onClick, selected }: { icon: ReactNode; label: string; hint?: string; onClick: () => void; selected?: boolean }) {
  return <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={cn(
      'group flex min-h-16 w-full items-center gap-4 rounded-2xl border bg-card px-4 py-3 text-left transition-[border-color,background-color,transform] duration-200 ease-[var(--ease-out)] hover:border-foreground/25 hover:bg-foreground/[0.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.99]',
      selected && 'border-primary bg-brand-soft/60',
    )}
  >
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground/80 [&_svg]:size-5">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{label}</span>
      {hint && <span className="block text-sm text-muted-foreground">{hint}</span>}
    </span>
    <ChevronLeft aria-hidden="true" className="size-5 rotate-180 text-foreground/40 transition-transform duration-200 group-hover:translate-x-0.5" />
  </button>;
}
