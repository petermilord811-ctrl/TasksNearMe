'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Expand, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Photo } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';
import { Skeleton } from '@/ui/primitives/skeleton';

/**
 * Photos and GIFs in a chat bubble (2026-11-24): one look for a conversation, a building or street group, and the staff
 * page of a reported group message. A photo opens larger in a dialog (a sheet from the bottom on phones); a GIF plays in
 * the bubble, at its final size from the first paint. (src/ui/screens/messages/message-log.tsx keeps its own copy for
 * now; it can use these once its pending work lands.)
 */

export function MessagePhoto({ photo, number, count, sender }: { photo: Photo; number: number; count: number; sender: string }) {
  const t = useTranslations('thread');
  const alt = photo.alt || t('photoAlt', { number, count, name: sender });
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" aria-label={t('openPhoto', { description: alt })} className="group w-full overflow-hidden rounded-lg border bg-card text-left text-foreground transition-colors hover:bg-accent">
        <Image src={photo.src} alt={alt} width={photo.width} height={photo.height} unoptimized className="aspect-4/3 h-auto w-full object-cover" />
        <span className="flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-sm font-medium">{t('viewPhoto')}<Expand aria-hidden="true" className="size-4 shrink-0 text-primary" /></span>
      </button>
    </DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-reading max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
      <DialogHeader><DialogTitle>{t('photoTitle', { number, count })}</DialogTitle><DialogDescription>{alt}</DialogDescription></DialogHeader>
      <Image src={photo.src} alt={alt} width={photo.width} height={photo.height} unoptimized className="h-auto max-h-[60dvh] w-full rounded-lg object-contain" />
    </DialogContent>
  </Dialog>;
}

/** A GIF's width in a bubble, in px: 240, or less for a tall one so it's at most 280 px high (never under 120). */
export function gifBoxWidth(photo: Pick<Photo, 'width' | 'height'>): number {
  return Math.max(120, Math.min(240, Math.round((280 * photo.width) / Math.max(1, photo.height))));
}

/**
 * A GIF: the GIF itself, at most 240 px wide, opening larger on a tap. With reduced motion asked for on the device it
 * doesn't play by itself: a still placeholder says "Play GIF" until tapped (CSS, so the first paint is right). The box
 * has its final size before the file arrives (from the size the server stored), with a shimmer until then.
 */
export function MessageGif({ photo, sender }: { photo: Photo; sender: string }) {
  const t = useTranslations('thread.gif');
  const [playing, setPlaying] = useState(false);
  const [arrived, setArrived] = useState(false);
  const alt = photo.alt || t('alt', { name: sender });
  // The box has its final size before the file arrives, from the size the server stored (2026-11-24, owner: "that chat
  // bubble size is changed"): a fixed width (240 px, less for a tall GIF so it's at most 280 px high), never wider than
  // the bubble. A fixed width also counts when the bubble sizes itself; a percentage of it waited for the file. Until
  // the file is there, a shimmer. (A file that fails stops it too: caught here, as React passes the image's error up. Given
  // to the Image itself, onError makes it ask for the file again after hydration and rewrite its address.)
  return <div className="relative max-w-full overflow-hidden rounded-xl border bg-muted" style={{ width: gifBoxWidth(photo), aspectRatio: `${photo.width} / ${photo.height}` }} data-gif="" onError={() => setArrived(true)}>
    {!arrived && <Skeleton aria-hidden="true" className="absolute inset-0 rounded-none" />}
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" aria-label={t('open', { description: alt })} className={cn('relative block size-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring', !playing && 'motion-reduce:hidden')}>
          <Image src={photo.src} alt={alt} width={photo.width} height={photo.height} unoptimized loading="eager" onLoad={() => setArrived(true)} className="size-full object-cover" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <DialogHeader><DialogTitle>{t('title', { name: sender })}</DialogTitle><DialogDescription>{alt}</DialogDescription></DialogHeader>
        <Image src={photo.src} alt={alt} width={photo.width} height={photo.height} unoptimized className="h-auto max-h-[60dvh] w-full rounded-lg object-contain" />
      </DialogContent>
    </Dialog>
    <span aria-hidden="true" className={cn('pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1 text-[10px] font-bold leading-4 tracking-wide text-white', !playing && 'motion-reduce:hidden')}>{t('badge')}</span>
    {!playing && <button type="button" onClick={() => setPlaying(true)} aria-label={t('playLabel', { description: alt })} className="absolute inset-0 hidden flex-col items-center justify-center gap-1.5 bg-muted text-sm font-semibold text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:flex">
      <span className="grid size-10 place-items-center rounded-full bg-background shadow-sm"><Play aria-hidden="true" className="size-5 text-primary" /></span>{t('play')}
    </button>}
  </div>;
}

/**
 * A message's photos and GIFs, as a list: one column on phones; two on wider screens when there are two or more photos
 * (a lone photo keeps the bubble's width, and GIFs keep their own size).
 */
export function MessageAttachments({ attachments, sender, className }: { attachments: Photo[]; sender: string; className?: string }) {
  const t = useTranslations('thread');
  if (attachments.length === 0) return null;
  const photos = attachments.filter((photo) => !photo.animated).length;
  return <ul aria-label={t('photos')} className={cn('grid max-w-96 grid-cols-1 gap-2', photos >= 2 && 'sm:grid-cols-2', className)}>
    {attachments.map((photo, index) => <li key={photo.id} className="min-w-0">{photo.animated ? <MessageGif photo={photo} sender={sender} /> : <MessagePhoto photo={photo} number={index + 1} count={attachments.length} sender={sender} />}</li>)}
  </ul>;
}
