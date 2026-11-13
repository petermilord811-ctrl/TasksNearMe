'use client';

import { useId } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type MessageSegment, type OfferActionId, type OfferView, type TaskOwnerHandlers } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
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

/** Whether a helper wrote anything (a one-tap offer has no message). */
export const hasMessage = (segments: MessageSegment[]) => segments.some((segment) => segment.kind === 'masked' || segment.text.trim().length > 0);

/**
 * One helper's offer on the poster's task: who (rating, verifications), the price and the proposed start, their
 * message (contact details masked), when it expires, "Compare", and the actions. The card lifts a little on
 * hover; a card picked for comparison keeps a ring.
 */
export function OfferCard({ offer, now, selectable, onAction }: OfferCardProps) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('offers');
  const status = useOfferStatus(offer.status, 'poster');
  const id = useId();
  const selected = Boolean(selectable?.selected);

  return <article
    aria-labelledby={`${id}-title`}
    className={cn(
      'min-w-0 space-y-4 rounded-[1.375rem] border bg-card p-4 shadow-card transition-[transform,box-shadow,border-color] duration-300 ease-[var(--ease-out)] hover:shadow-[0_1px_2px_rgb(23_18_14/0.04),0_22px_44px_-26px_rgb(60_30_10/0.34)] motion-safe:hover:-translate-y-0.5 md:p-5 dark:hover:shadow-[0_1px_2px_rgb(0_0_0/0.4),0_22px_44px_-24px_rgb(0_0_0/0.75)]',
      selected ? 'border-primary/60 ring-2 ring-primary/20' : 'border-foreground/[0.07] dark:border-white/[0.06]',
    )}
  >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <InitialsAvatar initials={offer.helper.initials} photo={offer.helper.photo} />
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="font-display text-[17px]/6 font-semibold tracking-[-0.01em] md:text-lg/6.5">
            <Link href={routes.app.offer(offer.taskId, offer.id)} aria-label={t('viewOffer', { helper: offer.helper.displayName })} className="inline-flex min-h-11 items-center rounded-md underline-offset-4 transition-colors hover:text-primary hover:underline">{offer.helper.displayName}</Link>
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
    <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-2">
      <p className="font-display text-2xl/8 font-semibold tracking-[-0.015em]"><OfferPrice pricing={offer.pricing} /></p>
      <p className="flex items-start gap-2 text-sm tabular-nums"><CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><span className="block text-muted-foreground">{t('proposedStart')}</span><time dateTime={offer.proposedStart}>{formatDateTime(offer.proposedStart)}</time></span></p>
    </div>
    {/* The clamp sits inside the padding, so a third line never peeks into it. */}
    {hasMessage(offer.message) && <p className="rounded-2xl bg-foreground/[0.035] px-3.5 py-2.5 text-sm leading-6 dark:bg-white/[0.045]"><span className="line-clamp-2"><MaskedText segments={offer.message} /></span></p>}
    {offer.revision > 1 && <p className="text-sm font-medium text-muted-foreground">{t('updated')}</p>}
    <OfferExpiry offer={offer} now={now} />
    {selectable && <label className="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2.5 rounded-full border border-input px-4 py-2 text-sm font-medium transition-[background-color,border-color] duration-200 ease-[var(--ease-out)] hover:border-foreground/40 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/[0.07] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30">
      <input type="checkbox" checked={selectable.selected} onChange={selectable.onToggle} className="size-[1.125rem] shrink-0 cursor-pointer accent-primary focus-visible:outline-none" />
      <span className="min-w-0">{t('select', { helper: offer.helper.displayName })}</span>
    </label>}
    <ActionBar actions={offer.actions} onAction={(action) => onAction({ offerId: offer.id, action: action as OfferActionId })} />
  </article>;
}
