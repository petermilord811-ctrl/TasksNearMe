import { Gift } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ADMIN_REWARD_FILTERS, routes, type AdminRewardsHandlers, type AdminRewardsPageData, type ISODateTime } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { cn } from '@/ui/lib/utils';
import { AdminRewardList } from './admin-reward-list';
import type { AdminRewardsPreviewState } from './admin-reward-controls';
import { AdminFilterChip, adminH2, adminSection } from './admin-ui';

export interface AdminRewardsScreenProps { data: AdminRewardsPageData; handlers: AdminRewardsHandlers; now: ISODateTime }

/**
 * One program's budget. A monthly budget (the welcome gift card) is metered against what left its waiting line
 * this month, with what waits for next month's; a total budget against what's committed and delivered.
 */
function RewardBudget({ budget }: { budget: AdminRewardsPageData['budgets'][number] }) {
  const t = useTranslations('adminRewards');
  const program = t(`programs.${budget.program}`);
  const monthly = budget.period === 'month';
  const amounts = {
    releasedThisMonth: budget.releasedThisMonthCents ?? 0,
    queued: budget.queuedCents ?? 0,
    committed: budget.committedCents,
    delivered: budget.deliveredCents,
  };
  const kinds = monthly ? (['releasedThisMonth', 'queued', 'committed', 'delivered'] as const) : (['committed', 'delivered'] as const);
  const metered = (kind: (typeof kinds)[number]) => budget.budgetCents !== undefined && (monthly ? kind === 'releasedThisMonth' : true);
  return <li className={cn(adminSection, 'space-y-4')}>
    <h3 className="flex items-center gap-2 font-display text-[17px]/6 font-semibold tracking-[-0.01em]"><span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-badge-reward text-badge-reward-foreground"><Gift className="size-4" /></span>{program}</h3>
    <dl className="space-y-3">
      {kinds.map((kind) => {
        const amount = amounts[kind];
        return <div key={kind} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t(`budgets.${kind}`)}</dt>
          <dd className="contents"><span className="text-right font-semibold tabular-nums">{formatMoney(amount)}</span>
          {metered(kind) && <meter min={0} max={budget.budgetCents || 1} value={amount} aria-label={t('budgets.meter', { program, kind: t(`budgets.${kind}`) })} aria-valuetext={t('budgets.meterValue', { amount: formatMoney(amount), budget: formatMoney(budget.budgetCents ?? 0) })} className="col-span-2 block h-2.5 w-full [&::-moz-meter-bar]:rounded-full [&::-moz-meter-bar]:bg-primary [&::-webkit-meter-bar]:rounded-full [&::-webkit-meter-bar]:border-0 [&::-webkit-meter-bar]:bg-foreground/[0.07] [&::-webkit-meter-optimum-value]:rounded-full [&::-webkit-meter-optimum-value]:bg-primary" />}
          </dd>
        </div>;
      })}
      <div className="flex flex-wrap justify-between gap-2 border-t border-foreground/[0.07] pt-3 text-sm dark:border-white/[0.07]"><dt className="text-muted-foreground">{t(monthly ? 'budgets.budgetMonthly' : 'budgets.budget')}</dt><dd className="font-medium tabular-nums">{budget.budgetCents === undefined ? t('budgets.unset') : formatMoney(budget.budgetCents)}</dd></div>
    </dl>
  </li>;
}

export function AdminRewardsScreen(props: AdminRewardsScreenProps) { return <AdminRewardsContent {...props} />; }

/** Optional seeds are for the preview harness; the application uses the screen's contract props. */
export function AdminRewardsContent({ data, handlers, now, ...previewState }: AdminRewardsScreenProps & AdminRewardsPreviewState) {
  const t = useTranslations('adminRewards');
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <PageHeader title={t('title')} description={t('intro')} />
    <nav aria-label={t('filtersLabel')} className="flex flex-wrap gap-2">{ADMIN_REWARD_FILTERS.map((filter) => <AdminFilterChip key={filter} href={routes.admin.rewards(filter)} current={data.filter === filter} count={t('filterCount', { count: data.counts[filter] })}>{t(`filters.${filter}`)}</AdminFilterChip>)}</nav>
    {data.budgets.length > 0 && <section aria-label={t('budgets.title')} className="space-y-3">
      <h2 className={adminH2}>{t('budgets.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('budgets.intro')}</p>
      <ul className="grid gap-4 md:grid-cols-2">{data.budgets.map((budget) => <RewardBudget key={budget.program} budget={budget} />)}</ul>
    </section>}
    <section aria-label={t('results')} className="space-y-3">
      <h2 className={adminH2}>{t('results')}</h2>
      <AdminRewardList rows={data.rows} now={now} handlers={handlers} empty={<EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={{ label: t('viewAll'), href: routes.admin.rewards('all') }} />} {...previewState} />
    </section>
  </div>;
}
