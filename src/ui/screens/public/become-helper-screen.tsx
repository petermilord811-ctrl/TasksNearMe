import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { BadgeCheck, CircleDollarSign, Gift, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BecomeHelperPageData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatMoney } from '@/shared/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

export interface BecomeHelperScreenProps { data: BecomeHelperPageData }

export function BecomeHelperScreen({ data }: BecomeHelperScreenProps) {
  const t = useTranslations('publicPages.becomeHelper');
  const welcome = data.welcomeReward;
  const repeat = data.repeatReward;
  const onboardingHref = routes.signIn(routes.app.helperOnboarding());

  const giftAmount = welcome ? formatMoney(welcome.amountCents).replace(/\.00$/, '') : '';

  return <div className="space-y-8">
    <div className="relative isolate space-y-6 overflow-hidden rounded-[1.75rem] border border-foreground/[0.06] bg-[linear-gradient(115deg,var(--color-brand-soft),var(--color-clay-soft)_55%,var(--color-violet-soft))] p-5 sm:p-10 dark:border-white/[0.06]">
      <PageHeader title={t('title')} description={t('description')} />
      <Link href={onboardingHref} className={buttonVariants()}>{t('cta')}</Link>
    </div>

    {/* The welcome gift card first (blueprint 05 §2, 2026-11-14): three checks, then $50, for every helper. */}
    {welcome && <section aria-labelledby="welcome-gift-title" className="relative isolate overflow-hidden rounded-[1.75rem] border border-badge-reward-foreground/15 bg-badge-reward p-5 text-badge-reward-foreground sm:p-10">
      <span aria-hidden="true" className="pointer-events-none absolute -top-32 -right-24 -z-10 size-96 rounded-full opacity-40 blur-3xl" style={{ backgroundImage: 'var(--iridescent)' }} />
      <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-4">
          <p className="text-xs font-semibold tracking-[0.16em] uppercase">{t('welcomeEyebrow')}</p>
          <h2 id="welcome-gift-title" className="font-display text-3xl leading-tight font-semibold tracking-[-0.03em] text-balance sm:text-4xl">{t('welcomeOffer', { amount: giftAmount })}</h2>
          <p className="max-w-reading text-lg">{t('welcomeTerms')}</p>
          <ol className="grid gap-3 sm:grid-cols-3">
            {welcome.checks.map((check, index) => <li key={check} className="flex min-h-14 items-center gap-3 rounded-2xl border border-badge-reward-foreground/12 bg-card/60 px-4 py-3 text-foreground dark:bg-white/[0.04]">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background tabular-nums">{index + 1}</span>
              <span className="font-semibold">{t(`welcomeChecks.${check}`)}</span>
            </li>)}
          </ol>
          <p className="text-sm">{t('welcomeUnlock', { redeemDays: welcome.redeemWithinDays })}</p>
          <Link href={onboardingHref} className={buttonVariants({ size: 'lg' })}>{t('welcomeCta', { amount: giftAmount })}</Link>
        </div>
        <div aria-hidden="true" className="relative mx-auto grid aspect-[1.586] w-64 max-w-full -rotate-3 overflow-hidden rounded-3xl p-5 text-white shadow-[0_24px_60px_-24px_rgb(80_40_140/0.6)] sm:w-72" style={{ backgroundImage: 'var(--iridescent)' }}>
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_0%,rgb(255_255_255/0.45),transparent_55%)]" />
          <div className="relative flex items-start justify-between"><Gift className="size-6" /><span className="text-xs font-semibold tracking-[0.14em] uppercase">{t('welcomeArt')}</span></div>
          <p className="relative self-end font-display text-5xl leading-none font-semibold tracking-[-0.04em]">{giftAmount}</p>
        </div>
      </div>
    </section>}

    <Section title={t('requirementsTitle')}>
      <ul className="grid gap-4 md:grid-cols-3">
        <li className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
          <span aria-hidden="true" className="mb-4 grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary"><ShieldCheck className="size-5" /></span>
          <h3 className="font-display text-[17px] leading-6 font-semibold tracking-[-0.01em] lg:text-lg">{t('identityTitle')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t('identityDescription')}</p>
        </li>
        <li className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
          <span aria-hidden="true" className="mb-4 grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary"><CircleDollarSign className="size-5" /></span>
          <h3 className="font-display text-[17px] leading-6 font-semibold tracking-[-0.01em] lg:text-lg">{t('payoutTitle')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t('payoutDescription')}</p>
        </li>
        {data.inHomeCategoriesRequireBackgroundCheck && <li className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
          <span aria-hidden="true" className="mb-4 grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary"><BadgeCheck className="size-5" /></span>
          <h3 className="font-display text-[17px] leading-6 font-semibold tracking-[-0.01em] lg:text-lg">{t('backgroundTitle')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t('backgroundDescription')}</p>
        </li>}
      </ul>
    </Section>

    <div className="grid items-start gap-6 md:grid-cols-2">
      <div className="space-y-6">
        <Section title={t('earningsTitle')}><p className="text-muted-foreground">{t('earningsDescription')}</p></Section>
        <Section title={t('timingTitle')}>
          <p className="text-muted-foreground">{t('timingDescription')}</p>
          <p className="rounded-2xl bg-muted p-4 font-medium tabular-nums">{t('firstPayout', { days: data.firstPayoutDays })}</p>
        </Section>
      </div>
      <PriceBreakdown breakdown={data.exampleEarnings} variant="helper" title={t('earningsBreakdownTitle')} />
    </div>

    {(welcome || repeat) && <Section title={t('rewardsTitle')} description={t('rewardsDescription')}>
      <div className="grid items-start gap-4 md:grid-cols-2">
        {welcome && <section aria-label={t('welcomeTitle')} className="rounded-xl border border-border bg-badge-reward p-4 text-badge-reward-foreground sm:p-6">
          <Gift aria-hidden="true" className="mb-3 size-6" />
          <h3 className="font-display text-[17px] leading-6 font-semibold tracking-[-0.01em] lg:text-lg">{t('welcomeTitle')}</h3>
          <p className="mt-3 text-lg font-semibold tabular-nums">{t('welcomeOffer', { amount: giftAmount })}</p>
          <p className="mt-4 text-sm">{t('welcomeTerms')}</p>
          <p className="mt-3 text-sm">{t('welcomeUnlock', { redeemDays: welcome.redeemWithinDays })}</p>
        </section>}
        {repeat && <section aria-label={t('repeatTitle')} className="rounded-xl border border-border bg-badge-reward p-4 text-badge-reward-foreground sm:p-6">
          <Gift aria-hidden="true" className="mb-3 size-6" />
          <h3 className="font-display text-[17px] leading-6 font-semibold tracking-[-0.01em] lg:text-lg">{t('repeatTitle')}</h3>
          <p className="mt-3 text-lg font-semibold tabular-nums">{t('repeatOffer', { amount: formatMoney(repeat.amountCents) })}</p>
          <p className="mt-4 text-sm">{t('repeatTerms', { bookings: repeat.bookingsNeeded, days: repeat.withinDays, minimum: formatMoney(repeat.minTaskPriceCents) })}</p>
          <p className="mt-3 text-sm">{t('repeatUnlock', { days: repeat.unlockDays, redeemDays: repeat.redeemWithinDays })}</p>
        </section>}
      </div>
      <p className="max-w-reading text-sm text-muted-foreground">{t('rewardConditions')}</p>
      <Link href={routes.legal('rewards-terms')} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('rewardTermsLink')}</Link>
    </Section>}
    <p className="text-sm text-muted-foreground">{t('rewardPolicy')}</p>

    <section className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 sm:p-6 dark:border-white/[0.06]">
      <h2 className="font-display text-xl leading-7 font-semibold tracking-[-0.015em] lg:text-[22px] lg:leading-[30px]">{t('closingTitle')}</h2>
      <p className="mt-2 text-muted-foreground">{t('closingDescription')}</p>
      <Link href={onboardingHref} className={cn(buttonVariants(), 'mt-4')}>{t('cta')}</Link>
    </section>
  </div>;
}
