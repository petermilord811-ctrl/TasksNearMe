'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type OfferActionId, type OfferDetailPageData, type OfferStatus, type TaskOwnerHandlers } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { ActionBar } from '@/ui/components/actions/action-bar';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { hasMessage } from '@/ui/components/offers/offer-card';
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
  const { formatDateTime, formatRelative } = useFormat();
  const t = useTranslations('offers');
  const { offer, task } = data;
  const status = useOfferStatus(offer.status, 'poster', { taskCanceled: offer.taskCanceled });
  // What it would cost to book only matters while the offer can be booked (audit M31).
  const open = offer.status === 'pending' || offer.status === 'stale';
  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={routes.app.task(task.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline underline-offset-4"><ArrowLeft aria-hidden="true" className="size-4" />{t('backToTask')}</Link>
    <header className="space-y-3">
      <p className="text-sm text-muted-foreground">{task.title}</p>
      <h1 className="text-2xl/8 font-bold md:text-3xl/9.5">{t('offerFrom', { helper: offer.helper.displayName })}</h1>
      <div className="flex flex-wrap items-center gap-2"><StatusBadge {...status} />{offer.revision > 1 && <StatusBadge tone="neutral" label={t('updated')} />}</div>
    </header>
    {!open && <p className="flex items-start gap-2.5 rounded-2xl bg-secondary/70 px-4 py-3.5 text-sm text-secondary-foreground">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {/* Declined by the task's cancellation, not by the client (sweep D9). */}
      <span>{offer.taskCanceled ? t('closedNotice.task_canceled') : t(`closedNotice.${offer.status as Exclude<OfferStatus, 'pending' | 'stale'>}`, { helper: offer.helper.displayName, relative: formatRelative(offer.expiresAt, now) })}</span>
    </p>}
    <section aria-labelledby="offer-helper-title" className="space-y-3">
      <h2 id="offer-helper-title" className="text-xl/7 font-semibold md:text-[22px]/7.5">{t('helper')}</h2>
      <HelperCard helper={offer.helper} variant="full" />
    </section>
    <section aria-labelledby="offer-details-title" className="space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card md:p-6 dark:border-white/[0.06]">
      <h2 id="offer-details-title" className="text-xl/7 font-semibold md:text-[22px]/7.5">{t('offer')}</h2>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 rounded-2xl bg-foreground/[0.035] p-3.5 dark:bg-white/[0.045]"><dt className="text-sm text-muted-foreground">{t('price')}</dt><dd className="font-display text-2xl/8 font-semibold tracking-[-0.015em]"><OfferPrice pricing={offer.pricing} /></dd></div>
        <div className="space-y-1 rounded-2xl bg-foreground/[0.035] p-3.5 dark:bg-white/[0.045]"><dt className="text-sm text-muted-foreground">{t('proposedStart')}</dt><dd className="font-medium tabular-nums"><time dateTime={offer.proposedStart}>{formatDateTime(offer.proposedStart)}</time></dd></div>
      </dl>
      <div className="space-y-2"><h3 className="text-[17px]/6 font-semibold">{t('message')}</h3>{hasMessage(offer.message) ? <p className="border-l-2 border-primary/40 pl-3.5 leading-7"><MaskedText segments={offer.message} /></p> : <p className="text-muted-foreground">{t('noMessage')}</p>}
        {offer.message.some((segment) => segment.kind === 'masked') && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t('maskedNote')}</p>}
      </div>
      <div className="space-y-2"><h3 className="text-[17px]/6 font-semibold">{t('brings')}</h3><OfferBrings brings={offer.brings} /></div>
      <OfferExpiry offer={offer} now={now} />
    </section>
    {open && <PriceBreakdown breakdown={offer.breakdown} variant="poster" title={t('breakdownTitle')} />}
    {open && <p className="text-sm text-muted-foreground">{t('paymentNote')}</p>}
    {data.otherPendingOffers > 0 && <Link href={`${routes.app.task(task.id)}#compare`} className="group/compare inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">{t('compareOthers', { count: data.otherPendingOffers })}<ArrowRight aria-hidden="true" className="size-4 transition-transform duration-300 ease-[var(--ease-out)] group-hover/compare:translate-x-0.5" /></Link>}
    <ActionBar actions={offer.actions} onAction={(action) => handlers.onOfferAction({ offerId: offer.id, action: action as OfferActionId })} sticky />
  </div>;
}
