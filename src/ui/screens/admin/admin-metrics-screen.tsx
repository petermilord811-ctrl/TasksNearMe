import { AlertTriangle, CheckCircle2, Clock, Info, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  METRICS_PERIODS,
  routes,
  type AdminMetricsPageData,
  type BadgeTone,
  type LiquidityFigures,
  type LiquidityRow,
  type MetricShare,
  type MetricTarget,
  type MetricTargetStatus,
  type MetricsDay,
  type MetricsRewardSpend,
  type RewardProgramSpend,
} from '@/contracts';
import { formatMoney } from '@/shared/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { MetricsColumnChart } from './admin-metrics-chart';
import { AdminFilterChip, adminCard, adminH2, adminMoneyTd, adminNote, adminSection, adminTableFrame, adminTd, adminTh, adminTr } from './admin-ui';

const STATUS_LOOK: Record<MetricTargetStatus, { tone: BadgeTone; icon: ReactNode }> = {
  met: { tone: 'success', icon: <CheckCircle2 /> },
  missed: { tone: 'warning', icon: <AlertTriangle /> },
  no_data: { tone: 'neutral', icon: <Clock /> },
  restricted: { tone: 'neutral', icon: <Lock /> },
  not_measured: { tone: 'info', icon: <Info /> },
};

