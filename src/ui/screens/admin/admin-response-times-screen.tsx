import { useTranslations } from 'next-intl';
import type { AdminResponseTimesData, ISODateTime, QueueResponseTimes } from '@/contracts';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { cn } from '@/ui/lib/utils';
import { AdminCaseRows } from './admin-case-rows';

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'warning' }) {
  return <div className={cn('rounded-lg p-2', tone === 'danger' ? 'bg-badge-danger text-badge-danger-foreground' : tone === 'warning' ? 'bg-badge-warning text-badge-warning-foreground' : 'bg-muted')}>
    <dt className="text-xs">{label}</dt>
    <dd className="text-xl font-semibold tabular-nums">{value}</dd>
  </div>;
}

function useDuration() {
  const t = useTranslations('adminResponseTimes.duration');
  return (minutes: number) => {
    if (minutes < 60) return t('minutes', { minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('hours', { hours, minutes: minutes % 60 });
    return t('days', { days: Math.floor(hours / 24), hours: hours % 24 });
  };
}

function QueueCard({ stats }: { stats: QueueResponseTimes }) {
  const t = useTranslations('adminResponseTimes');
  const cases = useTranslations('adminCases');
  const duration = useDuration();
  const { week } = stats;
  return <li className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className="font-semibold">{cases(`queues.${stats.queue}`)}</h3>
      <span className="text-sm text-muted-foreground">{t('target', { hours: stats.firstReplyHours })}</span>
    </div>
    <dl className="grid grid-cols-3 gap-2 text-center">
      <Stat label={t('waiting')} value={stats.waitingOnStaff} />
      <Stat label={t('pastDue')} value={stats.pastDue} {...(stats.pastDue > 0 ? { tone: 'danger' as const } : {})} />
      <Stat label={t('dueSoon')} value={stats.dueSoon} {...(stats.dueSoon > 0 ? { tone: 'warning' as const } : {})} />
    </dl>
    <div className="space-y-1 border-t pt-3 text-sm">
      <p className="font-medium">{t('week.title')}</p>
      <p className="text-muted-foreground">
        {week.due === 0 ? t('week.noneDue', { opened: week.opened }) : t('week.onTime', { percent: Math.round((100 * week.onTime) / week.due), onTime: week.onTime, due: week.due })}
      </p>
      {week.medianFirstReplyMinutes !== undefined && <p className="text-muted-foreground">{t('week.median', { time: duration(week.medianFirstReplyMinutes) })}</p>}
    </div>
  </li>;
}

/**
 * `/admin/response-times`: each queue against its targets (now and over the last 7 days), the cases past
 * due and due within the hour, and who has the waiting cases.
 */
export function AdminResponseTimesScreen({ data, now }: { data: AdminResponseTimesData; now: ISODateTime }) {
  const t = useTranslations('adminResponseTimes');
  const cases = useTranslations('adminCases');
  return <div className="space-y-8">
    <header className="space-y-2">
      <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1>
      <p className="max-w-3xl text-muted-foreground">{t('intro', { hours: data.resolutionHours })}</p>
    </header>

    <section aria-labelledby="response-times-queues" className="space-y-3">
      <h2 id="response-times-queues" className="sr-only">{t('queuesTitle')}</h2>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.queues.map((stats) => <QueueCard key={stats.queue} stats={stats} />)}</ul>
    </section>

    <section aria-labelledby="response-times-past-due" className="space-y-3">
      <h2 id="response-times-past-due" className="text-xl font-semibold">{t('pastDueTitle')}</h2>
      {data.pastDue.length > 0 ? <AdminCaseRows items={data.pastDue} now={now} caption={t('pastDueTitle')} /> : <p className="rounded-xl border bg-card p-5 text-muted-foreground">{t('pastDueEmpty')}</p>}
    </section>

    <section aria-labelledby="response-times-due-soon" className="space-y-3">
      <h2 id="response-times-due-soon" className="text-xl font-semibold">{t('dueSoonTitle')}</h2>
      {data.dueSoon.length > 0 ? <AdminCaseRows items={data.dueSoon} now={now} caption={t('dueSoonTitle')} /> : <p className="rounded-xl border bg-card p-5 text-muted-foreground">{t('dueSoonEmpty')}</p>}
    </section>

    <section aria-labelledby="response-times-people" className="space-y-3">
      <h2 id="response-times-people" className="text-xl font-semibold">{t('peopleTitle')}</h2>
      {data.byAssignee.length === 0 ? <p className="rounded-xl border bg-card p-5 text-muted-foreground">{t('peopleEmpty')}</p> : <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('peopleTitle')}</caption>
          <thead className="text-left text-muted-foreground"><tr>
            <th scope="col" className="p-3 font-medium">{t('columns.person')}</th>
            <th scope="col" className="p-3 text-right font-medium">{t('columns.waiting')}</th>
            <th scope="col" className="p-3 text-right font-medium">{t('columns.pastDue')}</th>
          </tr></thead>
          <tbody>{data.byAssignee.map((row) => <tr key={row.staff?.id ?? 'unassigned'} className="border-t">
            <th scope="row" className="p-3 text-left font-normal">
              <span className="flex items-center gap-3">
                {row.staff ? <InitialsAvatar initials={row.staff.initials} size="sm" /> : null}
                <span className={cn(!row.staff && 'font-medium')}>{row.staff?.displayName ?? cases('unassigned')}</span>
              </span>
            </th>
            <td className="p-3 text-right tabular-nums">{row.waiting}</td>
            <td className={cn('p-3 text-right tabular-nums', row.pastDue > 0 && 'font-semibold text-destructive')}>{row.pastDue}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
