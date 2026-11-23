import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { BreakdownVariant, PriceBreakdown as PriceBreakdownData } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { surface, surfacePad } from '@/ui/components/bookings/surface';
import { cn } from '@/ui/lib/utils';
import { Money } from './money';

export interface PriceBreakdownProps {
  breakdown: PriceBreakdownData;
  variant: BreakdownVariant;
  title?: string;
  /** Context-specific label for a poster's total, for example a booking already charged. */
  posterTotalLabel?: string;
  headingLevel?: 2 | 3 | 4;
  /** Without a card of its own, for a breakdown inside another card (its heading steps down to a card title). */
  flat?: boolean;
  /** Classes for the outer section, such as spacing in a parent's layout. */
  className?: string;
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
  // A total stands on a band of its own, so the figure that matters reads first: a callout band, 9.8's one highlight (it
  // was the secondary peach, f7's visual pass, 2026-11-18). In a card a grid stretched, the room left goes above the
  // total (`mt-auto`), so two cards side by side end on their totals instead of one floating mid-card.
  return (
    <div data-total={total || undefined} className={cn(
      'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2',
      total && 'mt-auto -mx-3 rounded-2xl border border-callout-border bg-callout px-3 py-3 font-semibold text-callout-foreground',
      secondary && 'text-sm text-muted-foreground',
    )}>
      <dt className="min-w-0 flex-1">{label}</dt>
      <dd className="m-0 shrink-0 text-right tabular-nums">{children}</dd>
    </div>
  );
}

/** Every amount is supplied by the app. This component formats values; it never derives totals. */
export function PriceBreakdown({ breakdown, variant, title, posterTotalLabel, headingLevel = 2, flat = false, className }: PriceBreakdownProps) {
  const t = useTranslations('money');
  const showPoster = variant === 'poster' || variant === 'admin';
  const showHelper = variant === 'helper' || variant === 'admin';
  const hourly = breakdown.pricingType === 'hourly' ? breakdown.hourly : undefined;
  const hasFinalExpenses = breakdown.approvedExpensesCents !== undefined;
  // No service fees since 2026-11-23: the client's only fee is the hold fee on a payment TasksNearMe holds (none when
  // paid directly or waived with Plus), and helpers keep the whole price. A booking made before then still carries a
  // helper fee: it keeps its service-fee lines.
  const serviceFees = breakdown.helperFeeCents > 0;
  const showPosterFee = serviceFees || breakdown.posterFeeCents > 0;
  const titleText = title ?? t('title');
  const Heading = headingLevel === 4 ? 'h4' : headingLevel === 3 ? 'h3' : 'h2';

  return (
    <section aria-label={titleText} className={cn(!flat && [surface, surfacePad], 'flex w-full min-w-0 flex-col', className)}>
      <Heading className={cn('font-heading font-semibold', flat ? 'mb-2 text-[1.0625rem]/6 tracking-[-0.01em]' : 'mb-3 text-xl/7 tracking-[-0.015em]')}>{titleText}</Heading>
      {/* The line before a total keeps the 12 px a total used to take as its own top margin. */}
      <dl className="flex flex-1 flex-col text-base [&>div:has(+[data-total])]:mb-3">
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
            {showPosterFee && (
              <Line label={serviceFees ? t(variant === 'admin' ? 'posterServiceFee' : 'serviceFee') : t(variant === 'admin' ? 'posterHoldFee' : 'holdFee')}>
                <Money cents={breakdown.posterFeeCents} />
              </Line>
            )}
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
            {serviceFees && (
              <Line label={variant === 'admin' ? t('helperServiceFee') : t('serviceFee')}>
                <span className="whitespace-nowrap tabular-nums">{t('deduction', { amount: formatMoney(breakdown.helperFeeCents) })}</span>
              </Line>
            )}
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
