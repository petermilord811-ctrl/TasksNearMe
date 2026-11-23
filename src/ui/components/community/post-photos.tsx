'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Photo } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';

/**
 * A post's photos (plan 10.1), Nextdoor-style: one fills the card's width, two sit side by side, three put one large
 * beside two, four make a square. Each opens the viewer, which steps through them (arrows, and the keyboard's left and
 * right). `compact` (a reply) shows its one photo smaller.
 */
export function PostPhotos({ photos, label, compact = false, eager = false }: { photos: Photo[]; label: string; compact?: boolean; eager?: boolean }) {
  const t = useTranslations('community.photos');
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const shown = photos.slice(0, 4);
  const count = shown.length;
  const altOf = (photo: Photo, index: number) => photo.alt || t('alt', { number: index + 1, count, label });
  const tile = (photo: Photo, index: number, className: string) => <button
    key={photo.id}
    type="button"
    onClick={() => setOpen(index)}
    aria-label={t('open', { number: index + 1, count })}
    className={cn('group/photo relative block min-h-11 overflow-hidden bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring', className)}
  >
    <Image
      unoptimized
      src={photo.src}
      alt={altOf(photo, index)}
      width={photo.width}
      height={photo.height}
      loading={eager && index === 0 ? 'eager' : 'lazy'}
      className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover/photo:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover/photo:scale-100"
    />
  </button>;

  const grid = compact
    ? <div className="max-w-64 overflow-hidden rounded-2xl border border-foreground/[0.07] dark:border-white/[0.06]">{tile(shown[0]!, 0, 'aspect-4/3 w-full')}</div>
    : <div className={cn('grid gap-0.5 overflow-hidden rounded-2xl border border-foreground/[0.07] dark:border-white/[0.06]', count === 1 ? 'grid-cols-1' : 'grid-cols-2', count === 3 && 'grid-rows-2')}>
        {count === 1 && tile(shown[0]!, 0, 'aspect-[4/3] max-h-72 w-full sm:aspect-[16/10] sm:max-h-80')}
        {count === 2 && shown.map((photo, index) => tile(photo, index, 'aspect-square w-full sm:aspect-[4/3]'))}
        {count === 3 && <>
          {tile(shown[0]!, 0, 'row-span-2 h-full min-h-48 w-full')}
          {tile(shown[1]!, 1, 'aspect-[4/3] w-full')}
          {tile(shown[2]!, 2, 'aspect-[4/3] w-full')}
        </>}
        {count === 4 && shown.map((photo, index) => tile(photo, index, 'aspect-[4/3] w-full'))}
      </div>;

  const current = open === null ? null : shown[open] ?? null;
  const step = (by: number) => setOpen((index) => (index === null ? index : (index + by + count) % count));
  return <>
    {grid}
    <Dialog open={current !== null} onOpenChange={(next) => !next && setOpen(null)}>
      <DialogContent
        onKeyDown={(event) => {
          if (count < 2) return;
          if (event.key === 'ArrowRight') step(1);
          if (event.key === 'ArrowLeft') step(-1);
        }}
        className="max-h-[92dvh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-3xl"
      >
        {current && open !== null && <>
          <DialogHeader>
            <DialogTitle>{t('title', { number: open + 1, count })}</DialogTitle>
            <DialogDescription className="break-words">{altOf(current, open)}</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Image unoptimized src={current.src} alt={altOf(current, open)} width={current.width} height={current.height} className="h-auto max-h-[68dvh] w-full rounded-lg bg-muted object-contain" />
            {count > 1 && <>
              <button type="button" onClick={() => step(-1)} aria-label={t('previous')} className="absolute top-1/2 left-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-card focus-visible:outline-2 focus-visible:outline-ring"><ChevronLeft aria-hidden="true" className="size-5" /></button>
              <button type="button" onClick={() => step(1)} aria-label={t('next')} className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-card focus-visible:outline-2 focus-visible:outline-ring"><ChevronRight aria-hidden="true" className="size-5" /></button>
            </>}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
