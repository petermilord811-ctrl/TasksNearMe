import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { CircleDollarSign, Clock, CreditCard } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { PricingPageData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatMoney } from '@/shared/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

export interface PricingScreenProps { data: PricingPageData }

/** The optional plans (completion plan 9.13): what each adds, its price and cap, and a link to subscribe. */
function PricingPlans({ plans }: { plans: NonNullable<PricingPageData['plans']> }) {
  const t = useTranslations('plan');
  const locale = useLocale();
  const money = (cents: number) => formatMoney(cents).replace(/\.00$/, '');
  return <Section title={t('pricing.title')}>
    <p className="max-w-reading text-muted-foreground">{t('pricing.intro')}</p>
    <div className="grid gap-4 md:grid-cols-2">
      {plans.map((offer) => <div key={offer.plan} className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-5 shadow-card dark:border-white/[0.06]">
        <p className="text-sm font-medium text-muted-foreground">{t(`plans.${offer.plan}.for`)}</p>
        <h3 className="font-display text-xl font-semibold tracking-[-0.01em]">{t(`plans.${offer.plan}.name`)}</h3>
        <p className="mt-2 tabular-nums"><span className="font-semibold">{t('price.month', { price: money(offer.monthlyCents) })}</span> <span className="text-muted-foreground">{t('price.year', { price: money(offer.yearlyCents) })}</span></p>
        <p className="mt-2 text-sm">{t(`plans.${offer.plan}.rebate`, { share: new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(offer.rebateBps / 10_000), cap: money(offer.rebateMonthlyCapCents) })}</p>
      </div>)}
    </div>
    <Link href={routes.app.plan()} className={cn(buttonVariants({ variant: 'outline' }), 'w-fit')}>{t('pricing.link')}</Link>
  </Section>;
}

