import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, Check, MapPin, Route } from 'lucide-react';
import { routes, type BadgeTone, type NeighborhoodDayCardView, type NeighborhoodDayState } from '@/contracts';
import { formatMoney, marketLocalToUtc } from '@/shared/format';
import { cn } from '@/ui/lib/utils';
import { useFormat } from '@/ui/lib/format';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';

const tones: Record<NeighborhoodDayState, BadgeTone> = { open: 'brand', filling: 'warning', full: 'info', past: 'neutral', canceled: 'neutral' };

export interface NeighborhoodDayCardProps {
  day: NeighborhoodDayCardView;
  headingLevel?: 2 | 3;
  /** The request dialog: the visit being requested, marked as the viewer's pick. */
  currentSlotId?: string;
  /** The request dialog: the other visits replace its address, so the dialog stays open on the new pick. */
  replaceLinks?: boolean;
  /** Without the visit links (the helper's own page, previews of the card alone). */
  linkVisits?: boolean;
  footer?: ReactNode;
  className?: string;
}

/**
 * A neighborhood day (2026-11-24): "Jordan's neighborhood day · Hyde Park · Sat, Dec 6 · 3 of 6 visits open · $50 a
 * visit". Open visits link to the request dialog on that visit; taken and closed ones say so. Only the neighborhood's
 * name, never an address.
 */
export function NeighborhoodDayCard({ day, headingLevel = 3, currentSlotId, replaceLinks = false, linkVisits = true, footer, className }: NeighborhoodDayCardProps) {
  const t = useTranslations('neighborhoodDays');
  const categories = useTranslations('helperProfile.categories');
  const { formatDate, formatTimeRange } = useFormat(day.timeZone);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const date = formatDate(marketLocalToUtc(day.date, '12:00', day.timeZone));
  const live = day.state === 'open' || day.state === 'filling';
  const links = linkVisits && !day.own && live;
  const note = day.state === 'full' ? t('fullNote') : day.state === 'past' ? t('pastNote') : day.state === 'canceled' ? t('canceledNote', { name: day.helper.displayName })
    : day.own ? t('ownNote') : t('forArea', { area: day.areaName, name: day.helper.displayName });
  return <article data-neighborhood-day={day.id} data-state={day.state} className={cn('flex min-w-0 flex-col gap-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card md:p-5 dark:border-white/[0.06]', className)}>
    <div className="flex items-start gap-3">
      <InitialsAvatar initials={day.helper.initials} size="sm" {...(day.helper.photo ? { photo: day.helper.photo } : {})} />
      <div className="min-w-0 flex-1 space-y-1">
        <Heading className="font-display text-lg/6 font-semibold tracking-[-0.015em]">{t('cardTitle', { name: day.helper.displayName })}</Heading>
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 shrink-0" />{t('where', { area: day.areaName, date })}</p>
      </div>
      <StatusBadge size="sm" label={t(`state.${day.state}`)} tone={tones[day.state]} />
    </div>
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p className="font-medium">{categories(day.categorySlug)}</p>
      <p className="tabular-nums">
        <span className="font-semibold">{t('visitPrice', { price: formatMoney(day.visitPriceCents) })}</span>
        {day.usualPriceCents !== undefined && <span className="ml-2 text-sm text-muted-foreground"><span className="sr-only">{t('neighborPrice')}: </span><s>{t('usualPrice', { price: formatMoney(day.usualPriceCents) })}</s></span>}
      </p>
    </div>
    {day.usualPriceCents !== undefined && <p className="-mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-primary"><Route aria-hidden="true" className="size-3.5" />{t('neighborPrice')}</p>}
    {day.totalCount > 0 && <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium tabular-nums"><CalendarDays aria-hidden="true" className="size-4 shrink-0 text-primary" />{t('openOf', { open: day.openCount, total: day.totalCount })}</p>
      <ul aria-label={t('visitsLabel')} className="flex flex-wrap gap-2">
        {day.visits.map((visit) => {
          const times = formatTimeRange(visit.start, visit.end);
          const current = visit.slotId === currentSlotId;
          const chip = 'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm tabular-nums';
          if (current) return <li key={visit.slotId}><span aria-current="true" className={cn(chip, 'border-primary bg-primary text-primary-foreground')}><Check aria-hidden="true" className="size-4" /><time dateTime={visit.start}>{times}</time><span className="sr-only"> · {t('visit.current')}</span></span></li>;
          if (visit.state === 'open' && links) {
            return <li key={visit.slotId}><Link href={routes.app.requestHelper(day.helper.handle, { slotId: visit.slotId })} replace={replaceLinks} scroll={!replaceLinks} aria-label={t('visit.pickLabel', { times })} className={cn(chip, 'border-primary/40 bg-brand-soft font-medium text-foreground transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring')}><time dateTime={visit.start}>{times}</time></Link></li>;
          }
          return <li key={visit.slotId}><span className={cn(chip, visit.state === 'open' ? 'border-primary/30 text-foreground' : 'border-foreground/[0.07] bg-muted/50 text-muted-foreground')}>
            <time dateTime={visit.start} className={visit.state === 'closed' ? 'line-through' : undefined}>{times}</time>
            {visit.state !== 'open' && <span className="text-xs font-medium">{t(`visit.${visit.state}`)}</span>}
          </span></li>;
        })}
      </ul>
    </div>}
    <p className="text-sm text-muted-foreground">{note}</p>
    {footer}
  </article>;
}

/** A short row of day cards (Neighbors, the profile). */
export function NeighborhoodDayList({ days, title, intro, headingId }: { days: NeighborhoodDayCardView[]; title: string; intro?: string; headingId: string }) {
  return <section aria-labelledby={headingId} className="space-y-3">
    <div className="space-y-1">
      <h2 id={headingId} className="font-display text-xl/7 font-semibold tracking-[-0.015em]">{title}</h2>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
    </div>
    <ul className="grid gap-4 md:grid-cols-2">{days.map((day) => <li key={day.id} className="min-w-0"><NeighborhoodDayCard day={day} /></li>)}</ul>
  </section>;
}
