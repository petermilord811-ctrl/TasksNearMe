import { useTranslations } from 'next-intl';
import type { AdminJobRow, AdminJobsPageData, ISODateTime } from '@/contracts';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { adminCard, adminH2, adminNote, adminSection } from './admin-ui';

function Duration({ ms }: { ms: number }) {
  const t = useTranslations('adminJobs');
  return <span className="tabular-nums">{ms < 10_000 ? t('durationMs', { ms }) : t('durationS', { seconds: Math.round(ms / 100) / 10 })}</span>;
}

function Job({ job }: { job: AdminJobRow }) {
  const t = useTranslations('adminJobs');
  const { formatDateTime } = useFormat();
  const [last, ...earlier] = job.lastRuns;
  return <li className={cn(adminCard, 'space-y-3')}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <p className="min-w-0 font-mono text-sm font-semibold break-all">{job.name}</p>
      <StatusBadge tone={!last ? 'neutral' : last.ok ? 'success' : 'danger'} label={t(`result.${!last ? 'none' : last.ok ? 'ok' : 'failed'}`)} />
    </div>
    {last && <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">{t('lastRun')}</dt><dd><time dateTime={last.at}>{formatDateTime(last.at)}</time></dd></div>
      <div><dt className="text-muted-foreground">{t('took')}</dt><dd><Duration ms={last.durationMs} /></dd></div>
    </dl>}
    {job.failuresInARow > 0 && <p className="text-sm font-medium text-destructive">{t('failuresInARow', { count: job.failuresInARow })} <span className="font-normal text-muted-foreground">{t('pagesAt')}</span></p>}
    {last?.error && <div className="space-y-1"><p className="text-sm font-medium">{t('lastError')}</p><pre className="overflow-x-auto rounded-lg bg-muted p-2 text-xs whitespace-pre-wrap">{last.error}</pre></div>}
    {earlier.length > 0 && <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{t('earlier')}</p>
      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {earlier.map((run) => <li key={run.at}><time dateTime={run.at}>{formatDateTime(run.at)}</time> · <span className={run.ok ? undefined : 'text-destructive'}>{t(`result.${run.ok ? 'ok' : 'failed'}`)}</span> · <Duration ms={run.durationMs} /></li>)}
      </ol>
    </div>}
  </li>;
}

/**
 * `/admin/jobs` (when things break, 2026-11-21): what the job runner did on this server, read-only, for admins and
 * finance. Kept in memory by the server process, so it says since when: a deploy or a restart starts it over.
 */
export function AdminJobsScreen({ data }: { data: AdminJobsPageData; now: ISODateTime }) {
  const t = useTranslations('adminJobs');
  const { formatDateTime } = useFormat();
  const tone = data.health === 'ok' ? 'success' : data.health === 'stalled' ? 'danger' : data.health === 'starting' ? 'info' : 'neutral';
  return <div className="min-w-0 space-y-8 [overflow-wrap:anywhere]">
    <PageHeader title={t('title')} description={t('intro')} />
    <section aria-labelledby="jobs-runner" className={cn(adminSection, 'space-y-3')}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="jobs-runner" className={adminH2}>{t('health.label')}</h2>
        <StatusBadge tone={tone} label={t(`health.${data.health}`)} />
      </div>
      {data.since ? <p className="text-sm text-muted-foreground">{t('since', { time: formatDateTime(data.since) })}</p> : <p className="text-sm text-muted-foreground">{t('notRunning')}</p>}
      {data.health === 'stalled' && data.runningSince && <p className="text-sm font-medium text-destructive">{t('stalled', { time: formatDateTime(data.runningSince) })}</p>}
      {data.since && <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{t('lastFinished')}</dt><dd>{data.lastFinishedAt ? <time dateTime={data.lastFinishedAt}>{formatDateTime(data.lastFinishedAt)}</time> : t('notYet')}</dd></div>
        <div><dt className="text-muted-foreground">{t('nextRun')}</dt><dd>{data.nextRunAt ? <><time dateTime={data.nextRunAt}>{formatDateTime(data.nextRunAt)}</time> · {t('every', { seconds: data.everySeconds })}</> : t('notYet')}</dd></div>
      </dl>}
    </section>
    <section aria-labelledby="jobs-list" className="space-y-3">
      <h2 id="jobs-list" className={adminH2}>{t('jobsTitle')}</h2>
      {data.since ? <ul className="grid gap-3 lg:grid-cols-2">{data.jobs.map((job) => <Job key={job.name} job={job} />)}</ul> : <p className={adminNote}>{t('notRunning')}</p>}
    </section>
  </div>;
}
