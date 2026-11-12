'use client';

import { useId } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type OfferActionId, type OfferView, type TaskOwnerHandlers } from '@/contracts';
import { formatDateTime } from '@/shared/format';
import { cn } from '@/ui/lib/utils';
import { ActionBar } from '@/ui/components/actions/action-bar';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { RatingStars } from '@/ui/components/people/rating-stars';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useOfferStatus } from '@/ui/components/status/use-status';
import { OfferExpiry, OfferPrice } from './offer-parts';

export interface OfferCardProps {
  offer: OfferView;
  now: ISODateTime;
  selectable?: { selected: boolean; onToggle(): void };
  onAction: TaskOwnerHandlers['onOfferAction'];
}

export function OfferCard({ offer, now, selectable, onAction }: OfferCardProps) {
  const t = useTranslations('offers');
  const status = useOfferStatus(offer.status, 'poster');
  const id = useId();

  return <article aria-labelledby={`${id}-title`} className={cn('min-w-0 space-y-4 rounded-xl border bg-card p-4 shadow-card md:p-5', selectable?.selected ? 'border-primary ring-1 ring-primary' : 'border-border')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <InitialsAvatar initials={offer.helper.initials} photo={offer.helper.photo} />
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="text-[17px]/6 font-semibold md:text-lg/6.5">
            <Link href={routes.app.offer(offer.taskId, offer.id)} aria-label={t('viewOffer', { helper: offer.helper.displayName })} className="inline-flex min-h-11 items-center rounded-md hover:text-primary hover:underline underline-offset-4">{offer.helper.displayName}</Link>
          </h3>
          <RatingStars rating={offer.helper.rating} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {offer.isNew && <StatusBadge tone="brand" label={t('new')} />}
        {offer.status !== 'pending' && <StatusBadge {...status} />}
      </div>
    </div>
    <VerificationBadges badges={offer.helper.badges} compact />
    <div className="space-y-2">
      <p className="text-xl font-semibold"><OfferPrice pricing={offer.pricing} /></p>
      <p className="flex items-start gap-2 text-sm tabular-nums"><CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><span className="block text-muted-foreground">{t('proposedStart')}</span><time dateTime={offer.proposedStart}>{formatDateTime(offer.proposedStart)}</time></span></p>
    </div>
    <p className="line-clamp-2 text-sm leading-5"><MaskedText segments={offer.message} /></p>
    {offer.revision > 1 && <p className="text-sm font-medium text-muted-foreground">{t('updated')}</p>}
    <OfferExpiry offer={offer} now={now} />
    {selectable && <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-3 py-2 text-sm font-medium">
      <input type="checkbox" checked={selectable.selected} onChange={selectable.onToggle} className="size-5 shrink-0 accent-primary" />
      <span>{t('select', { helper: offer.helper.displayName })}</span>
    </label>}
    <ActionBar actions={offer.actions} onAction={(action) => onAction({ offerId: offer.id, action: action as OfferActionId })} />
  </article>;
}
