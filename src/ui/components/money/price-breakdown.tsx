import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { BreakdownVariant, PriceBreakdown as PriceBreakdownData } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { cn } from '@/ui/lib/utils';
import { Money } from './money';

export interface PriceBreakdownProps {
  breakdown: PriceBreakdownData;
  variant: BreakdownVariant;
  title?: string;
  /** Context-specific label for a poster's total, for example a booking already charged. */
  posterTotalLabel?: string;
}

function Line({
  label,
  children,
  total = false,
  secondary = false,
}: {
  label: string;
  children: ReactNode;
  total?: boolean;
  secondary?: boolean;
}) {
  return (
    <div className={cn('flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2', total && 'mt-2 border-t border-border pt-4 font-semibold', secondary && 'text-sm text-muted-foreground')}>
      <dt className="min-w-0 flex-1">{label}</dt>
      <dd className="m-0 shrink-0 text-right tabular-nums">{children}</dd>
    </div>
  );
}

/** Every amount is supplied by the app. This component formats values; it never derives totals. */
export function PriceBreakdown({ breakdown, variant, title, posterTotalLabel }: PriceBreakdownProps) {
  const t = useTranslations('money');
  const showPoster = variant === 'poster' || variant === 'admin';
  const showHelper = variant === 'helper' || variant === 'admin';
  const hourly = breakdown.pricingType === 'hourly' ? breakdown.hourly : undefined;
  const hasFinalExpenses = breakdown.approvedExpensesCents !== undefined;
  const titleText = title ?? t('title');

  return (
    <section aria-label={titleText} className="w-full min-w-0 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
      <h2 className="mb-4 text-xl font-semibold leading-7">{titleText}</h2>
      <dl className="text-base">
        <Line label={t('taskPrice')}><Money cents={breakdown.taskPriceCents} /></Line>
        {hourly && (
          <Line label={hourly.basis === 'cap' ? t('hourlyCap') : t('approvedHours')} secondary>
            {t(hourly.basis === 'cap' ? 'hourlyCapCalculation' : 'hourlyCalculation', {
              rate: formatMoney(hourly.rateCents),
              hours: formatHours(hourly.hours),
            })}
          </Line>
        )}
        {showPoster && (
          <>
            <Line label={variant === 'admin' ? t('posterServiceFee') : t('serviceFee')}>
              <Money cents={breakdown.posterFeeCents} />
            </Line>
            {breakdown.expenseAllowanceCents > 0 && (
              <Line label={hasFinalExpenses ? t('fundedAllowance') : t('expenseAllowance')} secondary={hasFinalExpenses}>
                <Money cents={breakdown.expenseAllowanceCents} size={hasFinalExpenses ? 'sm' : 'md'} />
              </Line>
            )}
            {breakdown.approvedExpensesCents !== undefined && (
              <Line label={t('approvedExpenses')}><Money cents={breakdown.approvedExpensesCents} /></Line>
            )}
            {breakdown.posterChargedCents !== undefined && (
              <Line label={t('charged')}><Money cents={breakdown.posterChargedCents} /></Line>
            )}
            {breakdown.posterRefundCents !== undefined && (
              <Line label={t('refund')}><Money cents={breakdown.posterRefundCents} /></Line>
            )}
            <Line label={variant === 'admin' ? t('posterTotal') : breakdown.posterChargedCents !== undefined ? t('finalTotal') : posterTotalLabel ?? t('total')} total>
              <Money cents={breakdown.posterTotalCents} size="lg" />
            </Line>
          </>
        )}
        {showHelper && (
          <>
            <Line label={variant === 'admin' ? t('helperServiceFee') : t('serviceFee')}>
              <span className="whitespace-nowrap tabular-nums">{t('deduction', { amount: formatMoney(breakdown.helperFeeCents) })}</span>
            </Line>
            <Line label={variant === 'admin' ? t('helperEarnings') : t('earnings')} total>
              <Money cents={breakdown.helperEarningsCents} size="lg" />
            </Line>
            {breakdown.helperReimbursementCents !== undefined && (
              <Line label={t('reimbursement')}><Money cents={breakdown.helperReimbursementCents} /></Line>
            )}
          </>
        )}
        {variant === 'admin' && (
          <Line label={t('platformRevenue')} total><Money cents={breakdown.platformRevenueCents} /></Line>
        )}
      </dl>
      {showHelper && breakdown.helperReimbursementCents !== undefined && (
        <p className="mt-3 text-sm text-muted-foreground">{t(variant === 'admin' ? 'adminReimbursementNote' : 'reimbursementNote')}</p>
      )}
    </section>
  );
}