function useDuration() {
  const t = useTranslations('adminMetrics.duration');
  return (minutes: number) => {
    if (minutes < 60) return t('minutes', { minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('hours', { hours, minutes: minutes % 60 });
    return t('days', { days: Math.floor(hours / 24), hours: hours % 24 });
  };
}

function usePercent() {
  const t = useTranslations('adminMetrics');
  return (value: MetricShare) => (value.percent === undefined ? t('none') : t('percent', { percent: value.percent }));
}

const count = (value: number) => value.toLocaleString('en-US');

// ---- Targets -------------------------------------------------------------------------------------------

function TargetCard({ target }: { target: MetricTarget }) {
  const t = useTranslations('adminMetrics.targets');
  const root = useTranslations('adminMetrics');
  const percent = usePercent();
  const look = STATUS_LOOK[target.status];
  const goal = target.target.kind === 'percent' ? root('percent', { percent: target.target.percent }) : target.target.kind === 'money' ? formatMoney(target.target.cents) : count(target.target.count);
  const value = target.value;
  const big = !value ? root('none') : value.kind === 'share' ? percent(value.share) : value.kind === 'money_per_booking' ? formatMoney(value.cents) : count(value.count);
  const detail = !value
    ? target.status === 'restricted'
      ? t('items.contribution_per_booking.restricted')
      : target.id === 'address_incidents'
        ? t('items.address_incidents.detail')
        : null
    : value.kind === 'share'
      ? t(`items.${target.id}.detail`, { part: value.share.part, whole: value.share.whole })
      : value.kind === 'money_per_booking'
        ? t('items.contribution_per_booking.detail', { bookings: value.bookings })
        : null;
  const maturingKey = target.id === 'posted_to_booked' || target.id === 'bookings_completed' || target.id === 'rebook_60d' ? target.id : null;
  return <li className={cn(adminSection, 'flex min-w-0 flex-col gap-3')}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">{t(`areas.${target.area}`)}</p>
        <h3 className="mt-1 font-semibold">{t(`items.${target.id}.title`)}</h3>
      </div>
      <StatusBadge tone={look.tone} icon={look.icon} label={t(`status.${target.status}`)} />
    </div>
    <p className="font-display text-3xl leading-9 font-semibold tracking-[-0.03em] tabular-nums">{big}</p>
    <div className="mt-auto space-y-1 text-sm">
      <p className="font-medium">{t(`target.${target.comparison}`, { value: goal })}</p>
      {detail && <p className="text-muted-foreground">{detail}</p>}
      {maturingKey && target.maturing ? <p className="text-muted-foreground">{t(`items.${maturingKey}.maturing`, { count: target.maturing })}</p> : null}
    </div>
  </li>;
}

// ---- Funnel --------------------------------------------------------------------------------------------

function Funnel({ data }: { data: AdminMetricsPageData['funnel'] }) {
  const t = useTranslations('adminMetrics.funnel');
  const posted = data.steps[0]?.count ?? 0;
  if (posted === 0) return <p className={adminNote}>{t('empty')}</p>;
  return <div className={cn(adminSection, 'space-y-4')}>
    <ol className="space-y-4">
      {data.steps.map((step, index) => <li key={step.id} className="grid gap-1.5 sm:grid-cols-[11rem_1fr] sm:items-center sm:gap-4">
        <div className="flex items-baseline justify-between gap-3 sm:block">
          <p className="font-medium">{t(`steps.${step.id}`)}</p>
          <p className="font-semibold tabular-nums sm:mt-0.5">{count(step.count)}</p>
        </div>
        <div className="min-w-0 space-y-1">
          <div className="h-3 rounded-full bg-foreground/[0.06] dark:bg-white/[0.07]">
            <div className="h-3 rounded-full bg-primary" style={{ width: step.count > 0 ? `max(4px, ${step.ofPosted.percent ?? 0}%)` : 0 }} />
          </div>
          {/* The second step's "of the step before" is "of posted" again: say it once. */}
          {index > 0 && <p className="text-sm text-muted-foreground">
            {t('ofPosted', { percent: step.ofPosted.percent ?? 0 })}{index > 1 && <> · {t('ofPrevious', { percent: step.ofPrevious.percent ?? 0 })}</>}
          </p>}
        </div>
      </li>)}
    </ol>
    {data.rebookMaturing > 0 && <p className="border-t border-foreground/[0.07] pt-3 text-sm text-muted-foreground dark:border-white/[0.07]">{t('rebookMaturing', { count: data.rebookMaturing })}</p>}
  </div>;
}

// ---- Daily ---------------------------------------------------------------------------------------------

type DailySeries = 'posted' | 'offers' | 'booked' | 'completed';
type DailyColumn = DailySeries | 'repeat' | 'rewardsDelivered';

function Daily({ data }: { data: AdminMetricsPageData }) {
  const t = useTranslations('adminMetrics.daily');
  const { formatDate } = useFormat();
  const series: { id: DailySeries | 'rewardsDelivered'; total: string; points: { startsAt: string; value: number; label: string }[] }[] = [
    ...(['posted', 'offers', 'booked', 'completed'] as const).map((id) => ({
      id,
      total: count(data.totals[id]),
      points: data.daily.map((day) => ({ startsAt: day.startsAt, value: day[id], label: count(day[id]) })),
    })),
    ...(data.canSeeMoney && data.totals.rewardsDeliveredCents !== undefined
      ? [{
          id: 'rewardsDelivered' as const,
          total: formatMoney(data.totals.rewardsDeliveredCents),
          points: data.daily.map((day) => ({ startsAt: day.startsAt, value: day.rewardsDeliveredCents ?? 0, label: formatMoney(day.rewardsDeliveredCents ?? 0) })),
        }]
      : []),
  ];
  const newestFirst = [...data.daily].reverse();
  const keys: DailyColumn[] = ['posted', 'offers', 'booked', 'repeat', 'completed', ...(data.canSeeMoney ? ['rewardsDelivered' as const] : [])];
  const cell = (day: MetricsDay, key: DailyColumn) => (key === 'rewardsDelivered' ? formatMoney(day.rewardsDeliveredCents ?? 0) : count(day[key]));

  return <div className="space-y-4">
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {series.map((item) => <li key={item.id} className={adminSection}>
        <MetricsColumnChart title={t(`series.${item.id}`)} total={item.total} points={item.points} summary={t('summary', { series: t(`series.${item.id}`), total: item.total, days: data.days })} />
      </li>)}
    </ul>
    {data.totals.repeat > 0 && <p className="text-sm text-muted-foreground">{t('repeatNote', { count: data.totals.repeat })}</p>}
    <details className={cn(adminSection, 'group')}>
      <summary className="flex min-h-11 cursor-pointer items-center font-medium">{t('tableToggle')}</summary>
      <div className="mt-3">
        <div className="hidden overflow-hidden rounded-xl border border-foreground/[0.07] lg:block dark:border-white/[0.07]">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('tableCaption')}</caption>
            <thead><tr>
              <th scope="col" className={adminTh}>{t('columns.day')}</th>
              {keys.map((key) => <th key={key} scope="col" className={cn(adminTh, 'text-right')}>{t(`columns.${key}`)}</th>)}
            </tr></thead>
            <tbody>{newestFirst.map((day) => <tr key={day.day} className={adminTr}>
              <th scope="row" className={cn(adminTd, 'text-left font-normal')}>{formatDate(day.startsAt)}</th>
              {keys.map((key) => <td key={key} className={cn(adminTd, 'text-right tabular-nums')}>{cell(day, key)}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <ul className="space-y-3 lg:hidden">{newestFirst.map((day) => <li key={day.day} className={adminCard}>
          <p className="font-medium">{formatDate(day.startsAt)}</p>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm min-[400px]:grid-cols-2">{keys.map((key) => <div key={key} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t(`columns.${key}`)}</dt>
            <dd className="tabular-nums">{cell(day, key)}</dd>
          </div>)}</dl>
        </li>)}</ul>
      </div>
    </details>
  </div>;
}

// ---- Liquidity -----------------------------------------------------------------------------------------

function Figure({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return <div className={cn(adminSection, 'min-w-0')}>
    <dt className="text-sm text-muted-foreground">{label}{hint && <span className="block text-xs">{hint}</span>}</dt>
    <dd className="mt-1 font-display text-2xl leading-8 font-semibold tracking-[-0.02em] tabular-nums">{value}</dd>
  </div>;
}

function LiquidityTable({ title, rows, nameColumn }: { title: string; rows: LiquidityRow[]; nameColumn: 'category' | 'area' }) {
  const t = useTranslations('adminMetrics.liquidity');
  const root = useTranslations('adminMetrics');
  const duration = useDuration();
  const percent = usePercent();
  const nameOf = (row: LiquidityRow & { remote?: true }) => (row.remote ? t('remote') : row.name);
  const shareText = (value: MetricShare) => (value.percent === undefined ? root('none') : t('share', { percent: value.percent, part: value.part, whole: value.whole }));
  const keys = ['offerWithin2h', 'offerWithin24h', 'medianFirstOffer', 'filled'] as const;
  const columns = (row: LiquidityRow) => [
    ['offerWithin2h', shareText(row.offerWithin2h)],
    ['offerWithin24h', shareText(row.offerWithin24h)],
    ['medianFirstOffer', row.medianFirstOfferMinutes === undefined ? root('none') : duration(row.medianFirstOfferMinutes)],
    ['filled', percent(row.filled)],
  ] as const;
  return <section aria-labelledby={`liquidity-${nameColumn}`} className="space-y-3">
    <h3 id={`liquidity-${nameColumn}`} className="font-semibold">{title}</h3>
    <div className={adminTableFrame}>
      <table className="w-full text-sm">
        <caption className="sr-only">{title}</caption>
        <thead><tr>
          <th scope="col" className={adminTh}>{t(`columns.${nameColumn}`)}</th>
          <th scope="col" className={cn(adminTh, 'text-right')}>{t('columns.posted')}</th>
          {keys.map((key) => <th key={key} scope="col" className={cn(adminTh, 'text-right')}>{t(`columns.${key}`)}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key} className={adminTr}>
          <th scope="row" className={cn(adminTd, 'text-left font-medium')}>{nameOf(row)}</th>
          <td className={adminMoneyTd}>{count(row.posted)}</td>
          {columns(row).map(([key, value]) => <td key={key} className={cn(adminTd, 'text-right tabular-nums')}>{value}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <ul className="space-y-3 lg:hidden">{rows.map((row) => <li key={row.key} className={adminCard}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{nameOf(row)}</p>
        <p className="text-sm text-muted-foreground tabular-nums">{t('postedCount', { count: row.posted })}</p>
      </div>
      <dl className="mt-2 space-y-1 text-sm">{columns(row).map(([key, value]) => <div key={key} className="flex flex-wrap justify-between gap-x-3">
        <dt className="text-muted-foreground">{t(`columns.${key}`)}</dt>
        <dd className="tabular-nums">{value}</dd>
      </div>)}</dl>
    </li>)}</ul>
  </section>;
}

function Liquidity({ data }: { data: AdminMetricsPageData['liquidity'] }) {
  const t = useTranslations('adminMetrics.liquidity');
  const root = useTranslations('adminMetrics');
  const duration = useDuration();
  const percent = usePercent();
  const overall: LiquidityFigures = data.overall;
  return <div className="space-y-5">
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Figure label={t('figures.offerWithin2h')} hint={t('figures.offerWithin2hHint')} value={percent(overall.offerWithin2h)} />
      <Figure label={t('figures.offerWithin24h')} value={percent(overall.offerWithin24h)} />
      <Figure label={t('figures.medianFirstOffer')} hint={t('figures.medianFirstOfferHint')} value={overall.medianFirstOfferMinutes === undefined ? root('none') : duration(overall.medianFirstOfferMinutes)} />
      <Figure label={t('figures.filled')} value={percent(overall.filled)} />
    </dl>
    {data.byCategory.length === 0 ? <p className={adminNote}>{t('empty')}</p> : <>
      <LiquidityTable title={t('byCategory')} rows={data.byCategory} nameColumn="category" />
      <LiquidityTable title={t('byArea')} rows={data.byArea} nameColumn="area" />
    </>}
  </div>;
}

// ---- Rewards -------------------------------------------------------------------------------------------

function ProgramSpend({ spend }: { spend: RewardProgramSpend }) {
  const t = useTranslations('adminMetrics.rewards');
  const program = t(`programs.${spend.program}`);
  // A monthly budget (the welcome gift card's) is used by what left its waiting line this month.
  const used = spend.budgetPeriod === 'month' ? (spend.releasedThisMonthCents ?? 0) : spend.committedCents;
  const row = (label: string, value: string) => <div className="flex flex-wrap justify-between gap-x-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>;
  return <li className={cn(adminSection, 'space-y-3')}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-semibold">{program}</h3>
      <p className="text-sm text-muted-foreground tabular-nums">{spend.budgetCents === undefined ? t('noBudget') : t(spend.budgetPeriod === 'month' ? 'budgetAmountMonthly' : 'budgetAmount', { amount: formatMoney(spend.budgetCents) })}</p>
    </div>
    {spend.budgetCents !== undefined && <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={spend.budgetCents}
      aria-valuenow={Math.min(used, spend.budgetCents)}
      aria-valuetext={t('budgetMeterValue', { committed: formatMoney(used), budget: formatMoney(spend.budgetCents) })}
      aria-label={t('budgetMeter', { program, used: spend.budgetUsedPercent ?? 0 })}
      className="h-2.5 rounded-full bg-foreground/[0.07] dark:bg-white/[0.08]"
    >
      <div className="h-2.5 rounded-full bg-primary" style={{ width: `${Math.min(100, spend.budgetUsedPercent ?? 0)}%` }} />
    </div>}
    <dl className="space-y-1 text-sm">
      {spend.budgetPeriod === 'month' && row(t('releasedThisMonth'), formatMoney(used))}
      {row(t('committed'), formatMoney(spend.committedCents))}
      {row(t('delivered'), formatMoney(spend.deliveredCents))}
      {spend.remainingCents !== undefined && row(t(spend.budgetPeriod === 'month' ? 'remainingMonthly' : 'remaining'), formatMoney(spend.remainingCents))}
      {row(t('inReview'), count(spend.inReview))}
    </dl>
    <div className="space-y-1 border-t border-foreground/[0.07] pt-3 text-sm dark:border-white/[0.07]">
      <p className="font-medium">{t('period')}</p>
      <dl className="space-y-1">
        {row(t('committed'), t('periodGranted', { count: spend.periodGrants, amount: formatMoney(spend.periodGrantedCents) }))}
        {row(t('periodDelivered'), formatMoney(spend.periodDeliveredCents))}
        {row(t('periodVoided'), count(spend.periodVoided))}
      </dl>
    </div>
  </li>;
}

function Rewards({ data }: { data: MetricsRewardSpend }) {
  const t = useTranslations('adminMetrics.rewards');
  return <div className="space-y-4">
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.programs.map((spend) => <ProgramSpend key={spend.program} spend={spend} />)}</ul>
    <div className={cn(adminSection, 'space-y-1 text-sm')}>
      <p className="font-medium tabular-nums">{t('total', { amount: formatMoney(data.periodDeliveredCents) })}</p>
      <p className="text-muted-foreground">{t('cap', { cap: formatMoney(data.monthlyCapCents), atCap: data.helpersAtCap, nearCap: data.helpersNearCap })}</p>
    </div>
  </div>;
}

// ---- Screen --------------------------------------------------------------------------------------------

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="space-y-3">
    <div className="space-y-1">
      <h2 id={id} className={adminH2}>{title}</h2>
      {intro && <p className="max-w-3xl text-sm text-muted-foreground">{intro}</p>}
    </div>
    {children}
  </section>;
}

/**
 * `/admin/metrics` (B-067): the launch targets, the funnel, the period day by day, liquidity by category and
 * area, and reward spend (finance and admins). The period is a link; nothing here acts.
 */
export function AdminMetricsScreen({ data }: { data: AdminMetricsPageData }) {
  const t = useTranslations('adminMetrics');
  const { formatDate, formatTime } = useFormat();
  return <div className="min-w-0 space-y-8 [overflow-wrap:anywhere]">
    <div className="space-y-4">
      <PageHeader title={t('title')} description={t('intro')} />
      <nav aria-label={t('periodsLabel')} className="flex flex-wrap gap-2">
        {METRICS_PERIODS.map((days) => <AdminFilterChip key={days} href={routes.admin.metrics(days)} current={data.days === days}>{t(`periods.${days}`)}</AdminFilterChip>)}
      </nav>
      <p className="text-sm text-muted-foreground">{t('range', { from: formatDate(data.from), to: formatDate(data.generatedAt), time: formatTime(data.generatedAt) })}</p>
    </div>

    <Section id="metrics-targets" title={t('targets.title')} intro={t('targets.intro')}>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.targets.map((target) => <TargetCard key={target.id} target={target} />)}</ul>
    </Section>

    <Section id="metrics-funnel" title={t('funnel.title')} intro={t('funnel.intro')}>
      <Funnel data={data.funnel} />
    </Section>

    <Section id="metrics-daily" title={t('daily.title')} intro={t('daily.intro')}>
      <Daily data={data} />
    </Section>

    <Section id="metrics-liquidity" title={t('liquidity.title')} intro={t('liquidity.intro')}>
      <Liquidity data={data.liquidity} />
    </Section>

    <Section id="metrics-rewards" title={t('rewards.title')} intro={t('rewards.intro')}>
      {data.rewards ? <Rewards data={data.rewards} /> : <p className={adminNote}>{t('rewards.restricted')}</p>}
    </Section>

    <details className={adminSection}>
      <summary className="flex min-h-11 cursor-pointer items-center font-medium">{t('notes.title')}</summary>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
        {(['cohort', 'booked', 'started', ...(data.canSeeMoney ? ['contribution' as const] : [])] as const).map((key) => <li key={key}>{t(`notes.items.${key}`)}</li>)}
      </ul>
    </details>
  </div>;
}
