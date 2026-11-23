import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type TaskOwnerView } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { ExactAddressPanel } from '@/ui/components/location/exact-address-panel';
import { RichText } from '@/ui/components/rich-text/rich-text';
import { TaskPhotoCarousel } from '@/ui/components/tasks/task-photo-carousel';
import { TaskSpec } from '@/ui/components/tasks/task-spec';

export function TaskDetails({ data }: { data: TaskOwnerView }) {
  const t = useTranslations('taskManage');
  return <section aria-labelledby="your-task-title">
    <details open className="group overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors duration-200 hover:bg-foreground/[0.025] sm:p-6 [&::-webkit-details-marker]:hidden"><h2 id="your-task-title" className="font-heading text-xl font-semibold md:text-[22px]/7.5">{t('yourTask')}</h2><ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 ease-[var(--ease-out)] group-open:rotate-180" /></summary>
      <div className="space-y-6 border-t border-foreground/[0.07] p-4 sm:p-6 dark:border-white/[0.06]">
        <div className="space-y-2"><h3 className="font-semibold">{t('description')}</h3><RichText text={data.description} headingLevel={4} /></div>
        <div className="space-y-3"><h3 className="font-semibold">{t('details')}</h3><TaskSpec category={data.task.categorySlug} answers={data.details} /></div>
        {data.photos.length > 0 && <div className="space-y-3"><h3 className="font-semibold">{t('photos')}</h3><TaskPhotoCarousel photos={data.photos} posterName={data.task.poster.displayName} /></div>}
        <div className="space-y-2"><h3 className="font-semibold">{t('allowance')}</h3>{data.expenseAllowance ? <><p className="font-semibold tabular-nums">{formatMoney(data.expenseAllowance.amountCents)}</p><p className="break-words text-sm">{data.expenseAllowance.description}</p></> : <p className="text-sm text-muted-foreground">{t('noAllowance')}</p>}</div>
        {data.exactAddress && <ExactAddressPanel address={data.exactAddress} mapsHref={routes.external.googleMapsSearch(data.exactAddress)} />}
        {data.task.location.kind === 'remote' ? <p className="text-sm text-muted-foreground">{t('remoteAddress')}</p> : !data.bookingId && <p className="text-sm text-muted-foreground">{t('privacy')}</p>}
      </div>
    </details>
  </section>;
}
