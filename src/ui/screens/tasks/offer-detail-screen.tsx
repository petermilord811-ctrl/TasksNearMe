'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type OfferActionId, type OfferDetailPageData, type TaskOwnerHandlers } from '@/contracts';
import { formatDateTime } from '@/shared/format';
import { ActionBar } from '@/ui/components/actions/action-bar';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { OfferBrings, OfferExpiry, OfferPrice } from '@/ui/components/offers/offer-parts';
import { HelperCard } from '@/ui/components/people/helper-card';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useOfferStatus } from '@/ui/components/status/use-status';

export interface OfferDetailScreenProps {
  data: OfferDetailPageData;
  handlers: Pick<TaskOwnerHandlers, 'onOfferAction'>;
  now: ISODateTime;
}

export function OfferDetailScreen({ data, handlers, now }: OfferDetailScreenProps) {
  const t = useTranslations('offers');
  const { offer, task } = data;
  const status = useOfferStatus(offer.status, 'poster');
  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={routes.app.task(task.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline underline-offset-4"><ArrowLeft aria-hidden="true" className="size-4" />{t('backToTask')}</Link>
    <header className="space-y-3">
      <p className="text-sm text-muted-foreground">{task.title}</p>
      <h1 className="text-2xl/8 font-bold md:text-3xl/9.5">{t('offerFrom', { helper: offer.helper.displayName })}</h1>
      <div className="flex flex-wrap items-center gap-2"><StatusBadge {...status} />{offer.revision > 1 && <StatusBadge tone="neutral" label={t('updated')} />}</div>
    </header>
    <section aria-labelledby="offer-helper-title" className="space-y-3">
      <h2 id="offer-helper-title" className="text-xl/7 font-semibold md:text-[22px]/7.5">{t('helper')}</h2>
      <HelperCard helper={offer.helper} variant="full" />
    </section>
    <section aria-labelledby="offer-details-title" className="space-y-5 rounded-xl border border-border bg-card p-4 shadow-card md:p-6">
      <h2 id="offer-details-title" className="text-xl/7 font-semibold md:text-[22px]/7.5">{t('offer')}</h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1"><dt className="text-sm text-muted-foreground">{t('price')}</dt><dd className="text-xl font-semibold"><OfferPrice pricing={offer.pricing} /></dd></div>
        <div className="space-y-1"><dt className="text-sm text-muted-foreground">{t('proposedStart')}</dt><dd className="tabular-nums"><time dateTime={offer.proposedStart}>{formatDateTime(offer.proposedStart)}</time></dd></div>
      </dl>
      <div className="space-y-2"><h3 className="text-[17px]/6 font-semibold">{t('message')}</h3><p><MaskedText segments={offer.message} /></p>
        {offer.message.some((segment) => segment.kind === 'masked') && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t('maskedNote')}</p>}
      </div>
      <div className="space-y-2"><h3 className="text-[17px]/6 font-semibold">{t('brings')}</h3><OfferBrings brings={offer.brings} /></div>
      <OfferExpiry offer={offer} now={now} />
    </section>
    <PriceBreakdown breakdown={offer.breakdown} variant="poster" title={t('breakdownTitle')} />
    <p className="text-sm text-muted-foreground">{t('paymentNote')}</p>
    {data.otherPendingOffers > 0 && <Link href={`${routes.app.task(task.id)}#compare`} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary hover:underline underline-offset-4">{t('compareOthers', { count: data.otherPendingOffers })}</Link>}
    <ActionBar actions={offer.actions} onAction={(action) => handlers.onOfferAction({ offerId: offer.id, action: action as OfferActionId })} sticky />
  </div>;
}
