import Link from 'next/link';
import { BadgeCheck, CircleDollarSign, Gift, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type BecomeHelperPageData } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { PageHeader, PriceBreakdown, Section } from '@/ui/components';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

export interface BecomeHelperScreenProps { data: BecomeHelperPageData }

export function BecomeHelperScreen({ data }: BecomeHelperScreenProps) {
  const t = useTranslations('publicPages.becomeHelper');
  const welcome = data.welcomeReward;
  const repeat = data.repeatReward;
  const onboardingHref = routes.signIn(routes.app.helperOnboarding());

  return <div className="space-y-8">
    <div className="space-y-6 rounded-xl bg-secondary p-4 text-secondary-foreground sm:p-8">
      <PageHeader title={t('title')} description={t('description')} />
      <Link href={onboardingHref} className={buttonVariants()}>{t('cta')}</Link>
    </div>

    <Section title={t('requirementsTitle')}>
      <ul className="grid gap-4 md:grid-cols-3">
        <li className="rounded-xl border bg-card p-4 shadow-card sm:p-6">
          <ShieldCheck aria-hidden="true" className="mb-4 size-6 text-primary" />
          <h3 className="text-[17px] leading-6 font-semibold lg:text-lg">{t('identityTitle')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t('identityDescription')}</p>
        </li>
        <li className="rounded-xl border bg-card p-4 shadow-card sm:p-6">
          <CircleDollarSign aria-hidden="true" className="mb-4 size-6 text-primary" />
          <h3 className="text-[17px] leading-6 font-semibold lg:text-lg">{t('payoutTitle')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t('payoutDescription')}</p>
        </li>
        {data.inHomeCategoriesRequireBackgroundCheck && <li className="rounded-xl border bg-card p-4 shadow-card sm:p-6">
          <BadgeCheck aria-hidden="true" className="mb-4 size-6 text-primary" />
          <h3 className="text-[17px] leading-6 font-semibold lg:text-lg">{t('backgroundTitle')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t('backgroundDescription')}</p>
        </li>}
      </ul>
    </Section>

    <div className="grid items-start gap-6 md:grid-cols-2">
      <div className="space-y-6">
        <Section title={t('earningsTitle')}><p className="text-muted-foreground">{t('earningsDescription')}</p></Section>
        <Section title={t('timingTitle')}>
          <p className="text-muted-foreground">{t('timingDescription')}</p>
          <p className="rounded-xl bg-muted p-4 font-medium tabular-nums">{t('firstPayout', { days: data.firstPayoutDays })}</p>
        </Section>
      </div>
      <PriceBreakdown breakdown={data.exampleEarnings} variant="helper" title={t('earningsBreakdownTitle')} />
    </div>

    {(welcome || repeat) && <Section title={t('rewardsTitle')} description={t('rewardsDescription')}>
      <div className="grid items-start gap-4 md:grid-cols-2">
        {welcome && <section aria-label={t('welcomeTitle')} className="rounded-xl border border-border bg-badge-reward p-4 text-badge-reward-foreground sm:p-6">
          <Gift aria-hidden="true" className="mb-3 size-6" />
          <h3 className="text-[17px] leading-6 font-semibold lg:text-lg">{t('welcomeTitle')}</h3>
          <p className="mt-3 text-lg font-semibold tabular-nums">{t('welcomeOffer', { amount: formatMoney(welcome.amountCents), limit: welcome.cohortLimit })}</p>
          <p className="mt-2 font-semibold tabular-nums">{t('spotsLeft', { count: welcome.cohortLimit - welcome.spotsClaimed })}</p>
          <p className="mt-4 text-sm">{t('welcomeTerms', { minimum: formatMoney(welcome.minTaskPriceCents), days: welcome.windowDays })}</p>
          <p className="mt-3 text-sm">{t('welcomeUnlock', { days: welcome.unlockDays })}</p>
        </section>}
        {repeat && <section aria-label={t('repeatTitle')} className="rounded-xl border border-border bg-badge-reward p-4 text-badge-reward-foreground sm:p-6">
          <Gift aria-hidden="true" className="mb-3 size-6" />
          <h3 className="text-[17px] leading-6 font-semibold lg:text-lg">{t('repeatTitle')}</h3>
          <p className="mt-3 text-lg font-semibold tabular-nums">{t('repeatOffer', { amount: formatMoney(repeat.amountCents) })}</p>
          <p className="mt-4 text-sm">{t('repeatTerms', { bookings: repeat.bookingsNeeded, days: repeat.withinDays })}</p>
          <p className="mt-3 text-sm">{t('repeatUnlock')}</p>
        </section>}
      </div>
      <p className="max-w-reading text-sm text-muted-foreground">{t('rewardConditions')}</p>
      <Link href={routes.legal('rewards-terms')} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('rewardTermsLink')}</Link>
    </Section>}
    <p className="text-sm text-muted-foreground">{t('rewardPolicy')}</p>

    <section className="rounded-xl border bg-card p-4 sm:p-6">
      <h2 className="text-xl leading-7 font-semibold lg:text-[22px] lg:leading-[30px]">{t('closingTitle')}</h2>
      <p className="mt-2 text-muted-foreground">{t('closingDescription')}</p>
      <Link href={onboardingHref} className={cn(buttonVariants(), 'mt-4')}>{t('cta')}</Link>
    </section>
  </div>;
}
