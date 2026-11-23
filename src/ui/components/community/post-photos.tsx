'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Photo } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';

/** The frame a lone photo and each carousel photo fill: 4:3 on a phone, 16:10 wider, never taller than a card can spare. */
const FRAME = 'aspect-[4/3] max-h-72 w-full sm:aspect-[16/10] sm:max-h-80';
const FRAMED = 'overflow-hidden rounded-2xl border border-foreground/[0.07] dark:border-white/[0.06]';
const TILE = 'group/photo relative block min-h-11 overflow-hidden bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';
/** The carousel's arrows: with a mouse they show while it's hovered, with the keyboard while focused; a phone swipes. */
const ARROW = 'group/arrow absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full opacity-0 transition-opacity duration-200 group-hover/carousel:opacity-100 focus-visible:opacity-100 focus-visible:outline-none pointer-coarse:hidden motion-reduce:transition-none';
const ARROW_DISC = 'grid size-8 place-items-center rounded-full bg-card/90 text-foreground shadow-md ring-1 ring-black/5 backdrop-blur-sm transition-transform duration-200 group-hover/arrow:scale-105 group-focus-visible/arrow:outline-2 group-focus-visible/arrow:outline-offset-2 group-focus-visible/arrow:outline-ring motion-reduce:transition-none dark:ring-white/10';

const scrollBehavior = (): ScrollBehavior => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth');

/**
 * A post's photos (plan 10.1). One fills the card's width. Two or more make a carousel (owner, 2026-11-23: "show as
 * carousel"): one photo at a time in the same frame, swiped on a phone (each swipe stops at the next photo), stepped with
 * arrows (shown on hover with a mouse, and on keyboard focus) or the keyboard's left and right, with a "1/3" counter and
 * dots for where you are. Each photo opens the viewer, which steps through them too; closing it leaves the carousel on
 * the photo last seen. `compact` (a reply) shows its one photo smaller.
 */
