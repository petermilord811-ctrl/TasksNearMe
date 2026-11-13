import Link from 'next/link';
import { ArrowLeft, CalendarClock, CreditCard, MapPin, Repeat, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type BadgeTone, type ISODateTime, type SeriesHandlers, type SeriesPageData, type SeriesVisitState, type SeriesVisitView, type SeriesView } from '@/contracts';
import { formatHours, marketLocalToUtc } from '@/shared/format';
import { backArrow, backLink, note, pageTitle, sectionTitle, surface, surfacePad, warningPanel } from '@/ui/components/bookings/surface';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { useScheduleWords } from '@/ui/components/series/schedule-words';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { SeriesActions } from './series-actions';
import { VisitActions } from './visit-actions';

export interface SeriesScreenProps {
  data: SeriesPageData;
  handlers: SeriesHandlers;
  now: ISODateTime;
}

const visitTones: Record<SeriesVisitState, BadgeTone> = { scheduled: 'info', payment_due: 'warning', booked: 'success', completed: 'neutral', skipped: 'neutral', canceled: 'neutral' };

/** A market date ("2026-12-21") as an instant to format as a day. */
const dayOf = (date: string) => marketLocalToUtc(date, '12:00');

function useSeriesStatus(series: SeriesView): { tone: BadgeTone; label: string } {
  const t = useTranslations('series');
  const { formatDate } = useFormat();
  switch (series.status) {
    case 'paused':
      return { tone: 'warning', label: t('status.paused', { date: series.pausedUntil ? formatDate(dayOf(series.pausedUntil)) : '' }) };
    case 'ended':
      return series.endsOn && series.upcoming.some((visit) => visit.state === 'booked' || visit.state === 'scheduled' || visit.state === 'payment_due')
        ? { tone: 'info', label: t('status.ending', { date: formatDate(dayOf(series.endsOn)) }) }
        : { tone: 'neutral', label: t('status.ended') };
    case 'canceled':
      return { tone: 'neutral', label: t('status.canceled') };
    default:
      return { tone: 'success', label: t('status.active') };
  }
}

/** One visit: when, its state (and what happens next), and its actions. */
function VisitRow({ visit, series, handlers }: { visit: SeriesVisitView; series: SeriesView; handlers: SeriesHandlers }) {
  const t = useTranslations('series');
  const { formatDate, formatDateTime, formatTimeRange } = useFormat();
  const client = series.viewerRole === 'poster';
  const other = client ? series.helper.displayName : series.client.displayName;
  const skipper = visit.skippedBy === 'poster' ? series.client.displayName : visit.skippedBy === 'helper' ? series.helper.displayName : '';
  const skippedByMe = (visit.skippedBy === 'poster' && client) || (visit.skippedBy === 'helper' && !client);
  const detail = visit.state === 'scheduled' && visit.chargeAt
    ? client ? t('visit.chargeAtPoster', { date: formatDateTime(visit.chargeAt) }) : t('visit.chargeAtHelper', { name: other, date: formatDateTime(visit.chargeAt) })
    : visit.state === 'payment_due' && visit.payBy
      ? client ? t('visit.payByPoster', { date: formatDateTime(visit.payBy) }) : t('visit.payByHelper', { name: other, date: formatDateTime(visit.payBy) })
      : visit.state === 'skipped' && visit.skippedBy
        ? skippedByMe ? t('skippedByYou') : t(`skippedBy.${visit.skippedBy}`, { name: skipper })
        : undefined;
  return <li className={cn(surface, 'flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5', visit.state === 'payment_due' && client && 'border-warning/45')}>
    <div className="min-w-0 space-y-1.5">
      <p className="font-medium tabular-nums">
        <time dateTime={visit.start}>{formatDate(visit.start)}</time>
        <span aria-hidden="true"> · </span>
        <span>{formatTimeRange(visit.start, visit.end)}</span>
      </p>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{t('visit.number', { index: visit.index })}</span>
        <StatusBadge tone={visitTones[visit.state]} label={t(`state.${visit.state}`)} />
      </p>
      {detail && <p className="text-sm tabular-nums">{detail}</p>}
      {client && visit.state === 'payment_due' && visit.failure && <p className="text-sm text-muted-foreground">{t(`failure.${visit.failure}`)}</p>}
    </div>
    <VisitActions visit={visit} role={series.viewerRole} otherName={other} onSkipVisit={handlers.onSkipVisit} />
  </li>;
}

