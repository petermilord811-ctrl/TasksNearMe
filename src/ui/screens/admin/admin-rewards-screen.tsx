import Link from 'next/link';
import { Check, Gift } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ADMIN_REWARD_FILTERS, routes, type AdminRewardsHandlers, type AdminRewardsPageData, type ISODateTime } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { cn } from '@/ui/lib/utils';
import { AdminRewardList } from './admin-reward-list';
import type { AdminRewardsPreviewState } from './admin-reward-controls';

export interface AdminRewardsScreenProps { data: AdminRewardsPageData; handlers: AdminRewardsHandlers; now: ISODateTime }

function RewardBudget({ budget }: { budget: AdminRewardsPageData['budgets'][number] }) {
  const t = useTranslations('adminRewards');
  const program = t(`programs.${budget.program}`);
  return <li className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-5">
    <h3 className="flex items-center gap-2 font-heading text-[17px]/6 font-semibold"><Gift aria-hidden="true" className="size-5 shrink-0 text-badge-reward-foreground" />{program}</h3>
    <dl className="space-y-3">
      {(['committed', 'delivered'] as const).map((kind) => {
        const amount = kind === 'committed' ? budget.committedCents : budget.deliveredCents;
        return <div key={kind} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t(`budgets.${kind}`)}</dt>
          <dd className="contents"><span className="text-right font-semibold tabular-nums">{formatMoney(amount)}</span>
          {budget.budgetCents !== undefined && <meter min={0} max={budget.budgetCents || 1} value={amount} aria-label={t('budgets.meter', { program, kind: t(`budgets.${kind}`) })} aria-valuetext={t('budgets.meterValue', { amount: formatMoney(amount), budget: formatMoney(budget.budgetCents) })} className="col-span-2 block h-3 w-full [&::-webkit-meter-bar]:rounded-full [&::-webkit-meter-bar]:border-0 [&::-webkit-meter-bar]:bg-muted [&::-webkit-meter-optimum-value]:bg-primary [&::-moz-meter-bar]:bg-primary" />}
          </dd>
        </div>;
      })}
      <div className="flex flex-wrap justify-between gap-2 border-t pt-3 text-sm"><dt className="text-muted-foreground">{t('budgets.budget')}</dt><dd className="font-medium tabular-nums">{budget.budgetCents === undefined ? t('budgets.unset') : formatMoney(budget.budgetCents)}</dd></div>
    </dl>
  </li>;
}

export function AdminRewardsScreen(props: AdminRewardsScreenProps) { return <AdminRewardsContent {...props} />; }

/** Optional seeds are for the preview harness; the application uses the screen's contract props. */
export function AdminRewardsContent({ data, handlers, now, ...previewState }: AdminRewardsScreenProps & AdminRewardsPreviewState) {
  const t = useTranslations('adminRewards');
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <header className="space-y-2"><h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1><p className="max-w-3xl text-muted-foreground">{t('intro')}</p></header>
    <nav aria-label={t('filtersLabel')} className="flex flex-wrap gap-2">{ADMIN_REWARD_FILTERS.map((filter) => <Link key={filter} href={routes.admin.rewards(filter)} aria-current={data.filter === filter ? 'page' : undefined} className={cn('inline-flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent', data.filter === filter ? 'border-primary bg-secondary text-secondary-foreground' : 'bg-card text-muted-foreground')}>
      {data.filter === filter && <Check aria-hidden="true" className="size-4 shrink-0" />}{t(`filters.${filter}`)}{' '}<span className="tabular-nums">{t('filterCount', { count: data.counts[filter] })}</span>
    </Link>)}</nav>
    {data.budgets.length > 0 && <section aria-label={t('budgets.title')} className="space-y-3">
      <h2 className="font-heading text-xl/7 font-semibold md:text-[22px]/7.5">{t('budgets.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('budgets.intro')}</p>
      <ul className="grid gap-4 md:grid-cols-2">{data.budgets.map((budget) => <RewardBudget key={budget.program} budget={budget} />)}</ul>
    </section>}
    <section aria-label={t('results')} className="space-y-3">
      <h2 className="font-heading text-xl/7 font-semibold md:text-[22px]/7.5">{t('results')}</h2>
      <AdminRewardList rows={data.rows} now={now} handlers={handlers} empty={<EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={{ label: t('viewAll'), href: routes.admin.rewards('all') }} />} {...previewState} />
    </section>
  </div>;
}