export function PostPhotos({ photos, label, compact = false, eager = false }: { photos: Photo[]; label: string; compact?: boolean; eager?: boolean }) {
  const t = useTranslations('community.photos');
  const [open, setOpen] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [near, setNear] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const previousArrow = useRef<HTMLButtonElement>(null);
  const nextArrow = useRef<HTMLButtonElement>(null);
  /** Where a step is headed while its scroll is still on the way, so quick steps add up. */
  const heading = useRef<number | null>(null);
  /** The photo the viewer was on when it closed: focus goes back to it, not to the photo that opened the viewer. */
  const returnTo = useRef<number | null>(null);
  const lone = useRef<HTMLButtonElement>(null);
  const shown = photos.slice(0, compact ? 1 : 4);
  const count = shown.length;
  const carousel = count > 1;
  const current = Math.min(index, Math.max(count - 1, 0));

  // The photos beside the one showing load once the carousel nears the screen, so a swipe never lands on a blank.
  useEffect(() => {
    const node = group.current;
    if (!carousel || near || !node) return;
    if (typeof IntersectionObserver === 'undefined') {
      const timer = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true);
    }, { rootMargin: '400px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [carousel, near]);

  if (count === 0) return null;
  const altOf = (photo: Photo, at: number) => photo.alt || t('alt', { number: at + 1, count, label });
  const picture = (photo: Photo, at: number, loading: 'eager' | 'lazy') => <Image
    unoptimized
    src={photo.src}
    alt={altOf(photo, at)}
    width={photo.width}
    height={photo.height}
    loading={loading}
    draggable={false}
    className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover/photo:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover/photo:scale-100"
  />;

  const slideButton = (at: number) => scroller.current?.querySelectorAll<HTMLButtonElement>('[data-slide]')[at] ?? null;
  /** Which photo the carousel shows, from how far it has scrolled (a swipe, an arrow, the keyboard, a focused photo). */
  const settle = () => {
    const node = scroller.current;
    if (!node || node.clientWidth === 0) return;
    if (heading.current !== null && Math.abs(node.scrollLeft - heading.current * node.clientWidth) < 2) heading.current = null;
    setIndex(Math.min(count - 1, Math.max(0, Math.round(node.scrollLeft / node.clientWidth))));
  };
  const go = (to: number, { focus = false, behavior = scrollBehavior() }: { focus?: boolean; behavior?: ScrollBehavior } = {}) => {
    const node = scroller.current;
    if (!node) return;
    const target = Math.min(count - 1, Math.max(0, to));
    heading.current = target;
    // There's no arrow before the first photo or after the last: one that's about to go hands its focus to the photo.
    const leaving = (target === 0 && document.activeElement === previousArrow.current) || (target === count - 1 && document.activeElement === nextArrow.current);
    if (focus || leaving) slideButton(target)?.focus({ preventScroll: true });
    const left = target * node.clientWidth;
    if (typeof node.scrollTo === 'function') node.scrollTo({ left, behavior });
    else node.scrollLeft = left;
  };
  const step = (by: number, focus = false) => go((heading.current ?? current) + by, { focus });
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    step(event.key === 'ArrowRight' ? 1 : -1, event.target instanceof HTMLElement && event.target.hasAttribute('data-slide'));
  };

  const photosView = !carousel
    ? <div className={cn(FRAMED, compact && 'max-w-64')}>
        <button ref={lone} type="button" onClick={() => setOpen(0)} aria-label={t('open', { number: 1, count })} className={cn(TILE, compact ? 'aspect-4/3 w-full' : FRAME)}>
          {picture(shown[0]!, 0, eager && !compact ? 'eager' : 'lazy')}
        </button>
      </div>
    : <div
        ref={group}
        role="group"
        aria-roledescription={t('carousel')}
        aria-label={t('carouselLabel', { count, label })}
        onKeyDown={onKeyDown}
        className={cn('group/carousel relative', FRAMED)}
      >
        <div
          ref={scroller}
          onScroll={settle}
          onPointerDown={() => { heading.current = null; }}
          onWheel={() => { heading.current = null; }}
          className={cn('flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', FRAME)}
        >
          {shown.map((photo, at) => <div key={photo.id} role="group" aria-roledescription={t('slide')} aria-label={t('slideLabel', { number: at + 1, count })} className="size-full shrink-0 snap-center snap-always">
            <button type="button" data-slide="" tabIndex={at === current ? 0 : -1} onClick={() => setOpen(at)} aria-label={t('open', { number: at + 1, count })} className={cn(TILE, 'size-full')}>
              {picture(photo, at, (eager && at === 0) || (near && Math.abs(at - current) <= 1) ? 'eager' : 'lazy')}
            </button>
          </div>)}
        </div>
        {current > 0 && <button ref={previousArrow} type="button" onClick={() => step(-1)} aria-label={t('previous')} className={cn(ARROW, 'left-1')}>
          <span className={ARROW_DISC}><ChevronLeft aria-hidden="true" className="size-[1.125rem]" /></span>
        </button>}
        {current < count - 1 && <button ref={nextArrow} type="button" onClick={() => step(1)} aria-label={t('next')} className={cn(ARROW, 'right-1')}>
          <span className={ARROW_DISC}><ChevronRight aria-hidden="true" className="size-[1.125rem]" /></span>
        </button>}
        <span aria-hidden="true" className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px]/4 font-semibold text-white tabular-nums backdrop-blur-sm">
          {t('counter', { number: current + 1, count })}
        </span>
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="flex items-center gap-1 rounded-full bg-black/30 px-1.5 py-1 backdrop-blur-sm">
            {shown.map((photo, at) => <span key={photo.id} data-current={at === current ? '' : undefined} className={cn('h-1.5 rounded-full transition-[width,background-color] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none', at === current ? 'w-3.5 bg-white' : 'w-1.5 bg-white/55')} />)}
          </span>
        </span>
        <p className="sr-only" aria-live="polite" aria-atomic="true">{t('title', { number: current + 1, count })}</p>
      </div>;

  const viewing = open === null ? null : shown[open] ?? null;
  const stepViewer = (by: number) => setOpen((at) => (at === null ? at : (at + by + count) % count));
  return <>
    {photosView}
    <Dialog
      open={viewing !== null}
      onOpenChange={(next) => {
        if (next) return;
        // The carousel moves (at once) to the photo the viewer was on.
        if (carousel && open !== null) {
          returnTo.current = open;
          go(open, { behavior: 'instant' });
        }
        setOpen(null);
      }}
    >
      <DialogContent
        onKeyDown={(event) => {
          if (count < 2) return;
          if (event.key === 'ArrowRight') stepViewer(1);
          if (event.key === 'ArrowLeft') stepViewer(-1);
        }}
        onCloseAutoFocus={(event) => {
          // The viewer opens without a Radix trigger, so focus goes back by hand: to the photo, or the one last seen.
          const target = carousel ? slideButton(returnTo.current ?? current) : lone.current;
          returnTo.current = null;
          if (!target) return;
          event.preventDefault();
          target.focus({ preventScroll: true });
        }}
        className="max-h-[92dvh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-3xl"
      >
        {viewing && open !== null && <>
          <DialogHeader>
            <DialogTitle>{t('title', { number: open + 1, count })}</DialogTitle>
            <DialogDescription className="break-words">{altOf(viewing, open)}</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Image unoptimized src={viewing.src} alt={altOf(viewing, open)} width={viewing.width} height={viewing.height} className="h-auto max-h-[68dvh] w-full rounded-lg bg-muted object-contain" />
            {count > 1 && <>
              <button type="button" onClick={() => stepViewer(-1)} aria-label={t('previous')} className="absolute top-1/2 left-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-card focus-visible:outline-2 focus-visible:outline-ring"><ChevronLeft aria-hidden="true" className="size-5" /></button>
              <button type="button" onClick={() => stepViewer(1)} aria-label={t('next')} className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-card focus-visible:outline-2 focus-visible:outline-ring"><ChevronRight aria-hidden="true" className="size-5" /></button>
            </>}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
