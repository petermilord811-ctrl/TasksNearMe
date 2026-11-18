import type { ReactNode } from 'react';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ChevronDown, CircleDollarSign, Clock, CreditCard } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { PricingPageData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatMoney } from '@/shared/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { ClosingCta } from '@/ui/components/layout/closing-cta';
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

/** A worked example behind a native disclosure: works without JavaScript and stays in the page for search. */
function Example({ title, children }: { title: string; children: ReactNode }) {
  return <details className="group rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]">
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-[1.375rem] px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-6 [&::-webkit-details-marker]:hidden">
      <h2 className="font-display text-lg leading-7 font-semibold tracking-[-0.015em] lg:text-xl">{title}</h2>
      <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
    </summary>
    <div className="space-y-4 px-4 pb-5 sm:px-6 sm:pb-6">{children}</div>
  </details>;
}

/**
 * The cancellation example: a table from small tablets up; on phones, one card per case with its two amounts
 * stacked (audit M24: three columns in 330 px wrapped every cell).
 */
function CancellationExample({ data }: { data: PricingPageData }) {
  const t = useTranslations('publicPages.pricing');
  const example = data.lateCancellationExample;
  const hours = data.cancellation.freeUntilHours;
  const fullRefund = t('fullRefund', { amount: formatMoney(example.posterPaidCents) });
  const cases = [
    { id: 'early', label: t('cancellationEarly', { hours }), refund: fullRefund, helper: t('noPayment') },
    { id: 'late', label: t('cancellationLate', { hours }), refund: formatMoney(example.posterRefundCents), helper: formatMoney(example.helperReceivesCents) },
    { id: 'helper', label: t('cancellationHelperCancels'), refund: fullRefund, helper: t('noPayment') },
  ];
  const caption = t('cancellationCaption', { price: formatMoney(example.taskPriceCents) });
  return <>
    <div className="hidden rounded-[1.375rem] border border-foreground/[0.07] bg-background/60 p-6 sm:block dark:border-white/[0.06]">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="pb-4 text-left font-semibold">{caption}</caption>
        <thead><tr className="border-b">
          <th scope="col" className="w-[46%] py-3 pr-3 font-semibold">{t('cancellationScenario')}</th>
          <th scope="col" className="w-[27%] px-1 py-3 font-semibold">{t('cancellationRefund')}</th>
          <th scope="col" className="w-[27%] py-3 pl-3 font-semibold">{t('cancellationHelper')}</th>
        </tr></thead>
        <tbody>
          {cases.map((row, index) => <tr key={row.id} className={cn(index < cases.length - 1 && 'border-b')}>
            <th scope="row" className="py-4 pr-3 align-top font-normal">{row.label}</th>
            <td className="px-1 py-4 align-top tabular-nums">{row.refund}</td>
            <td className="py-4 pl-3 align-top tabular-nums">{row.helper}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className="space-y-2 sm:hidden">
      <p className="font-semibold">{caption}</p>
      <ul className="space-y-2">
        {cases.map((row) => <li key={row.id} className="rounded-2xl border border-foreground/[0.08] bg-background/60 p-4 dark:border-white/[0.07]">
          <p className="font-medium">{row.label}</p>
          <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t('cancellationRefund')}</dt><dd className="text-right tabular-nums">{row.refund}</dd>
            <dt className="text-muted-foreground">{t('cancellationHelper')}</dt><dd className="text-right tabular-nums">{row.helper}</dd>
          </dl>
        </li>)}
      </ul>
    </div>
  </>;
}

/** Fee policy and examples are supplied by the app; this screen only formats them. */
export function PricingScreen({ data }: PricingScreenProps) {
  const t = useTranslations('publicPages.pricing');
  const pages = useTranslations('publicPages');

  return <div className="space-y-8">
    <PageHeader title={t('title')} description={t('description')} />
    <p className="flex w-fit max-w-full items-center gap-3 rounded-[1.375rem] border border-callout-border bg-callout py-3 pr-5 pl-3 text-callout-foreground">
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-card/70 text-callout-accent dark:bg-white/[0.05]"><CircleDollarSign className="size-5" /></span>
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

    {/* The other worked examples, one disclosure each (audit M25): a phone shows the fees and one example first. */}
    <div className="space-y-3">
      <Example title={t('minimumTitle')}>
        <p className="text-muted-foreground">{t('minimumDescription', { price: formatMoney(data.minimumFeeExample.taskPriceCents), minimum: formatMoney(data.fees.posterMinimumCents) })}</p>
        <PriceBreakdown breakdown={data.minimumFeeExample} variant="poster" title={t('minimumBreakdownTitle')} />
      </Example>

      <Example title={t('hourlyTitle')}>
        <p className="max-w-reading text-muted-foreground">{t('hourlyDescription')}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <PriceBreakdown breakdown={data.hourlyExample.funded} variant="poster" title={t('hourlyFundedTitle')} className="h-full" />
          <PriceBreakdown breakdown={data.hourlyExample.final} variant="poster" title={t('hourlyFinalTitle')} className="h-full" />
        </div>
      </Example>

      <Example title={t('expensesTitle')}>
        <p className="max-w-reading text-muted-foreground">{t('expensesDescription')}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <PriceBreakdown breakdown={data.expensesExample} variant="poster" title={t('expensesPosterTitle')} className="h-full" />
          <PriceBreakdown breakdown={data.expensesExample} variant="helper" title={t('expensesHelperTitle')} className="h-full" />
        </div>
      </Example>

      <Example title={t('cancellationTitle')}>
        <p className="max-w-reading text-muted-foreground">{t('cancellationDescription', { hours: data.cancellation.freeUntilHours, percent: data.cancellation.lateFeePercent, minimum: formatMoney(data.cancellation.lateFeeMinimumCents) })}</p>
        <CancellationExample data={data} />
        <p className="max-w-reading text-sm text-muted-foreground">{t('lateFeeExample', { fee: formatMoney(data.lateCancellationExample.feeCents), received: formatMoney(data.lateCancellationExample.helperReceivesCents), refund: formatMoney(data.lateCancellationExample.posterRefundCents) })}</p>
        <Link href={routes.legal('cancellation-policy')} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('cancellationPolicy')}</Link>
      </Example>
    </div>

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
    <ClosingCta title={pages('category.ctaTitle')} body={pages('category.ctaBody')} action={{ href: routes.app.newTask(), label: t('postTask') }} />
  </div>;
}
