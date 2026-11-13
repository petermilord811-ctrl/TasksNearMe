import Link from 'next/link';
import { CircleDollarSign, Info, Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type BadgeTone, type EarningsHandlers, type EarningsPageData, type EarningsRowView, type ISODateTime, type PayoutAccountStatus, type PayoutStatus } from '@/contracts';
import { formatDate, formatRelative, marketLocalToUtc } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Money } from '@/ui/components/money/money';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useEarningsStatus } from '@/ui/components/status/use-status';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { EarningsDashboardAction } from './earnings-dashboard-action';
import { InstantPayoutCard } from './instant-payout-card';

const payoutTones: Record<PayoutStatus, BadgeTone> = { pending: 'neutral', in_transit: 'info', paid: 'success', failed: 'danger', canceled: 'neutral' };
const accountTones: Record<PayoutAccountStatus, BadgeTone> = { not_started: 'neutral', pending: 'info', requirements_due: 'warning', active: 'success', restricted: 'danger' };

export interface EarningsScreenProps {
  data: EarningsPageData;
  handlers: EarningsHandlers;
  now: ISODateTime;
}

function EarningsRow({ row, now }: { row: EarningsRowView; now: ISODateTime }) {
  const t = useTranslations('earnings');
  const status = useEarningsStatus(row.status);
  const titleId = `earnings-${row.id}`;
  const payout = row.payout;
  // The provider supplies a calendar day, not a midnight UTC instant.
  const arrival = payout ? formatDate(marketLocalToUtc(payout.arrivalDate, '12:00')) : undefined;

  return <article aria-labelledby={titleId} className="min-w-0 space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06] p-4 transition-shadow duration-200 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-medium text-secondary-foreground">{t(`kinds.${row.kind}`)}</p>
      <StatusBadge {...status} />
    </div>
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start sm:gap-6">
      <div className="min-w-0">
        <h3 id={titleId} className="font-display text-[17px]/6 font-semibold tracking-[-0.01em] md:text-lg/6.5"><Link href={routes.app.booking(row.bookingId)} className="inline-flex min-h-11 items-center rounded-sm underline decoration-border underline-offset-4 transition-colors duration-200 hover:text-primary hover:decoration-primary">{row.title}</Link></h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('client', { name: row.client.displayName })}</p>
      </div>
      <div className="shrink-0 font-semibold tabular-nums sm:text-right"><Money cents={row.amountCents} size="lg" /></div>
    </div>
    {row.holdReason && <p className="rounded-2xl bg-muted px-4 py-3 text-sm">{t(`holdReasons.${row.holdReason}`)}</p>}
    {row.transferredAt && <p className="text-sm text-muted-foreground"><time dateTime={row.transferredAt} className="tabular-nums">{t('transferred', { date: formatDate(row.transferredAt) })}</time><span className="ml-2">({formatRelative(row.transferredAt, now)})</span></p>}
    {payout && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/[0.07] pt-4 dark:border-white/[0.06]">
      <p className="text-sm tabular-nums">{payout.status === 'paid' || payout.status === 'pending' || payout.status === 'in_transit'
        ? <time dateTime={payout.arrivalDate}>{t(payout.status === 'paid' ? 'payout.paidOn' : 'payout.arrival', { date: arrival!, last4: payout.bankLast4 })}</time>
        : t('payout.bank', { last4: payout.bankLast4 })}</p>
      <StatusBadge label={t(`payout.${payout.status}`)} tone={payoutTones[payout.status]} />
    </div>}
  </article>;
}

export function EarningsScreen({ data, handlers, now }: EarningsScreenProps) {
  const t = useTranslations('earnings');
  const account = data.payoutAccount;
  const totals = [
    { label: 'upcoming', cents: data.totals.upcomingCents },
    { label: 'onTheWay', cents: data.totals.onTheWayCents },
    { label: 'paidThisYear', cents: data.totals.paidThisYearCents },
  ] as const;

  return <div className="mx-auto w-full max-w-content space-y-6 md:space-y-8">
    <PageHeader title={t('title')} description={t('description')} />
    {/* The three totals in one card: stacked on phones, side by side from small screens up. */}
    <dl aria-label={t('totals.label')} className="grid divide-y divide-foreground/[0.07] overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-white/[0.06]">
      {totals.map(({ label, cents }) => <div key={label} className="flex items-center justify-between gap-3 p-4 sm:block md:p-6">
        <dt className="text-sm text-muted-foreground">{t(`totals.${label}`)}</dt>
        <dd className="tabular-nums sm:mt-2"><Money cents={cents} size="lg" /></dd>
      </div>)}
    </dl>
    <section aria-labelledby="earnings-payout-account" className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06] p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="earnings-payout-account" className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('account.title')}</h2>
        <StatusBadge label={t(`account.statuses.${account.status}`)} tone={accountTones[account.status]} />
      </div>
      <p className="flex items-center gap-3 font-medium tabular-nums"><Landmark aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />{account.bankLast4 ? t('account.bank', { last4: account.bankLast4 }) : t('account.noBank')}</p>
      <p className="text-sm text-muted-foreground">{t('account.timing')}</p>
      <EarningsDashboardAction onOpenPayoutDashboard={handlers.onOpenPayoutDashboard} actionNeeded={account.actionNeeded} />
    </section>
    {data.instantPayout && handlers.onInstantPayout && <InstantPayoutCard offer={data.instantPayout} onInstantPayout={handlers.onInstantPayout} />}
    {data.firstPayoutNotice && <Alert role="note" className="border-info/25">
      <Info aria-hidden="true" className="text-info" /><AlertDescription className="text-foreground">{t('firstPayoutNotice')}</AlertDescription>
    </Alert>}
    {data.rows.length ? <section aria-labelledby="earnings-transfers" className="space-y-4">
      <h2 id="earnings-transfers" className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('transfers')}</h2>
      <ul className="space-y-4">{data.rows.map((row) => <li key={row.id}><EarningsRow row={row} now={now} /></li>)}</ul>
    </section> : <EmptyState title={t('empty.title')} body={t('empty.body')} icon={<CircleDollarSign className="size-6" />} action={{ label: t('empty.action'), href: routes.app.findWork() }} />}
  </div>;
}
