import Image from 'next/image';
import { Expand } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { WorkSampleView } from '@/contracts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';

export interface WorkSampleGalleryProps {
  samples: WorkSampleView[];
  /** The gallery is above the fold: its first photo loads at once (the Largest Contentful Paint). */
  eagerFirst?: boolean;
}

export function WorkSampleGallery({ samples, eagerFirst = false }: WorkSampleGalleryProps) {
  const t = useTranslations('reviews');

  return (
    <ul className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {samples.map((sample, index) => (
        <li key={sample.id} className="min-w-0">
          <Dialog>
            <DialogTrigger asChild>
              <button type="button" aria-label={t('workSamples.open', { description: sample.caption || sample.photo.alt })} className="group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card text-left shadow-card transition-[transform,box-shadow] duration-300 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-20px_rgb(60_30_10/0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-white/[0.06]">
                <span className="block overflow-hidden">
                  <Image src={sample.photo.src} alt={sample.photo.alt} width={sample.photo.width} height={sample.photo.height} unoptimized loading={eagerFirst && index === 0 ? 'eager' : 'lazy'} className="aspect-4/3 h-auto w-full object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
                </span>
                <span className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="break-words font-medium">{sample.caption || t('workSamples.view')}</span>
                  <Expand aria-hidden="true" className="size-4 shrink-0 text-primary" />
                </span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-reading max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
              <DialogHeader>
                <DialogTitle>{t('workSamples.title', { number: index + 1, count: samples.length })}</DialogTitle>
                <DialogDescription className="break-words">{sample.caption || sample.photo.alt}</DialogDescription>
              </DialogHeader>
              <Image src={sample.photo.src} alt={sample.photo.alt} width={sample.photo.width} height={sample.photo.height} unoptimized className="h-auto max-h-[60dvh] w-full rounded-lg object-contain" />
              {sample.categorySlug && <p className="text-sm text-muted-foreground">{t(`categories.${sample.categorySlug}`)}</p>}
            </DialogContent>
          </Dialog>
        </li>
      ))}
    </ul>
  );
}
