import { useTranslations } from 'next-intl';
import { percentText, type AdminConfigHandlers, type AdminConfigPageData, type BadgeTone, type ISODateTime, type PolicyVersionStatus } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { cn } from '@/ui/lib/utils';
import { AdminConfigControls, type AdminConfigPreviewState } from './admin-config-controls';
import { AdminReasonAction } from './admin-reason-action';
import { adminH2, adminPanel, adminSection } from './admin-ui';

export interface AdminConfigScreenProps { data: AdminConfigPageData; handlers: AdminConfigHandlers; now: ISODateTime }

const statusTones: Record<PolicyVersionStatus, BadgeTone> = { draft: 'info', published: 'success', retired: 'neutral' };

export function AdminConfigScreen(props: AdminConfigScreenProps) { return <AdminConfigContent {...props} />; }

/** Admins: the outage switch (completion plan 5.15), the market's policy versions and the feature flags (UI-038). */
export function AdminConfigContent({ data, handlers, outageOpen = false, ...preview }: AdminConfigScreenProps & AdminConfigPreviewState & { outageOpen?: boolean }) {
  const { formatDate, formatDateTime } = useFormat();
  const t = useTranslations('adminConfig');
  const { current, outage } = data;
  const market = data.market.name;
  const summary = (values: AdminConfigPageData['current']['values']) => t('feesSummary', { poster: percentText(values.posterBps), minimum: formatMoney(values.posterMinCents), helper: percentText(values.helperBps) });
  return <div className="min-w-0 space-y-8 [overflow-wrap:anywhere]">
    <PageHeader title={t('title')} description={t('intro', { market: data.market.name })} />
    <section aria-labelledby="config-outage" className="space-y-3">
      <div className="space-y-1"><h2 id="config-outage" className={adminH2}>{t('outage.title')}</h2><p className="text-sm text-muted-foreground">{t('outage.intro', { market })}</p></div>
      <div className={cn(adminSection, 'space-y-3', outage.paused && 'border-warning/40 dark:border-warning/40')}>
        <StatusBadge tone={outage.paused ? 'warning' : 'success'} label={outage.paused ? t('outage.paused') : t('outage.open')} />
        <p className="text-sm">{outage.paused ? t('outage.pausedBody') : t('outage.openBody')}</p>
        {outage.changed && <div className="space-y-0.5 text-sm text-muted-foreground">
          <p><time dateTime={outage.changed.at}>{t(outage.paused ? 'outage.pausedSince' : 'outage.openSince', { date: formatDateTime(outage.changed.at), name: outage.changed.by })}</time></p>
          <p>{t('outage.reason', { reason: outage.changed.reason })}</p>
        </div>}
        <AdminReasonAction
          trigger={outage.paused ? t('outage.resume') : t('outage.pause')}
          title={outage.paused ? t('outage.resumeTitle', { market }) : t('outage.pauseTitle', { market })}
          description={outage.paused ? t('outage.resumeDescription') : t('outage.pauseDescription')}
          submit={outage.paused ? t('outage.resume') : t('outage.pause')}
          pending={outage.paused ? t('outage.resuming') : t('outage.pausing')}
          destructive={!outage.paused}
          action={handlers.onSetOutage}
          payload={{ state: outage.paused ? 'open' : 'paused' }}
          field="reason"
          notAllowed={t('notAllowed')}
          initialOpen={outageOpen}
        />
      </div>
    </section>
    <section aria-labelledby="config-policy" className="space-y-4">
      <div className="space-y-1"><h2 id="config-policy" className={adminH2}>{t('policyTitle')}</h2><p className="text-sm text-muted-foreground">{t('policyIntro')}</p></div>
      <div className={cn(adminSection, 'space-y-1 border-success/25 dark:border-success/30')}>
        <p className="flex flex-wrap items-center gap-2 font-semibold"><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />{t('currentVersion', { version: current.version })}</p>
        <p className="text-sm tabular-nums">{summary(current.values)}</p>
        {current.publishedAt && <p className="text-sm text-muted-foreground"><time dateTime={current.publishedAt}>{current.publishedBy ? t('publishedBy', { date: formatDate(current.publishedAt), name: current.publishedBy }) : t('publishedOn', { date: formatDate(current.publishedAt) })}</time></p>}
      </div>
      <AdminConfigControls data={data} handlers={handlers} part="policy" {...preview} />
      <div className="space-y-3">
        <h3 className="font-display text-lg leading-6 font-semibold tracking-[-0.01em]">{t('historyTitle')}</h3>
        <ul aria-label={t('historyCaption')} className={cn(adminPanel, 'divide-y divide-foreground/[0.07] dark:divide-white/[0.07]')}>{data.history.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0 space-y-0.5"><p className="font-medium">{t('versionLabel', { version: item.version })}</p><p className="text-sm tabular-nums text-muted-foreground">{summary(item.values)}</p>{item.publishedAt && <p className="text-sm text-muted-foreground"><time dateTime={item.publishedAt}>{item.publishedBy ? t('publishedBy', { date: formatDate(item.publishedAt), name: item.publishedBy }) : t('publishedOn', { date: formatDate(item.publishedAt) })}</time></p>}</div>
          <StatusBadge tone={statusTones[item.status]} label={t(`statuses.${item.status}`)} />
        </li>)}</ul>
      </div>
    </section>
    <section aria-labelledby="config-flags" className="space-y-3">
      <div className="space-y-1"><h2 id="config-flags" className={adminH2}>{t('flagsTitle')}</h2><p className="text-sm text-muted-foreground">{t('flagsIntro')}</p></div>
      <AdminConfigControls data={data} handlers={handlers} part="flags" {...preview} />
    </section>
  </div>;
}
