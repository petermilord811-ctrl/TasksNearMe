import Link from 'next/link';
import { CircleDollarSign, Clock, CreditCard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type PricingPageData } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { PageHeader, PriceBreakdown, Section } from '@/ui/components';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

export interface PricingScreenProps { data: PricingPageData }

/** Fee policy and examples are supplied by the app; this screen only formats them. */
export function PricingScreen({ data }: PricingScreenProps) {
  const t = useTranslations('publicPages.pricing');

  return <div className="space-y-8">
    <PageHeader title={t('title')} description={t('description')} />
    <p className="flex items-start gap-3 rounded-xl bg-secondary p-4 text-secondary-foreground sm:p-6">
      <CircleDollarSign aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span>{t('paymentTiming')}</span>
    </p>

    <Section title={t('feesTitle')}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-card sm:p-6">
          <h3 className="text-[17px] leading-6 font-semibold lg:text-lg">{t('posterFeeTitle')}</h3>
          <p className="mt-3 text-2xl font-bold tabular-nums">{t('posterFeeAmount', { percent: data.fees.posterFeePercent })}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t('posterFeeDescription', { minimum: formatMoney(data.fees.posterMinimumCents) })}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card sm:p-6">
          <h3 className="text-[17px] leading-6 font-semibold lg:text-lg">{t('helperFeeTitle')}</h3>
          <p className="mt-3 text-2xl font-bold tabular-nums">{t('helperFeeAmount', { percent: data.fees.helperFeePercent })}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t('helperFeeDescription')}</p>
        </div>
      </div>
    </Section>

    <div className="space-y-4">
      <p className="max-w-reading text-muted-foreground">{t('fixedIntro', { price: formatMoney(data.fixedExample.taskPriceCents) })}</p>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <PriceBreakdown breakdown={data.fixedExample} variant="poster" title={t('fixedPosterTitle')} />
        <PriceBreakdown breakdown={data.fixedExample} variant="helper" title={t('fixedHelperTitle')} />
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
      <div className="grid items-start gap-4 md:grid-cols-2">
        <PriceBreakdown breakdown={data.hourlyExample.funded} variant="poster" title={t('hourlyFundedTitle')} />
        <PriceBreakdown breakdown={data.hourlyExample.final} variant="poster" title={t('hourlyFinalTitle')} />
      </div>
    </Section>

    <Section title={t('expensesTitle')}>
      <p className="max-w-reading text-muted-foreground">{t('expensesDescription')}</p>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <PriceBreakdown breakdown={data.expensesExample} variant="poster" title={t('expensesPosterTitle')} />
        <PriceBreakdown breakdown={data.expensesExample} variant="helper" title={t('expensesHelperTitle')} />
      </div>
    </Section>

    <Section title={t('cancellationTitle')}>
      <p className="max-w-reading text-muted-foreground">{t('cancellationDescription', { hours: data.cancellation.freeUntilHours, percent: data.cancellation.lateFeePercent, minimum: formatMoney(data.cancellation.lateFeeMinimumCents) })}</p>
      <div className="rounded-xl border bg-card p-3 shadow-card sm:p-6">
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

    <div className="grid gap-6 border-t pt-8 md:grid-cols-2">
      <Section title={t('approvalTitle')}>
        <Clock aria-hidden="true" className="size-5 text-primary" />
        <p className="text-muted-foreground">{t('approvalDescription', { hours: data.timers.autoApproveHours })}</p>
      </Section>
      <Section title={t('inviteTitle')}>
        <CreditCard aria-hidden="true" className="size-5 text-primary" />
        <p className="text-muted-foreground">{t('inviteDescription', { hours: data.timers.inviteHoldHours })}</p>
      </Section>
    </div>
    <Link href={routes.app.newTask()} className={cn(buttonVariants(), 'whitespace-normal text-center')}>{t('postTask')}</Link>
  </div>;
}
