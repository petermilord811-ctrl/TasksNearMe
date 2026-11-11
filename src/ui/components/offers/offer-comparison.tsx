import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type OfferView } from '@/contracts';
import { formatDateTime, formatMoney } from '@/shared/format';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { RatingStars } from '@/ui/components/people/rating-stars';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { OfferBrings, OfferExpiry, OfferPrice } from './offer-parts';

export interface OfferComparisonProps { offers: OfferView[]; now: ISODateTime }

export function OfferComparison({ offers, now }: OfferComparisonProps) {
  const t = useTranslations('offers');
  const rows: { key: string; label: string; render: (offer: OfferView) => ReactNode }[] = [
    { key: 'price', label: t('price'), render: (offer) => <OfferPrice pricing={offer.pricing} /> },
    { key: 'total', label: t('total'), render: (offer) => <strong className="tabular-nums">{formatMoney(offer.breakdown.posterTotalCents)}</strong> },
    { key: 'start', label: t('proposedStart'), render: (offer) => <time dateTime={offer.proposedStart} className="tabular-nums">{formatDateTime(offer.proposedStart)}</time> },
    { key: 'rating', label: t('rating'), render: (offer) => <RatingStars rating={offer.helper.rating} /> },
    { key: 'completed', label: t('completed'), render: (offer) => <span className="tabular-nums">{t('completedCount', { count: offer.helper.completedCount })}</span> },
    { key: 'badges', label: t('badges'), render: (offer) => <VerificationBadges badges={offer.helper.badges} compact /> },
    { key: 'brings', label: t('brings'), render: (offer) => <OfferBrings brings={offer.brings} /> },
    { key: 'expires', label: t('expiry'), render: (offer) => <OfferExpiry offer={offer} now={now} /> },
  ];
  return <div className="min-w-0 space-y-4">
    <p className="text-sm text-muted-foreground">{t('comparisonDescription')}</p>
    <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-card md:block">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">{t('comparison')}</caption>
        <thead className="bg-secondary">
          <tr>
            <th scope="col" className="w-36 p-4 font-semibold">{t('comparisonFeature')}</th>
            {offers.map((offer) => <th key={offer.id} scope="col" className="p-4 align-top font-semibold"><Link href={routes.app.offer(offer.taskId, offer.id)} className="inline-flex min-h-11 items-center rounded-md hover:text-primary hover:underline underline-offset-4">{offer.helper.displayName}</Link></th>)}
          </tr>
        </thead>
        <tbody>{rows.map((row) => <tr key={row.key} className="border-t border-border">
          <th scope="row" className="break-words p-4 align-top font-medium text-muted-foreground">{row.label}</th>
          {offers.map((offer) => <td key={offer.id} className="break-words p-4 align-top">{row.render(offer)}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="space-y-4 md:hidden">{offers.map((offer) => <article key={offer.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-4 flex items-center gap-3"><InitialsAvatar initials={offer.helper.initials} /><h3 className="text-[17px]/6 font-semibold"><Link href={routes.app.offer(offer.taskId, offer.id)} className="inline-flex min-h-11 items-center rounded-md hover:text-primary hover:underline underline-offset-4">{offer.helper.displayName}</Link></h3></div>
      <dl className="divide-y divide-border">{rows.map((row) => <div key={row.key} className="space-y-2 py-3"><dt className="text-sm text-muted-foreground">{row.label}</dt><dd className="text-sm">{row.render(offer)}</dd></div>)}</dl>
    </article>)}</div>
  </div>;
}
