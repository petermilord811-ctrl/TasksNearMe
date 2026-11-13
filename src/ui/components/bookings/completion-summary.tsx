import Image from 'next/image';
import { Expand } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CompletionView, Photo } from '@/contracts';
import { formatDateTime, formatHours, formatMoney } from '@/shared/format';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { cn } from '@/ui/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';
import { surface, surfacePad } from './surface';

export interface CompletionSummaryProps {
  completion: CompletionView;
  variant: 'poster' | 'helper';
  /** The summary leads the page (the problem report): its first photo is above the fold, so it loads at once. */
  leadsPage?: boolean;
}

function EvidencePhoto({ photo, title, receipt = false, eager = false }: { photo: Photo; title: string; receipt?: boolean; eager?: boolean }) {
  const t = useTranslations('completion');
  const label = t(receipt ? 'viewReceipt' : 'viewPhoto');

  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" aria-label={t('openPhoto', { label, description: photo.alt })} className="group flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-foreground/[0.07] bg-card text-left shadow-[0_1px_2px_rgb(23_18_14/0.05)] transition-[box-shadow,transform] duration-300 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgb(60_30_10/0.4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-white/[0.06]">
        <span className="block overflow-hidden">
          <Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} unoptimized loading={eager ? 'eager' : 'lazy'} className="aspect-4/3 h-auto w-full object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
        </span>
        <span className="flex min-h-11 w-full items-center justify-between gap-2 px-3.5 py-2 text-sm font-medium">
          {label}<Expand aria-hidden="true" className="size-4 shrink-0 text-primary transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none" />
        </span>
      </button>
    </DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-reading max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="break-words">{photo.alt}</DialogDescription>
      </DialogHeader>
      <Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} unoptimized className="h-auto max-h-[60dvh] w-full rounded-lg object-contain" />
    </DialogContent>
  </Dialog>;
}

/** Displays supplied evidence and final amounts without deriving payment totals. */
export function CompletionSummary({ completion, variant, leadsPage = false }: CompletionSummaryProps) {
  const t = useTranslations('completion');

  return <div className="min-w-0 space-y-4">
    <div className={cn(surface, surfacePad, 'space-y-5')}>
      <p className="text-sm tabular-nums text-muted-foreground"><time dateTime={completion.submittedAt}>{t('sent', { date: formatDateTime(completion.submittedAt) })}</time></p>
      {completion.photos.length > 0 && <ul aria-label={t('photos')} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        {completion.photos.map((photo, index) => <li key={photo.id} className="min-w-0"><EvidencePhoto photo={photo} title={t('photoTitle', { number: index + 1, count: completion.photos.length })} eager={leadsPage && index === 0} /></li>)}
      </ul>}
      {completion.note && <p className="whitespace-pre-wrap break-words">{completion.note}</p>}
      {completion.hoursWorked !== undefined && <p className="font-medium tabular-nums">{completion.hoursCap !== undefined
        ? t('hoursWorkedWithCap', { hours: completion.hoursWorked, cap: completion.hoursCap })
        : t('hoursWorked', { hours: formatHours(completion.hoursWorked) })}</p>}
      {completion.expenses.length > 0 && <div className="space-y-3 border-t border-foreground/[0.07] pt-5 dark:border-white/[0.07]">
        <p className="font-semibold">{t('receipts')}</p>
        <ul aria-label={t('receipts')} className="space-y-3">
          {completion.expenses.map((expense) => <li key={expense.id} className="space-y-3 rounded-2xl bg-muted/50 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="min-w-0 flex-1 break-words font-medium">{expense.description}</p>
              <p className="shrink-0 font-semibold tabular-nums">{formatMoney(expense.amountCents)}</p>
            </div>
            <div className="max-w-64"><EvidencePhoto photo={expense.receipt} title={t('receiptTitle', { description: expense.description })} receipt /></div>
          </li>)}
        </ul>
      </div>}
    </div>
    <PriceBreakdown breakdown={completion.finalBreakdown} variant={variant} title={t(variant === 'poster' ? 'finalCost' : 'earnings')} />
  </div>;
}
