import { useTranslations } from 'next-intl';
import { percentText, type AdminConfigHandlers, type AdminConfigPageData, type BadgeTone, type ISODateTime, type PolicyVersionStatus } from '@/contracts';
import { formatDate, formatMoney } from '@/shared/format';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { AdminConfigControls, type AdminConfigPreviewState } from './admin-config-controls';

export interface AdminConfigScreenProps { data: AdminConfigPageData; handlers: AdminConfigHandlers; now: ISODateTime }

const statusTones: Record<PolicyVersionStatus, BadgeTone> = { draft: 'info', published: 'success', retired: 'neutral' };

export function AdminConfigScreen(props: AdminConfigScreenProps) { return <AdminConfigContent {...props} />; }

/** Admins: the market's policy versions and the feature flags (UI-038). */
export function AdminConfigContent({ data, handlers, ...preview }: AdminConfigScreenProps & AdminConfigPreviewState) {
  const t = useTranslations('adminConfig');
  const { current } = data;
  const summary = (values: AdminConfigPageData['current']['values']) => t('feesSummary', { poster: percentText(values.posterBps), minimum: formatMoney(values.posterMinCents), helper: percentText(values.helperBps) });
  return <div className="min-w-0 space-y-8 [overflow-wrap:anywhere]">
    <header className="space-y-2"><h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1><p className="text-muted-foreground">{t('intro', { market: data.market.name })}</p></header>
    <section aria-labelledby="config-policy" className="space-y-4">
      <div className="space-y-1"><h2 id="config-policy" className="font-heading text-xl font-semibold">{t('policyTitle')}</h2><p className="text-sm text-muted-foreground">{t('policyIntro')}</p></div>
      <div className="space-y-1 rounded-xl border bg-card p-4 shadow-card">
        <p className="font-semibold">{t('currentVersion', { version: current.version })}</p>
        <p className="text-sm tabular-nums">{summary(current.values)}</p>
        {current.publishedAt && <p className="text-sm text-muted-foreground"><time dateTime={current.publishedAt}>{current.publishedBy ? t('publishedBy', { date: formatDate(current.publishedAt), name: current.publishedBy }) : t('publishedOn', { date: formatDate(current.publishedAt) })}</time></p>}
      </div>
      <AdminConfigControls data={data} handlers={handlers} part="policy" {...preview} />
      <div className="space-y-3">
        <h3 className="font-heading text-lg font-semibold">{t('historyTitle')}</h3>
        <ul aria-label={t('historyCaption')} className="space-y-2">{data.history.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3">
          <div className="min-w-0 space-y-0.5"><p className="font-medium">{t('versionLabel', { version: item.version })}</p><p className="text-sm tabular-nums text-muted-foreground">{summary(item.values)}</p>{item.publishedAt && <p className="text-sm text-muted-foreground"><time dateTime={item.publishedAt}>{item.publishedBy ? t('publishedBy', { date: formatDate(item.publishedAt), name: item.publishedBy }) : t('publishedOn', { date: formatDate(item.publishedAt) })}</time></p>}</div>
          <StatusBadge tone={statusTones[item.status]} label={t(`statuses.${item.status}`)} />
        </li>)}</ul>
      </div>
    </section>
    <section aria-labelledby="config-flags" className="space-y-3">
      <div className="space-y-1"><h2 id="config-flags" className="font-heading text-xl font-semibold">{t('flagsTitle')}</h2><p className="text-sm text-muted-foreground">{t('flagsIntro')}</p></div>
      <AdminConfigControls data={data} handlers={handlers} part="flags" {...preview} />
    </section>
  </div>;
}