/**
 * Regular visits (`routes.app.series(id)`), for the client or the helper: how they repeat, the card (the client)
 * or when the client's card is charged (the helper), the next visits with what happens to each, the series'
 * actions, one visit's numbers, and the visits already past. Everything shown comes from the server.
 */
export function SeriesScreen({ data, handlers }: SeriesScreenProps) {
  const t = useTranslations('series');
  const categories = useTranslations('helperCard.categories');
  const payments = useTranslations('payments');
  const { formatDate } = useFormat();
  const words = useScheduleWords();
  const { series } = data;
  const client = series.viewerRole === 'poster';
  const other = client ? series.helper : series.client;
  const status = useSeriesStatus(series);
  // The other person stopped or is ending it: say who.
  const byOther = series.stoppedBy !== undefined && series.stoppedBy === (client ? 'helper' : 'poster');
  const statusNote = series.status === 'paused' && series.pausedUntil ? t('notes.paused', { date: formatDate(dayOf(series.pausedUntil)) })
    : series.status === 'ended' && series.endsOn ? t(byOther ? 'notes.endingByOther' : 'notes.ending', { date: formatDate(dayOf(series.endsOn)), name: other.displayName })
      : series.status === 'canceled' ? t(byOther ? 'notes.canceledByOther' : 'notes.canceled', { name: other.displayName }) : undefined;

  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={routes.app.bookings()} className={backLink}><ArrowLeft aria-hidden="true" className={backArrow} />{t('back')}</Link>
    <header className="space-y-3">
      <StatusBadge tone={status.tone} label={status.label} icon={<Repeat />} />
      <h1 className={pageTitle}>{series.task.title}</h1>
      <p className="text-muted-foreground">{t(client ? 'withHelper' : 'withClient', { name: other.displayName })}</p>
    </header>

    <section aria-labelledby="series-schedule" className={cn(surface, surfacePad, 'space-y-3')}>
      <h2 id="series-schedule" className={sectionTitle}>{t('scheduleTitle')}</h2>
      <p className="flex items-start gap-2.5"><Repeat aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><span className="font-medium">{words(series.schedule)}</span></p>
      <p className="flex items-start gap-2.5"><CalendarClock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><span>{t('length', { hours: formatHours(series.schedule.durationMinutes / 60) })}</span></p>
      <p className="flex items-start gap-2.5"><MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><span>{t('place', { category: categories(series.task.categorySlug), area: series.task.areaName })}</span></p>
      <p className="text-sm text-muted-foreground">
        {t('since', { date: formatDate(series.startedAt) })}<span aria-hidden="true"> · </span>{t('completed', { count: series.completedCount })}
      </p>
      {client && series.card && <p className={cn(note, 'flex items-start gap-2.5')}><CreditCard aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span className="tabular-nums">{t('payment.charged', { card: payments('cardLabel', { brand: payments(`brands.${series.card.brand}`), last4: series.card.last4 }) })}</span></p>}
      {client && series.card === null && <p role="status" className={cn(warningPanel, 'flex items-start gap-2.5 px-4 py-3.5 text-sm')}><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{t('payment.missing')}</span></p>}
      {!client && <p className={note}>{t('payment.helper', { name: other.displayName })}</p>}
      {statusNote && <p className={note}>{statusNote}</p>}
    </section>

    <SeriesActions data={data} handlers={handlers} />

    <section aria-labelledby="series-upcoming" className="space-y-3">
      <h2 id="series-upcoming" className={sectionTitle}>{t('upcoming')}</h2>
      {series.upcoming.length > 0
        ? <ol className="space-y-3">{series.upcoming.map((visit) => <VisitRow key={visit.id} visit={visit} series={series} handlers={handlers} />)}</ol>
        : <p className="text-muted-foreground">{t('noUpcoming')}</p>}
    </section>

    <PriceBreakdown breakdown={series.breakdown} variant={series.viewerRole} title={t(client ? 'perVisitTotal' : 'perVisitEarnings')} />

    {series.past.length > 0 && <section aria-labelledby="series-past" className="space-y-3">
      <h2 id="series-past" className={sectionTitle}>{t('past')}</h2>
      <ol className="space-y-3">{series.past.map((visit) => <VisitRow key={visit.id} visit={visit} series={series} handlers={handlers} />)}</ol>
    </section>}
  </div>;
}
