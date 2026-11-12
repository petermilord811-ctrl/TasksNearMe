import Link from 'next/link';
import { ArrowLeft, CircleAlert, Clock3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type ISODateTime, type ReportProblemHandlers, type ReportProblemPageData } from '@/contracts';
import { formatDate, formatRelative, formatTime } from '@/shared/format';
import { CompletionSummary } from '@/ui/components/bookings/completion-summary';
import { ReportProblemForm } from './report-problem-form';

export interface ReportProblemScreenProps {
  data: ReportProblemPageData;
  handlers: ReportProblemHandlers;
  now: ISODateTime;
}

export function ReportProblemScreen(props: ReportProblemScreenProps) {
  return <ReportProblemContent {...props} />;
}

/** Initial states support the preview gallery; app pages use ReportProblemScreen. */
export function ReportProblemContent({ data, handlers, now, initialResult, initialPending }: ReportProblemScreenProps & {
  initialResult?: ActionResult;
  initialPending?: boolean;
}) {
  const t = useTranslations('reportProblem');
  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={routes.app.booking(data.booking.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" />{t('backToBooking')}
    </Link>
    <header className="space-y-2">
      <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1>
      <p className="break-words font-medium">{data.booking.task.title}</p>
      <p className="text-muted-foreground">{t('intro')}</p>
    </header>
    {!data.unavailable && data.approvalDueAt && <aside className="flex items-start gap-3 rounded-xl border border-warning/40 bg-badge-warning p-4 text-badge-warning-foreground">
      <Clock3 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="space-y-2">
        <p className="tabular-nums">{t('deadline', { date: formatDate(data.approvalDueAt), time: formatTime(data.approvalDueAt) })}</p>
        <p className="text-sm tabular-nums">{t('deadlineRelative', { relative: formatRelative(data.approvalDueAt, now) })}</p>
      </div>
    </aside>}
    {data.unavailable && <section aria-label={t('unavailable.title')} className="space-y-3 rounded-xl border border-warning/40 bg-card p-4 sm:p-6">
      <h2 className="flex items-start gap-2 font-heading text-xl/7 font-semibold"><CircleAlert aria-hidden="true" className="mt-1 size-5 shrink-0 text-warning" />{t('unavailable.title')}</h2>
      <p>{t(`unavailable.${data.unavailable}`)}</p>
      {data.unavailable === 'window_passed' && <Link href={routes.help()} className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline underline-offset-4">{t('getHelp')}</Link>}
    </section>}
    {data.completion && <section aria-label={t('work')} className="space-y-3">
      <h2 className="font-heading text-xl/7 font-semibold md:text-[22px]/7.5">{t('work')}</h2>
      <CompletionSummary completion={data.completion} variant="poster" leadsPage />
    </section>}
    {!data.unavailable && <ReportProblemForm key={data.booking.id} data={data} handlers={handlers} initialResult={initialResult} initialPending={initialPending} />}
  </div>;
}
