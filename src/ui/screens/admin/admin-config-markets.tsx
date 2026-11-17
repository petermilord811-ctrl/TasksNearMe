import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ActionHandler, ActionResult, AdminMarketRow, AdminMarketStatus, AdminMarketStatusAction, BadgeTone, MarketStatusChangeInput } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { cn } from '@/ui/lib/utils';
import { AdminReasonAction } from './admin-reason-action';
import { adminH2, adminSection } from './admin-ui';

const statusTones: Record<AdminMarketStatus, BadgeTone> = { prelaunch: 'info', live: 'success', paused: 'neutral' };

export interface AdminMarketsPreviewState {
  /** Previews: one market's confirm step open (`status` is the action), optionally showing a result's failure. */
  marketDialog?: { marketId: string; status: AdminMarketStatus; result?: ActionResult };
}

/**
 * The config page's Markets section (completion plan 8.2): every market's status, the ZIP3 prefixes it covers, its
 * time zone, the helpers waiting for it and its waitlist, with the actions the app sends (admins: pre-launch, live,
 * pause, each with a reason and a confirm step that says what the move does). `readOnly`: staff who aren't admins.
 */
export function AdminMarketsSection({ markets, onSetMarketStatus, readOnly = false, marketDialog }: { markets: AdminMarketRow[]; onSetMarketStatus?: ActionHandler<MarketStatusChangeInput>; readOnly?: boolean } & AdminMarketsPreviewState) {
  const t = useTranslations('adminConfig.markets');
  return <section aria-labelledby="config-markets" className="space-y-3">
    <div className="space-y-1">
      <h2 id="config-markets" className={adminH2}>{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
      {readOnly && <p className="text-sm font-medium">{t('readOnly')}</p>}
    </div>
    {markets.length === 0
      ? <p className={cn(adminSection, 'text-sm text-muted-foreground')}>{t('empty')}</p>
      : <ul aria-label={t('listLabel')} className="grid gap-3 lg:grid-cols-2">
        {markets.map((market) => <MarketCard key={market.id} market={market} onSetMarketStatus={onSetMarketStatus} marketDialog={marketDialog?.marketId === market.id ? marketDialog : undefined} />)}
      </ul>}
  </section>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-0.5"><dt className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">{label}</dt><dd className="text-sm tabular-nums">{children}</dd></div>;
}

function MarketCard({ market, onSetMarketStatus, marketDialog }: { market: AdminMarketRow; onSetMarketStatus?: ActionHandler<MarketStatusChangeInput>; marketDialog?: AdminMarketsPreviewState['marketDialog'] }) {
  const t = useTranslations('adminConfig.markets');
  const { formatDateTime } = useFormat();
  const { name, waitlist } = market;
  const headingId = `market-${market.id}`;
  const email = waitlist.queued > 0
    ? t('emailSending', { told: waitlist.told, queued: waitlist.queued })
    : waitlist.told > 0
      ? t('emailSent', { count: waitlist.told })
      : market.status === 'live' ? t('emailNone') : t('emailLater', { count: waitlist.toTell });
  const describe = (action: AdminMarketStatusAction) => [
    t(`confirm.leads.${action.id}`, { name, from: market.status }),
    ...(action.helpersIn > 0 ? [t('confirm.helpersIn', { count: action.helpersIn })] : []),
    ...(action.id === 'live' ? [t('confirm.waitlistEmails', { count: action.waitlistEmails })] : []),
  ].join(' ');
  return <li aria-labelledby={headingId} className={cn(adminSection, 'min-w-0 space-y-4', market.openingRefused && 'border-warning/40 dark:border-warning/40')}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 id={headingId} className="font-display text-lg leading-6 font-semibold tracking-[-0.01em]">{t('name', { name, state: market.state })}</h3>
      <StatusBadge tone={statusTones[market.status]} label={t(`statuses.${market.status}`)} />
    </div>
    <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      <Fact label={t('zips')}>{market.zipPrefixes.length > 0 ? market.zipPrefixes.join(', ') : t('noZips')}</Fact>
      <Fact label={t('timeZone')}>{market.timeZone}</Fact>
      <Fact label={market.status === 'paused' ? t('helpersWaiting') : t('helpersSettling')}>{t('helpers', { count: market.helpersWaiting })}</Fact>
      <Fact label={t('waitlist')}>{t('waitlistEntries', { count: waitlist.entries })}</Fact>
      <Fact label={t('email')}>{email}</Fact>
    </dl>
    {market.lastChange && <div className="space-y-0.5 text-sm text-muted-foreground">
      <p><time dateTime={market.lastChange.at}>{t('lastChange', { status: t(`statuses.${market.lastChange.to}`), date: formatDateTime(market.lastChange.at), name: market.lastChange.by })}</time></p>
      <p>{t('reason', { reason: market.lastChange.reason })}</p>
    </div>}
    {market.openingRefused && <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{t(`refused.${market.openingRefused}`, { name, zone: market.timeZone })}</p>}
    {market.actions.length > 0 && onSetMarketStatus && <div className="flex flex-wrap gap-2">
      {market.actions.map((action) => <AdminReasonAction
        key={action.id}
        trigger={t(`actions.${action.id}`, { name })}
        title={t(`confirm.titles.${action.id}`, { name })}
        description={describe(action)}
        submit={t(`actions.${action.id}`, { name })}
        pending={t('saving')}
        destructive={action.kind === 'destructive'}
        primary={action.kind === 'primary'}
        disabled={!action.enabled}
        action={onSetMarketStatus}
        payload={{ marketId: market.id, status: action.id }}
        field="reason"
        notAllowed={t('errors.notAllowed')}
        errorMessages={{ fields: { timeZone: t('refused.time_zone_unsupported', { name, zone: market.timeZone }) }, codes: { not_found: t('errors.notFound') } }}
        initialOpen={marketDialog?.status === action.id}
        initialResult={marketDialog?.status === action.id ? marketDialog.result : undefined}
      />)}
    </div>}
  </li>;
}
