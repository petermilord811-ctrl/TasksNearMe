'use client';

import Link from 'next/link';
import { Bookmark, BookmarkCheck, CalendarDays, Check, EyeOff, Hammer, Info, Laptop, Leaf, Loader2, MapPin, Package, Send, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CategorySlug, type FindWorkCard, type ISODateTime } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useOfferStatus } from '@/ui/components/status/use-status';
import { cn } from '@/ui/lib/utils';

export const categoryIcons: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};

/** "$60" or "$35/h": what the client offers, as the map's marker says it. */
export function useBudgetLabel() {
  const t = useTranslations('findWork');
  return (card: FindWorkCard) => (card.task.budget.type === 'fixed' ? formatMoney(card.task.budget.priceCents) : t('perHour', { rate: formatMoney(card.task.budget.rateCents) }));
}

function OwnOffer({ status }: { status: NonNullable<FindWorkCard['myOffer']>['status'] }) {
  const badge = useOfferStatus(status, 'helper');
  return <StatusBadge {...badge} />;
}

/** Offers that ended without a booking: the helper may offer again (audit M21), so the row says so and leads there. */
const CLOSED_OFFERS = ['expired', 'declined', 'withdrawn'] as const;
type ClosedOffer = (typeof CLOSED_OFFERS)[number];
const closedOfferOf = (card: FindWorkCard): ClosedOffer | undefined =>
  card.myOffer && (CLOSED_OFFERS as readonly string[]).includes(card.myOffer.status) ? (card.myOffer.status as ClosedOffer) : undefined;

/** Tasks the helper can't take (another service, outside their area…) fold to one compact row (audit M22); "finish setting up" doesn't, since it's every task. */
export const isFoldedCard = (card: FindWorkCard) => Boolean(card.blockedReason && card.blockedReason !== 'not_bookable');

/**
 * One open task in the helper's list: what it is, where (the general area and a distance band), when, the
 * client's budget and what the helper would earn, how many offers it has, whether it's new, and whether
 * the helper can offer. Save and hide sit on the row, and on fixed-price tasks the helper can take, the
 * one-tap offer at the poster's price (`quickOffer`: sending, then "Offer sent" until the list refreshes).
 */
