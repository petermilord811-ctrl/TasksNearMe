import Image from 'next/image';
import { ChevronDown, Expand } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORY_DETAIL_FIELDS, routes, type TaskOwnerView } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { ExactAddressPanel } from '@/ui/components/location/exact-address-panel';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';

export function TaskDetails({ data }: { data: TaskOwnerView }) {
  const t = useTranslations('taskManage');
  const details = useTranslations('postTask');
  return <section aria-labelledby="your-task-title">
    <details open className="group rounded-xl border bg-card shadow-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-6 [&::-webkit-details-marker]:hidden"><h2 id="your-task-title" className="font-heading text-xl font-semibold md:text-[22px]/7.5">{t('yourTask')}</h2><ChevronDown aria-hidden="true" className="size-5 shrink-0 transition-transform group-open:rotate-180" /></summary>
      <div className="space-y-6 border-t p-4 sm:p-6">
        <div className="space-y-2"><h3 className="font-semibold">{t('description')}</h3><p className="whitespace-pre-wrap break-words leading-6">{data.description}</p></div>
        <div className="space-y-3"><h3 className="font-semibold">{t('details')}</h3><dl className="grid gap-4 sm:grid-cols-2">
          {CATEGORY_DETAIL_FIELDS[data.task.categorySlug].map((field) => {
            const value = data.details[field.key];
            if (value === undefined || value === '') return null;
            const display = field.kind === 'choice' && typeof value === 'string' && field.options.includes(value)
              ? details(`details.${data.task.categorySlug}.${field.key}.options.${value}`)
              : typeof value === 'boolean' ? details(value ? 'review.yes' : 'review.no') : String(value);
            return <div key={field.key} className="space-y-1"><dt className="text-sm text-muted-foreground">{details(`details.${data.task.categorySlug}.${field.key}.label`)}</dt><dd className="break-words">{display}</dd></div>;
          })}
        </dl></div>
        {data.photos.length > 0 && <div className="space-y-3"><h3 className="font-semibold">{t('photos')}</h3><ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.photos.map((photo, index) => {
            const alt = photo.alt || t('photoAlt', { number: index + 1, total: data.photos.length, name: data.task.poster.displayName });
            return <li key={photo.id}><Dialog>
              <DialogTrigger asChild><button type="button" aria-label={t('openPhoto', { number: index + 1, total: data.photos.length })} className="group/photo relative min-h-11 w-full overflow-hidden rounded-lg border"><Image src={photo.src} alt={alt} width={photo.width ?? 800} height={photo.height ?? 600} className="aspect-4/3 w-full object-cover" /><span className="absolute right-2 bottom-2 rounded-full bg-card p-2 text-foreground"><Expand aria-hidden="true" className="size-4" /></span></button></DialogTrigger>
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-reading"><DialogHeader><DialogTitle>{t('photoTitle', { number: index + 1, total: data.photos.length })}</DialogTitle><DialogDescription>{alt}</DialogDescription></DialogHeader><Image src={photo.src} alt={alt} width={photo.width ?? 800} height={photo.height ?? 600} className="max-h-[65dvh] w-full rounded-lg object-contain" /></DialogContent>
            </Dialog></li>;
          })}
        </ul></div>}
        <div className="space-y-2"><h3 className="font-semibold">{t('allowance')}</h3>{data.expenseAllowance ? <><p className="font-semibold tabular-nums">{formatMoney(data.expenseAllowance.amountCents)}</p><p className="break-words text-sm">{data.expenseAllowance.description}</p></> : <p className="text-sm text-muted-foreground">{t('noAllowance')}</p>}</div>
        {data.exactAddress && <ExactAddressPanel address={data.exactAddress} mapsHref={routes.external.googleMapsSearch(data.exactAddress)} />}
        {data.task.location.kind === 'remote' ? <p className="text-sm text-muted-foreground">{t('remoteAddress')}</p> : !data.bookingId && <p className="text-sm text-muted-foreground">{t('privacy')}</p>}
      </div>
    </details>
  </section>;
}
