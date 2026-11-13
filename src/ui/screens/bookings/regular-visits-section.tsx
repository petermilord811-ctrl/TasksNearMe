import Link from 'next/link';
import { CalendarDays, ChevronRight, Repeat } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type SeriesSummary } from '@/contracts';
import { marketLocalToUtc } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { useScheduleWords } from '@/ui/components/series/schedule-words';
import { StatusBadge } from '@/ui/components/status/status-badge';

/** A market date ("2026-12-08") as a moment to format (midday in Austin). */
const dayAt = (day: string) => marketLocalToUtc(day, '12:00');

function RegularRow({ series }: { series: SeriesSummary }) {
  const t = useTranslations('bookings.regular');
  const card = useTranslations('taskCard');
  const { formatDate, formatDateTime } = useFormat();
  const words = useScheduleWords();
  const titleId = `regular-${series.id}`;
  return <article aria-labelledby={titleId} className="group relative min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium text-secondary-foreground">{card(`categories.${series.categorySlug}`)}</p>
      <div className="flex flex-wrap gap-2">
        {series.paymentDue && <StatusBadge tone="warning" label={t('paymentDue')} />}
        {series.status === 'paused' && <StatusBadge tone="neutral" label={t('paused')} />}
        {series.status === 'ended' && <StatusBadge tone="info" label={t('ending')} />}
      </div>
    </div>
    <div className="flex items-start justify-between gap-3">
      <h3 id={titleId} className="text-[17px]/6 font-semibold group-hover:text-primary md:text-lg/6.5">
        <Link href={routes.app.series(series.id)} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{series.title}</Link>
      </h3>
      <ChevronRight aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
    </div>
    <p className="text-sm">{t('with', { name: series.otherName })}</p>
    <p className="flex items-start gap-2 text-sm tabular-nums"><Repeat aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span>{words(series.schedule)}</span></p>
    <p className="flex items-start gap-2 text-sm tabular-nums text-muted-foreground">
      <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{series.status === 'paused' && series.pausedUntil
        ? t('pausedUntil', { date: formatDate(dayAt(series.pausedUntil)) })
        : series.nextVisit
          ? <time dateTime={series.nextVisit.start}>{t('next', { date: formatDateTime(series.nextVisit.start) })}</time>
          : t('noNext')}
        {series.endsOn && <>{' · '}{t('endsOn', { date: formatDate(dayAt(series.endsOn)) })}</>}</span>
    </p>
  </article>;
}

/** The viewer's regular visits on the bookings page, each opening its series. */
export function RegularVisitsSection({ regular }: { regular?: SeriesSummary[] }) {
  const t = useTranslations('bookings.regular');
  if (!regular || regular.length === 0) return null;
  return <section aria-labelledby="regular-visits-title" className="space-y-3">
    <h2 id="regular-visits-title" className="text-sm font-semibold text-muted-foreground">{t('title')}</h2>
    <ul className="grid gap-3 sm:grid-cols-2">{regular.map((series) => <li key={series.id} className="min-w-0"><RegularRow series={series} /></li>)}</ul>
  </section>;
}