export function FindWorkRow({ card, now, active, onActiveChange, saved, onToggleSave, onHide, pending, onQuickOffer, offerState }: {
  card: FindWorkCard;
  now: ISODateTime;
  active: boolean;
  onActiveChange: (id: string | null) => void;
  saved: boolean;
  onToggleSave?: () => void;
  onHide?: () => void;
  /** A save or hide on this row is on its way (the screen queues further taps, so those buttons stay usable). */
  pending?: boolean;
  onQuickOffer?: () => void;
  /** The one-tap offer on this row: being sent, or sent (until the list refreshes with the offer). */
  offerState?: 'sending' | 'sent';
}) {
  const { formatDate, formatDateTime, formatRelative, formatTime, formatTimeRange, dayKey } = useFormat();
  const t = useTranslations('findWork');
  const card_ = useTranslations('taskCard');
  const location = useTranslations('location');
  const { task } = card;
  const Icon = categoryIcons[task.categorySlug];
  const schedule = task.schedule.flexible
    ? card_('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
    : dayKey(task.schedule.windowStart) === dayKey(task.schedule.windowEnd)
      ? formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd)
      : `${formatDate(task.schedule.windowStart)} – ${formatDate(task.schedule.windowEnd)}`;
  const budget = task.budget.type === 'fixed'
    ? formatMoney(task.budget.priceCents)
    : card_('hourlyBudget', { rate: formatMoney(task.budget.rateCents), cap: formatHours(task.budget.hoursCap) });
  const earn = card.earnings.type === 'fixed'
    ? t('earn', { amount: formatMoney(card.earnings.amountCents) })
    : t('earnHourly', { rate: formatMoney(card.earnings.rateCents) });
  const titleId = `find-work-${task.id}`;
  const closed = closedOfferOf(card);
  // Live offers only: an expired one of yours isn't "no offers yet" in disguise.
  const offersLabel = closed && task.offerCount === 0 ? t('noLiveOffers') : card_('offers', { count: task.offerCount });

  if (isFoldedCard(card)) {
    return <article aria-labelledby={titleId} className="flex min-w-0 items-center gap-3 rounded-[1.125rem] border border-dashed border-border bg-card/60 py-2 pr-1.5 pl-3 sm:pl-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl opacity-75" style={{ background: `color-mix(in oklab, var(--cat-${task.categorySlug}) 12%, transparent)`, color: `var(--cat-${task.categorySlug})` }}><Icon aria-hidden="true" className="size-4" /></span>
      {/* The title on one line, the reason in full under it (no "New": it's not one to act on). */}
      <div className="min-w-0 flex-1 leading-tight">
        {/* At least 24 px tall to tap (WCAG 2.5.8; text-sm alone is 17.5): padding the negative margin gives back, so the
            row keeps its height, and above the reason line it reaches into. */}
        <h3 id={titleId} className="min-w-0 text-sm font-semibold">
          <Link href={routes.app.findWorkTask(task.id)} className="relative -my-1 block truncate rounded-sm py-1 text-foreground/85 underline-offset-4 hover:text-primary hover:underline">{task.title}</Link>
        </h3>
        <p className="mt-0.5 flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
          <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" /><span className="min-w-0"><span>{t(`blockedReasons.${card.blockedReason}`)}</span> <span aria-hidden="true">·</span> <span className="whitespace-nowrap tabular-nums">{budget}</span></span>
        </p>
      </div>
      {onHide && <button type="button" onClick={onHide} aria-label={t('hide', { title: task.title })} className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <EyeOff aria-hidden="true" className="size-4" />
      </button>}
    </article>;
  }

  return <article
    aria-labelledby={titleId}
    onMouseEnter={() => onActiveChange(task.id)}
    onMouseLeave={() => onActiveChange(null)}
    onFocus={() => onActiveChange(task.id)}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onActiveChange(null); }}
    className={cn('flex min-w-0 gap-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-3 shadow-card transition-[border-color,box-shadow] duration-300 ease-[var(--ease-out)] hover:shadow-[0_1px_2px_rgb(23_18_14/0.04),0_16px_32px_-20px_rgb(60_30_10/0.32)] sm:gap-4 sm:p-4 dark:border-white/[0.06]', active && 'border-primary ring-2 ring-primary/20')}
  >
    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl sm:size-11" style={{ background: `color-mix(in oklab, var(--cat-${task.categorySlug}) 15%, transparent)`, color: `var(--cat-${task.categorySlug})` }}><Icon aria-hidden="true" className="size-5" /></span>
    <div className="min-w-0 flex-1 space-y-2">
      {/* The pay sits right under the title at every width: beside a long title it wrapped under it, right-aligned. */}
      <div className="space-y-0.5">
        <h3 id={titleId} className="min-w-0 text-base/6 font-semibold">
          <Link href={routes.app.findWorkTask(task.id)} className="rounded-sm py-[3px] underline-offset-4 hover:text-primary hover:underline">{task.title}</Link>
          {card.isNew && <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full bg-badge-brand px-2 py-0.5 align-middle text-xs font-semibold text-badge-brand-foreground">{t('new')}</span>}
        </h3>
        <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums"><span className="text-base font-semibold">{budget}</span><span className="text-xs text-muted-foreground">{earn}</span></p>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">{task.location.kind === 'remote' ? <Laptop aria-hidden="true" className="size-4" /> : <MapPin aria-hidden="true" className="size-4" />}{task.location.kind === 'remote' ? card_('remote') : task.location.areaName}{task.location.kind === 'local' && task.location.distanceBand ? ` · ${location(`distance.${task.location.distanceBand}`)}` : ''}</span>
        <span className="inline-flex items-center gap-1.5 tabular-nums"><CalendarDays aria-hidden="true" className="size-4" />{schedule}</span>
        <span className="tabular-nums">{offersLabel}</span>
      </p>
      {task.excerpt && <p className="line-clamp-2 text-sm text-foreground/80">{task.excerpt}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {/* On a phone the note keeps the line beside save and hide: "You made an offer" over its status, never split. */}
        <div className="min-w-0 flex-1 basis-36 text-sm">
          {closed ? <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{t(`myOfferClosed.${closed}`)}</span>
              {!card.quickOffer && <Link href={routes.app.findWorkTask(task.id)} aria-label={t('offerAgainLabel', { title: task.title })} className="font-semibold text-primary underline-offset-4 hover:underline">{t('offerAgain')}</Link>}
            </span>
            : card.myOffer ? <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-medium whitespace-nowrap">{t('myOffer')}</span><OwnOffer status={card.myOffer.status} /></span>
            : card.blockedReason ? <span className="inline-flex items-start gap-1.5 text-muted-foreground"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(`blockedReasons.${card.blockedReason}`)}</span>
              : <time dateTime={task.postedAt} title={formatDateTime(task.postedAt)} className="text-muted-foreground tabular-nums">{card_('posted', { relative: formatRelative(task.postedAt, now) })}</time>}
        </div>
        {(onToggleSave || onHide || (card.quickOffer && onQuickOffer)) && <div className="ml-auto flex shrink-0 items-center gap-1">
          {card.quickOffer && onQuickOffer && (offerState === 'sent'
            ? <span className="mr-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-success"><Check aria-hidden="true" className="size-4" />{t('quickOfferSent')}</span>
            : <button
              type="button"
              onClick={onQuickOffer}
              disabled={pending || offerState === 'sending'}
              aria-label={t('quickOfferLabel', { price: formatMoney(card.quickOffer.priceCents), title: task.title, start: formatTime(card.quickOffer.proposedStart) })}
              title={t('quickOfferHint', { start: formatTime(card.quickOffer.proposedStart), earn: formatMoney(card.quickOffer.earningsCents) })}
              className="mr-1 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_6px_16px_-8px_var(--primary-glow)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-px hover:bg-primary-hover hover:shadow-[0_10px_22px_-10px_var(--primary-glow)] active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {offerState === 'sending' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Send aria-hidden="true" className="size-4" />}
              {t('quickOffer', { price: formatMoney(card.quickOffer.priceCents) })}
            </button>)}
          {onToggleSave && <button type="button" onClick={onToggleSave} aria-pressed={saved} aria-label={saved ? t('unsave', { title: task.title }) : t('save', { title: task.title })} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:text-primary">
            {saved ? <BookmarkCheck aria-hidden="true" className="size-5" /> : <Bookmark aria-hidden="true" className="size-5" />}
          </button>}
          {onHide && <button type="button" onClick={onHide} aria-label={t('hide', { title: task.title })} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <EyeOff aria-hidden="true" className="size-5" />
          </button>}
        </div>}
      </div>
    </div>
  </article>;
}

/** What a task card (the helper's home) says under it: the distance band, and the helper's own offer or why they can't offer. */
export function FindWorkCardContext({ card }: { card: FindWorkCard }) {
  const t = useTranslations('findWork');
  const location = useTranslations('location');
  return <div className="space-y-3">
    {card.task.location.kind === 'local' && card.task.location.distanceBand && <p className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 shrink-0" />{location(`distance.${card.task.location.distanceBand}`)}</p>}
    {closedOfferOf(card) ? <p className="text-sm font-medium">{t(`myOfferClosed.${closedOfferOf(card)!}`)}</p>
      : card.myOffer ? <div className="space-y-2"><p className="text-sm font-medium">{t('myOffer')}</p><OwnOffer status={card.myOffer.status} /></div> : card.blockedReason && <p className="flex items-start gap-2 text-sm"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{t(`blockedReasons.${card.blockedReason}`)}</span></p>}
  </div>;
}
