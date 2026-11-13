import Link from 'next/link';
import { Gift } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type RewardProgramView, type RewardsHandlers, type RewardsPageData } from '@/contracts';
import { formatDate, formatMoney } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Money } from '@/ui/components/money/money';
import { RewardGrantCard } from '@/ui/components/rewards';
import { cn } from '@/ui/lib/utils';

export interface RewardsScreenProps {
  data: RewardsPageData;
  handlers: RewardsHandlers;
  now: ISODateTime;
}

function ProgramSummary({ program }: { program: RewardProgramView }) {
  const t = useTranslations('rewards');
  const amount = program.amountCents === undefined ? undefined : formatMoney(program.amountCents);
  const threshold = program.thresholdCents === undefined ? undefined : formatMoney(program.thresholdCents);

  return <li className="space-y-1">
    <h3 className="text-[17px]/6 font-semibold md:text-lg/6.5">{t(`programs.${program.program}`)}</h3>
    <p className="text-sm leading-6 text-muted-foreground tabular-nums">
      {program.program === 'welcome' && amount && threshold
        ? t('page.rules.welcome', { amount, threshold })
        : program.program === 'repeat' && amount
          ? t('page.rules.repeat', { amount })
          : t('page.rules.detailsInTerms')}
    </p>
    {program.program === 'repeat' && threshold && <p className="text-sm leading-6 text-muted-foreground tabular-nums">{t('page.rules.repeatThreshold', { threshold })}</p>}
  </li>;
}

export function RewardsScreen({ data, handlers, now }: RewardsScreenProps) {
  const t = useTranslations('rewards');
  const totals = [
    { label: 'ready', cents: data.totals.redeemableCents },
    { label: 'pending', cents: data.totals.pendingCents },
    { label: 'redeemed', cents: data.totals.redeemedThisYearCents },
  ] as const;

  return <div className="mx-auto w-full max-w-content space-y-6 md:space-y-8">
    <PageHeader title={t('page.title')} description={t('page.description')} />
    {!data.helperReady ? <EmptyState
      title={t('page.notHelper.title')}
      body={t('page.notHelper.body')}
      icon={<Gift className="size-6" />}
      action={{ label: t('page.notHelper.action'), href: routes.app.helperOnboarding() }}
    /> : <>
      <dl aria-label={t('page.totals.label')} className="grid gap-3 sm:grid-cols-3 md:gap-4">
        {totals.map(({ label, cents }) => <div key={label} className={cn(
          'flex items-center justify-between gap-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card sm:block md:p-6',
          label === 'ready' && 'border-reward/60',
        )}>
          <dt className="text-sm text-muted-foreground">{t(`page.totals.${label}`)}</dt>
          <dd className="shrink-0 sm:mt-3"><Money cents={cents} size="lg" /></dd>
        </div>)}
      </dl>
      <div className="grid items-start gap-6 md:gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6 md:space-y-8">
          <section aria-labelledby="rewards-grants" className="space-y-4">
            <h2 id="rewards-grants" className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('page.grants')}</h2>
            {data.grants.length ? <ul className="space-y-4">
              {data.grants.map((grant) => <li key={grant.id}><RewardGrantCard grant={grant} now={now} onRedeem={handlers.onRedeem} /></li>)}
            </ul> : <EmptyState
              headingLevel={3}
              title={t('page.empty.title')}
              body={t('page.empty.body')}
              icon={<Gift className="size-6" />}
              action={{ label: t('page.empty.action'), href: routes.app.findWork() }}
            />}
          </section>
          <section aria-labelledby="rewards-repeat" className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card md:p-6">
            <h2 id="rewards-repeat" className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('page.repeat.title')}</h2>
            {data.repeatProgress.length ? <ul className="space-y-6">
              {data.repeatProgress.map((progress, index) => {
                const label = t('page.repeat.progress', { count: progress.paidBookings, needed: progress.needed, name: progress.clientDisplayName, date: formatDate(progress.windowEndsAt) });
                const labelId = `rewards-repeat-${index}`;
                // This ratio controls only the visual bar; counts and eligibility come from props.
                const width = progress.needed > 0 ? Math.min(100, Math.max(0, progress.paidBookings / progress.needed * 100)) : 0;
                return <li key={`${progress.clientDisplayName}-${progress.windowEndsAt}-${index}`} className="space-y-3">
                  <p id={labelId} className="text-sm leading-6 tabular-nums">{label}</p>
                  <div role="progressbar" aria-labelledby={labelId} aria-valuemin={0} aria-valuemax={progress.needed} aria-valuenow={progress.paidBookings} aria-valuetext={label} className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                </li>;
              })}
            </ul> : <p className="text-sm leading-6 text-muted-foreground">{t('page.repeat.empty')}</p>}
          </section>
        </div>
        <div className="min-w-0 space-y-6 md:space-y-8">
          <section aria-labelledby="rewards-monthly" className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card md:p-6">
            <h2 id="rewards-monthly" className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('page.monthly.title')}</h2>
            <p className="text-lg font-semibold tabular-nums">{t('page.monthly.used', { used: formatMoney(data.monthly.usedCents), cap: formatMoney(data.monthly.capCents) })}</p>
            <p className="text-sm leading-6 text-muted-foreground">{t('page.monthly.description')}</p>
          </section>
          <section aria-labelledby="rewards-rules" className="space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card md:p-6">
            <div className="flex items-start gap-3">
              <Gift aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
              <h2 id="rewards-rules" className="font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5">{t('page.rules.title')}</h2>
            </div>
            <ul className="space-y-5">{data.programs.map((program) => <ProgramSummary key={program.program} program={program} />)}</ul>
            <div className="space-y-3 border-t border-border pt-4 text-sm leading-6 text-muted-foreground">
              <p>{t('page.rules.hold')}</p>
              <p>{t('page.rules.expiry')}</p>
              <p className="font-medium text-foreground">{t('page.rules.giftCards')}</p>
            </div>
            <Link href={routes.legal('rewards-terms')} className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-primary underline underline-offset-4">{t('page.rules.terms')}</Link>
          </section>
        </div>
      </div>
    </>}
  </div>;
}