/** Fee policy and examples are supplied by the app; this screen only formats them. */
export function PricingScreen({ data }: PricingScreenProps) {
  const t = useTranslations('publicPages.pricing');

  return <div className="space-y-8">
    <PageHeader title={t('title')} description={t('description')} />
    <p className="flex w-fit max-w-full items-center gap-3 rounded-[1.375rem] bg-secondary py-3 pr-5 pl-3 text-secondary-foreground">
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-card/70 text-primary"><CircleDollarSign className="size-5" /></span>
      <span>{t('paymentTiming')}</span>
    </p>

    <Section title={t('feesTitle')}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
          <h3 className="font-display text-[17px] leading-6 font-semibold tracking-[-0.01em] lg:text-lg">{t('posterFeeTitle')}</h3>
          <p className="mt-3 font-display text-3xl font-semibold tracking-[-0.025em] tabular-nums">{t('posterFeeAmount', { percent: data.fees.posterFeePercent })}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t('posterFeeDescription', { minimum: formatMoney(data.fees.posterMinimumCents) })}</p>
        </div>
        <div className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
          <h3 className="font-display text-[17px] leading-6 font-semibold tracking-[-0.01em] lg:text-lg">{t('helperFeeTitle')}</h3>
          <p className="mt-3 font-display text-3xl font-semibold tracking-[-0.025em] tabular-nums">{t('helperFeeAmount', { percent: data.fees.helperFeePercent })}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t('helperFeeDescription')}</p>
        </div>
      </div>
    </Section>
    {data.plans && <PricingPlans plans={data.plans} />}

    <div className="space-y-4">
      <p className="max-w-reading text-muted-foreground">{t('fixedIntro', { price: formatMoney(data.fixedExample.taskPriceCents) })}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <PriceBreakdown breakdown={data.fixedExample} variant="poster" title={t('fixedPosterTitle')} className="h-full" />
        <PriceBreakdown breakdown={data.fixedExample} variant="helper" title={t('fixedHelperTitle')} className="h-full" />
      </div>
    </div>

    <div className="grid items-start gap-4 md:grid-cols-2">
      <Section title={t('minimumTitle')}>
        <p className="text-muted-foreground">{t('minimumDescription', { price: formatMoney(data.minimumFeeExample.taskPriceCents), minimum: formatMoney(data.fees.posterMinimumCents) })}</p>
      </Section>
      <PriceBreakdown breakdown={data.minimumFeeExample} variant="poster" title={t('minimumBreakdownTitle')} />
    </div>

    <Section title={t('hourlyTitle')}>
      <p className="max-w-reading text-muted-foreground">{t('hourlyDescription')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <PriceBreakdown breakdown={data.hourlyExample.funded} variant="poster" title={t('hourlyFundedTitle')} className="h-full" />
        <PriceBreakdown breakdown={data.hourlyExample.final} variant="poster" title={t('hourlyFinalTitle')} className="h-full" />
      </div>
    </Section>

    <Section title={t('expensesTitle')}>
      <p className="max-w-reading text-muted-foreground">{t('expensesDescription')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <PriceBreakdown breakdown={data.expensesExample} variant="poster" title={t('expensesPosterTitle')} className="h-full" />
        <PriceBreakdown breakdown={data.expensesExample} variant="helper" title={t('expensesHelperTitle')} className="h-full" />
      </div>
    </Section>

    <Section title={t('cancellationTitle')}>
      <p className="max-w-reading text-muted-foreground">{t('cancellationDescription', { hours: data.cancellation.freeUntilHours, percent: data.cancellation.lateFeePercent, minimum: formatMoney(data.cancellation.lateFeeMinimumCents) })}</p>
      <div className="rounded-[1.375rem] border border-foreground/[0.07] bg-card p-3 shadow-card sm:p-6 dark:border-white/[0.06]">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="pb-4 text-left font-semibold">{t('cancellationCaption', { price: formatMoney(data.lateCancellationExample.taskPriceCents) })}</caption>
          <thead><tr className="border-b">
            <th scope="col" className="w-[46%] py-3 pr-3 font-semibold">{t('cancellationScenario')}</th>
            <th scope="col" className="w-[27%] px-1 py-3 font-semibold">{t('cancellationRefund')}</th>
            <th scope="col" className="w-[27%] py-3 pl-3 font-semibold">{t('cancellationHelper')}</th>
          </tr></thead>
          <tbody>
            <tr className="border-b">
              <th scope="row" className="py-4 pr-3 align-top font-normal">{t('cancellationEarly', { hours: data.cancellation.freeUntilHours })}</th>
              <td className="px-1 py-4 align-top tabular-nums">{t('fullRefund', { amount: formatMoney(data.lateCancellationExample.posterPaidCents) })}</td>
              <td className="py-4 pl-3 align-top">{t('noPayment')}</td>
            </tr>
            <tr className="border-b">
              <th scope="row" className="py-4 pr-3 align-top font-normal">{t('cancellationLate', { hours: data.cancellation.freeUntilHours })}</th>
              <td className="px-1 py-4 align-top tabular-nums">{formatMoney(data.lateCancellationExample.posterRefundCents)}</td>
              <td className="py-4 pl-3 align-top tabular-nums">{formatMoney(data.lateCancellationExample.helperReceivesCents)}</td>
            </tr>
            <tr>
              <th scope="row" className="py-4 pr-3 align-top font-normal">{t('cancellationHelperCancels')}</th>
              <td className="px-1 py-4 align-top tabular-nums">{t('fullRefund', { amount: formatMoney(data.lateCancellationExample.posterPaidCents) })}</td>
              <td className="py-4 pl-3 align-top">{t('noPayment')}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="max-w-reading text-sm text-muted-foreground">{t('lateFeeExample', { fee: formatMoney(data.lateCancellationExample.feeCents), received: formatMoney(data.lateCancellationExample.helperReceivesCents), refund: formatMoney(data.lateCancellationExample.posterRefundCents) })}</p>
      <Link href={routes.legal('cancellation-policy')} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('cancellationPolicy')}</Link>
    </Section>

    <div className="grid gap-8 border-t pt-8 md:grid-cols-2">
      {([
        { id: 'pricing-approval', Icon: Clock, title: t('approvalTitle'), body: t('approvalDescription', { hours: data.timers.autoApproveHours }) },
        { id: 'pricing-invite', Icon: CreditCard, title: t('inviteTitle'), body: t('inviteDescription', { hours: data.timers.inviteHoldHours }) },
      ]).map(({ id, Icon, title, body }) => <section key={id} aria-labelledby={id} className="flex gap-4">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary"><Icon className="size-5" /></span>
        <div className="min-w-0 space-y-2">
          <h2 id={id} className="font-display text-xl leading-7 font-semibold tracking-[-0.02em] lg:text-[1.375rem] lg:leading-[1.875rem]">{title}</h2>
          <p className="text-muted-foreground">{body}</p>
        </div>
      </section>)}
    </div>
    <Link href={routes.app.newTask()} className={cn(buttonVariants(), 'whitespace-normal text-center')}>{t('postTask')}</Link>
  </div>;
}
