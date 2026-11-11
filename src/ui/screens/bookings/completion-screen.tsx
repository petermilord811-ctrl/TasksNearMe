import Link from 'next/link';
import { ArrowLeft, CalendarDays, CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type CompletionHandlers, type CompletionPageData, type ISODateTime } from '@/contracts';
import { formatDateTime, formatMoney } from '@/shared/format';
import { CompletionForm } from './completion-form';

export interface CompletionScreenProps {
  data: CompletionPageData;
  handlers: CompletionHandlers;
  now: ISODateTime;
}

export function CompletionScreen(props: CompletionScreenProps) {
  return <CompletionContent {...props} />;
}

/** Initial states are only used by the preview gallery. */
export function CompletionContent({ data, handlers, initialResult, initialPending, initialQuoteError }: CompletionScreenProps & {
  initialResult?: ActionResult;
  initialPending?: boolean;
  initialQuoteError?: boolean;
}) {
  const t = useTranslations('bookingComplete');
  const { booking } = data;
  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={routes.app.booking(booking.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline"><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>
    <header className="space-y-2"><h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1><p className="text-muted-foreground">{t('intro')}</p></header>
    <section aria-label={t('summary')} className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 className="break-words font-heading text-xl/7 font-semibold">{booking.task.title}</h2>
      <p>{t('client', { name: booking.poster.displayName })}</p>
      <div className="flex items-start gap-2"><CalendarDays aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" /><div><p className="text-sm text-muted-foreground">{t('agreedStart')}</p><time dateTime={booking.terms.start} className="tabular-nums">{formatDateTime(booking.terms.start)}</time></div></div>
      <p className="tabular-nums">{booking.terms.pricing.type === 'hourly' ? t('hourlyPrice', { rate: formatMoney(booking.terms.pricing.rateCents), cap: booking.terms.pricing.hoursCap }) : t('fixedPrice', { amount: formatMoney(booking.terms.pricing.priceCents) })}</p>
    </section>
    {data.unavailable ? <section className="space-y-3 rounded-xl border border-warning/40 bg-card p-4 sm:p-6" aria-label={t('unavailable.title')}>
      <h2 className="flex items-center gap-2 font-heading text-xl font-semibold"><CircleAlert aria-hidden="true" className="size-5 shrink-0 text-warning" />{t('unavailable.title')}</h2><p>{t(`unavailable.${data.unavailable}`)}</p>
      <Link href={routes.app.booking(booking.id)} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{t('back')}</Link>
    </section> : <CompletionForm key={booking.id} data={data} handlers={handlers} initialResult={initialResult} initialPending={initialPending} initialQuoteError={initialQuoteError} />}
  </div>;
}
