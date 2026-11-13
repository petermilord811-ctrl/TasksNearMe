import Link from 'next/link';
import { ArrowLeft, CalendarDays, CircleAlert, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type BookingConfirmHandlers, type BookingConfirmPageData, type ISODateTime, type PaymentAttemptResult } from '@/contracts';
import { formatDate, formatDateTime, formatMoney } from '@/shared/format';
import { backArrow, backLink, cardTitle, note, sectionTitle, surface, surfacePad } from '@/ui/components/bookings/surface';
import { PageHeader } from '@/ui/components/layout/page-header';
import { GeneralArea } from '@/ui/components/location/general-area';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import { CancellationSummary } from '@/ui/components/money/cancellation-summary';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { HelperCard } from '@/ui/components/people/helper-card';
import { cn } from '@/ui/lib/utils';
import { BookingConfirmForm } from './booking-confirm-form';

export interface BookingConfirmScreenProps {
  data: BookingConfirmPageData;
  handlers: BookingConfirmHandlers;
  now: ISODateTime;
}

export function BookingConfirmScreen(props: BookingConfirmScreenProps) {
  return <BookingConfirmContent {...props} />;
}

/** Initial states are for the preview gallery; app pages use BookingConfirmScreen. */
export function BookingConfirmContent({ data, handlers, now, initialResult, initialPending }: BookingConfirmScreenProps & {
  initialResult?: PaymentAttemptResult;
  initialPending?: boolean;
}) {
  const t = useTranslations('bookingConfirm');
  const categories = useTranslations('helperCard.categories');
  const { task, offer } = data;
  const helper = offer.helper.displayName;

  const summary = <>
    <Link href={routes.app.offer(task.id, offer.id)} className={backLink}>
      <ArrowLeft aria-hidden="true" className={backArrow} />{t('backToOffer')}
    </Link>
    <PageHeader title={t('title')} description={t('intro')} />
    <section aria-label={t('summary')} className={cn(surface, surfacePad, 'space-y-5')}>
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{categories(task.categorySlug)}</p>
        <h2 className={cn(sectionTitle, 'break-words')}>{task.title}</h2>
      </div>
      <div className="flex items-start gap-2">
        <CalendarDays aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
        <div><p className="text-sm text-muted-foreground">{t('agreedStart')}</p><time dateTime={offer.proposedStart} className="font-medium tabular-nums">{formatDateTime(offer.proposedStart)}</time></div>
      </div>
      <GeneralArea location={task.location} />
      <p className="flex items-start gap-2 rounded-2xl bg-muted/70 px-3.5 py-3 text-sm">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>{t(task.location.kind === 'remote' ? 'remoteAddress' : 'localAddress', { helper })}</span>
      </p>
    </section>
    <section aria-label={t('helper')} className="space-y-3">
      <h2 className={sectionTitle}>{t('helper')}</h2>
      <HelperCard helper={offer.helper} variant="compact" />
      <div className={cn(surface, surfacePad, 'space-y-3')}>
        <h3 className={cardTitle}>{t('message')}</h3>
        <p className="whitespace-pre-wrap break-words"><MaskedText segments={offer.message} /></p>
        {offer.brings.length > 0 && <p className="text-sm text-muted-foreground">{t('brings', { items: offer.brings.join(', ') })}</p>}
      </div>
    </section>
    <div className="space-y-3">
      <PriceBreakdown breakdown={data.breakdown} variant="poster" title={t('totalToday')} />
      <p className="text-sm text-muted-foreground">{t('paymentNote')}</p>
      {data.credit && <p className={note}>{t('credit', { amount: formatMoney(data.credit.amountCents), date: formatDate(data.credit.expiresAt) })}</p>}
      {offer.pricing.type === 'hourly' && <p className={note}>{t('hourlyNote', { hours: offer.pricing.hoursCap })}</p>}
    </div>
    <CancellationSummary policy={data.cancellation} helperName={helper} />
  </>;

  return <div className="mx-auto max-w-reading space-y-6">
    {data.unavailable ? <>{summary}<section aria-label={t('unavailable.title')} className={cn(surface, surfacePad, 'space-y-3 border-warning/40 dark:border-warning/40')}>
      <h2 className={cn(sectionTitle, 'flex items-start gap-2')}><CircleAlert aria-hidden="true" className="mt-1 size-5 shrink-0 text-warning" />{t('unavailable.title')}</h2>
      <p>{t(`unavailable.${data.unavailable}`, { helper })}</p>
      <Link href={routes.app.task(task.id)} className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline underline-offset-4">{t('backToTask')}</Link>
    </section></> : <BookingConfirmForm key={`${offer.id}-${offer.revision}`} data={data} handlers={handlers} now={now} initialResult={initialResult} initialPending={initialPending}>{summary}</BookingConfirmForm>}
  </div>;
}
