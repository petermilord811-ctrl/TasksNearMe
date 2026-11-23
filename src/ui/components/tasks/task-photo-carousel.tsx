'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Photo } from '@/contracts';
import { usePrefersReducedMotion } from '@/ui/motion/use-reduced-motion';
import { cn } from '@/ui/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/primitives/dialog';

const arrowClass = 'grid size-11 place-items-center rounded-full bg-card/90 text-foreground shadow-[0_6px_18px_-8px_rgb(0_0_0/0.45)] backdrop-blur-sm transition-[opacity,transform,background-color] duration-200 ease-[var(--ease-out)] hover:scale-105 hover:bg-card disabled:pointer-events-none disabled:opacity-0';

/**
 * A task's photos (owner, 2026-11-23: "there will be images also (if many, show it as carousel)"): one photo large;
 * several as a carousel that swipes on phones (scroll snap), with arrows, a counter, thumbnails on wider screens and a
 * full-screen viewer (arrow keys work there too). Each photo's alt text, or "Photo 2 of 4 from Sophie L.".
 */
export function TaskPhotoCarousel({ photos, posterName, className }: { photos: readonly Photo[]; posterName: string; className?: string }) {
  const t = useTranslations('taskCard.gallery');
  const id = useId();
  const reduced = usePrefersReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  // The photo that opened the viewer takes the focus back when it closes.
  const opener = useRef<HTMLButtonElement | null>(null);
  const [announce, setAnnounce] = useState('');
  const count = photos.length;
  const alt = useCallback((photo: Photo, at: number) => photo.alt || t('alt', { number: at + 1, total: count, name: posterName }), [count, posterName, t]);

  // The slide in view follows the track's scroll (a swipe, the arrows or a thumbnail).
  useEffect(() => {
    const element = track.current;
    if (!element || count < 2) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = element.clientWidth || 1;
        setIndex(Math.max(0, Math.min(count - 1, Math.round(element.scrollLeft / width))));
      });
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => { element.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [count]);

  const go = useCallback((next: number) => {
    const element = track.current;
    const target = Math.max(0, Math.min(count - 1, next));
    if (element) element.scrollTo({ left: target * element.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
    setIndex(target);
    setAnnounce(t('position', { number: target + 1, total: count }));
  }, [count, reduced, t]);

  if (count === 0) return null;
  const shown = viewer === null ? null : photos[viewer];
  return <section aria-roledescription={count > 1 ? t('carousel') : undefined} aria-label={t('label', { count })} className={cn('space-y-3', className)}>
    <div className="group/gallery relative overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-muted shadow-card dark:border-white/[0.06]">
      <div ref={track} id={`${id}-track`} className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" tabIndex={count > 1 ? 0 : -1}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
          if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
        }}>
        {photos.map((photo, at) => <div key={photo.id} role="group" aria-roledescription={t('slide')} aria-label={t('position', { number: at + 1, total: count })} className="relative w-full shrink-0 snap-center">
          <button type="button" onClick={(event) => { opener.current = event.currentTarget; setViewer(at); setViewerOpen(true); }} aria-label={t('open', { number: at + 1, total: count })} className="block w-full cursor-zoom-in outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset">
            <Image unoptimized src={photo.src} alt={alt(photo, at)} width={photo.width ?? 1200} height={photo.height ?? 900} priority={at === 0} className="aspect-[4/3] w-full object-cover sm:aspect-[16/10]" />
          </button>
        </div>)}
      </div>
      {/* A soft shade under the controls, so they read over light photos. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/35 to-transparent" />
      {count > 1 && <>
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-controls={`${id}-track`} aria-label={t('previous')} className={cn(arrowClass, 'pointer-events-auto sm:opacity-0 sm:group-hover/gallery:opacity-100 sm:focus-visible:opacity-100')}><ChevronLeft aria-hidden="true" className="size-5" /></button>
          <button type="button" onClick={() => go(index + 1)} disabled={index === count - 1} aria-controls={`${id}-track`} aria-label={t('next')} className={cn(arrowClass, 'pointer-events-auto sm:opacity-0 sm:group-hover/gallery:opacity-100 sm:focus-visible:opacity-100')}><ChevronRight aria-hidden="true" className="size-5" /></button>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {photos.map((photo, at) => <span key={photo.id} className={cn('h-1.5 rounded-full bg-white/70 transition-[width,background-color] duration-300 ease-[var(--ease-out)]', at === index ? 'w-5 bg-white' : 'w-1.5')} />)}
        </div>
      </>}
      <p aria-hidden="true" className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white tabular-nums backdrop-blur-sm">{count > 1 ? t('counter', { number: index + 1, total: count }) : <Expand className="size-3.5" />}</p>
    </div>
    {count > 1 && <ul className="hidden gap-2 sm:flex" aria-label={t('thumbnails')}>
      {photos.map((photo, at) => <li key={photo.id}>
        <button type="button" onClick={() => go(at)} aria-label={t('show', { number: at + 1, total: count })} aria-current={at === index ? 'true' : undefined} className={cn('block size-16 overflow-hidden rounded-xl border-2 transition-[border-color,opacity] duration-200', at === index ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100')}>
          <Image unoptimized src={photo.src} alt="" width={128} height={128} className="size-full object-cover" />
        </button>
      </li>)}
    </ul>}
    <p aria-live="polite" className="sr-only">{announce}</p>

    <Dialog open={viewerOpen && shown !== null && shown !== undefined} onOpenChange={setViewerOpen}>
      {shown && viewer !== null && <DialogContent className="max-h-[94dvh] w-[min(64rem,calc(100vw-1.5rem))] max-w-none gap-3 p-3 sm:p-4"
        onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' && viewer < count - 1) setViewer(viewer + 1);
          if (event.key === 'ArrowLeft' && viewer > 0) setViewer(viewer - 1);
        }}>
        <DialogTitle className="pr-10 text-base">{t('position', { number: viewer + 1, total: count })}</DialogTitle>
        <DialogDescription className="sr-only">{alt(shown, viewer)}</DialogDescription>
        <div className="relative">
          <Image unoptimized src={shown.src} alt={alt(shown, viewer)} width={shown.width ?? 1600} height={shown.height ?? 1200} className="max-h-[78dvh] w-full rounded-xl bg-muted object-contain" />
          {count > 1 && <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2">
            <button type="button" onClick={() => setViewer(Math.max(0, viewer - 1))} disabled={viewer === 0} aria-label={t('previous')} className={cn(arrowClass, 'pointer-events-auto')}><ChevronLeft aria-hidden="true" className="size-5" /></button>
            <button type="button" onClick={() => setViewer(Math.min(count - 1, viewer + 1))} disabled={viewer === count - 1} aria-label={t('next')} className={cn(arrowClass, 'pointer-events-auto')}><ChevronRight aria-hidden="true" className="size-5" /></button>
          </div>}
        </div>
      </DialogContent>}
    </Dialog>
  </section>;
}
