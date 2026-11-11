import Image from 'next/image';
import { Expand } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Photo } from '@/contracts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';

export function CasePhoto({ photo, number, count, sender }: { photo: Photo; number: number; count: number; sender: string }) {
  const t = useTranslations('supportCase');
  const alt = photo.alt || t('photoAlt', { number, count, name: sender });
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" aria-label={t('openPhoto', { description: alt })} className="w-full overflow-hidden rounded-lg border bg-card text-left text-foreground hover:bg-accent">
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
