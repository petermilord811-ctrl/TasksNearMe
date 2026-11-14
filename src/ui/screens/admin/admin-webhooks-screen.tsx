import { useTranslations } from 'next-intl';
import type { AdminWebhookRow, AdminWebhooksHandlers, AdminWebhooksPageData, ISODateTime } from '@/contracts';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { AdminWebhookActions } from './admin-webhook-actions';
import { adminCard, adminH2, adminNote, adminSection } from './admin-ui';

function FailingEvent({ row, canAct, handlers, now }: { row: AdminWebhookRow; canAct: boolean; handlers: AdminWebhooksHandlers; now: ISODateTime }) {
  const t = useTranslations('adminWebhooks');
  const { formatDateTime, formatRelative } = useFormat();
  const label = `${t(`providers.${row.provider}`)} ${row.type || row.eventId}`;
  return <li className={cn(adminCard, 'space-y-3')}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-semibold">{t(`providers.${row.provider}`)} · <span className="font-mono text-sm break-all">{row.type || t('noType')}</span></p>
        <p className="font-mono text-xs break-all text-muted-foreground">{row.eventId}</p>
      </div>
      <StatusBadge tone={row.status === 'dead' ? 'danger' : 'warning'} label={t(`status.${row.status}`)} />
    </div>
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      <div><dt className="text-muted-foreground">{t('received')}</dt><dd><time dateTime={row.receivedAt} title={formatRelative(row.receivedAt, now)}>{formatDateTime(row.receivedAt)}</time></dd></div>
      <div><dt className="text-muted-foreground">{t('attempts')}</dt><dd className="tabular-nums">{row.attempts}</dd></div>
      <div><dt className="text-muted-foreground">{t('nextTry')}</dt><dd>{row.nextAttemptAt ? <time dateTime={row.nextAttemptAt}>{formatDateTime(row.nextAttemptAt)}</time> : t('noMoreTries')}</dd></div>
    </dl>
    {row.lastError && <div className="space-y-1"><p className="text-sm font-medium">{t('lastError')}</p><pre className="overflow-x-auto rounded-lg bg-muted p-2 text-xs whitespace-pre-wrap break-all">{row.lastError}</pre></div>}
    {!row.canReplay && <p className="text-sm text-muted-foreground">{t('cannotReplay')}</p>}
    {canAct && <AdminWebhookActions eventRowId={row.id} label={label} canReplay={row.canReplay} handlers={handlers} />}
  </li>;
}

/** `/admin/webhooks` (completion plan 5.11): what's failing in the webhook inbox, and whether events flow at all. */
export function AdminWebhooksScreen({ data, handlers, now }: { data: AdminWebhooksPageData; handlers: AdminWebhooksHandlers; now: ISODateTime }) {
  const t = useTranslations('adminWebhooks');
  return <div className="min-w-0 space-y-8 [overflow-wrap:anywhere]">
    <PageHeader title={t('title')} description={t('intro')} />
    <section aria-labelledby="webhooks-day" className="space-y-3">
      <h2 id="webhooks-day" className={adminH2}>{t('dayTitle')}</h2>
      <ul className="grid gap-3 sm:grid-cols-3">{data.last24h.map((item) => <li key={item.provider} className={adminSection}>
        <h3 className="font-semibold">{t(`providers.${item.provider}`)}</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          {(['processed', 'ignored', 'failed', 'dead'] as const).map((key) => <div key={key} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t(`counts.${key}`)}</dt>
            <dd className={cn('tabular-nums', (key === 'failed' || key === 'dead') && item[key] > 0 && 'font-semibold text-destructive')}>{item[key]}</dd>
          </div>)}
        </dl>
      </li>)}</ul>
    </section>
    <section aria-labelledby="webhooks-failing" className="space-y-3">
      <div><h2 id="webhooks-failing" className={adminH2}>{t('failingTitle')}</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('failingIntro')}</p></div>
      {data.failing.length === 0 ? <p className={adminNote}>{t('nothingFailing')}</p> : <ul className="space-y-3">{data.failing.map((row) => <FailingEvent key={row.id} row={row} canAct={data.canAct} handlers={handlers} now={now} />)}</ul>}
    </section>
  </div>;
}
