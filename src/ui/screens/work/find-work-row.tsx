'use client';

import Link from 'next/link';
import { Bookmark, BookmarkCheck, CalendarDays, EyeOff, Hammer, Info, Laptop, Leaf, MapPin, Package, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CategorySlug, type FindWorkCard, type ISODateTime } from '@/contracts';
import { formatDate, formatDateTime, formatHours, formatMoney, formatRelative, formatTimeRange, marketDayKey } from '@/shared/format';
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

/**
 * One open task in the helper's list: what it is, where (the general area and a distance band), when, the
 * client's budget and what the helper would earn, how many offers it has, whether it's new, and whether
 * the helper can offer. Save and hide sit on the row.
 */
export function FindWorkRow({ card, now, active, onActiveChange, saved, onToggleSave, onHide, pending }: {
  card: FindWorkCard;
  now: ISODateTime;
  active: boolean;
  onActiveChange: (id: string | null) => void;
  saved: boolean;
  onToggleSave?: () => void;
  onHide?: () => void;
  pending?: boolean;
}) {
  const t = useTranslations('findWork');
  const card_ = useTranslations('taskCard');
  const location = useTranslations('location');
  const { task } = card;
  const Icon = categoryIcons[task.categorySlug];
  const schedule = task.schedule.flexible
    ? card_('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
    : marketDayKey(task.schedule.windowStart) === marketDayKey(task.schedule.windowEnd)
      ? formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd)
      : `${formatDate(task.schedule.windowStart)} – ${formatDate(task.schedule.windowEnd)}`;
  const budget = task.budget.type === 'fixed'
    ? formatMoney(task.budget.priceCents)
    : card_('hourlyBudget', { rate: formatMoney(task.budget.rateCents), cap: formatHours(task.budget.hoursCap) });
  const earn = card.earnings.type === 'fixed'
    ? t('earn', { amount: formatMoney(card.earnings.amountCents) })
    : t('earnHourly', { rate: formatMoney(card.earnings.rateCents) });
  const titleId = `find-work-${task.id}`;

  return <article
    aria-labelledby={titleId}
    onMouseEnter={() => onActiveChange(task.id)}
    onMouseLeave={() => onActiveChange(null)}
    onFocus={() => onActiveChange(task.id)}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onActiveChange(null); }}
    className={cn('flex min-w-0 gap-3 rounded-xl border bg-card p-3 shadow-card transition-[border-color,box-shadow] sm:gap-4 sm:p-4', active && 'border-primary ring-2 ring-primary/20')}
  >
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground sm:size-11"><Icon aria-hidden="true" className="size-5" /></span>
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h3 id={titleId} className="min-w-0 text-base/6 font-semibold">
          <Link href={routes.app.findWorkTask(task.id)} className="rounded-sm underline-offset-4 hover:text-primary hover:underline">{task.title}</Link>
          {card.isNew && <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full bg-badge-brand px-2 py-0.5 align-middle text-xs font-semibold text-badge-brand-foreground">{t('new')}</span>}
        </h3>
        <p className="text-right tabular-nums"><span className="block text-base font-semibold">{budget}</span><span className="block text-xs text-muted-foreground">{earn}</span></p>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">{task.location.kind === 'remote' ? <Laptop aria-hidden="true" className="size-4" /> : <MapPin aria-hidden="true" className="size-4" />}{task.location.kind === 'remote' ? card_('remote') : task.location.areaName}{task.location.kind === 'local' && task.location.distanceBand ? ` · ${location(`distance.${task.location.distanceBand}`)}` : ''}</span>
        <span className="inline-flex items-center gap-1.5 tabular-nums"><CalendarDays aria-hidden="true" className="size-4" />{schedule}</span>
        <span className="tabular-nums">{card_('offers', { count: task.offerCount })}</span>
      </p>
      {task.excerpt && <p className="line-clamp-2 text-sm text-foreground/80">{task.excerpt}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="min-w-0 text-sm">
          {card.myOffer ? <span className="inline-flex items-center gap-2"><span className="font-medium">{t('myOffer')}</span><OwnOffer status={card.myOffer.status} /></span>
            : card.blockedReason ? <span className="inline-flex items-start gap-1.5 text-muted-foreground"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(`blockedReasons.${card.blockedReason}`)}</span>
              : <time dateTime={task.postedAt} title={formatDateTime(task.postedAt)} className="text-muted-foreground tabular-nums">{card_('posted', { relative: formatRelative(task.postedAt, now) })}</time>}
        </div>
        {(onToggleSave || onHide) && <div className="flex items-center gap-1">
          {onToggleSave && <button type="button" onClick={onToggleSave} disabled={pending} aria-pressed={saved} aria-label={saved ? t('unsave', { title: task.title }) : t('save', { title: task.title })} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:text-primary">
            {saved ? <BookmarkCheck aria-hidden="true" className="size-5" /> : <Bookmark aria-hidden="true" className="size-5" />}
          </button>}
          {onHide && <button type="button" onClick={onHide} disabled={pending} aria-label={t('hide', { title: task.title })} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
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
    {card.myOffer ? <div className="space-y-2"><p className="text-sm font-medium">{t('myOffer')}</p><OwnOffer status={card.myOffer.status} /></div> : card.blockedReason && <p className="flex items-start gap-2 text-sm"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{t(`blockedReasons.${card.blockedReason}`)}</span></p>}
  </div>;
}
