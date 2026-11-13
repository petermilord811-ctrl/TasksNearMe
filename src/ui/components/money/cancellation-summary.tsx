import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes, type CancellationPolicySummary } from '@/contracts';
import { formatDateTime, formatMoney } from '@/shared/format';
import { surface, surfacePad } from '@/ui/components/bookings/surface';
import { cn } from '@/ui/lib/utils';

export interface CancellationSummaryProps {
  policy: CancellationPolicySummary;
  helperName: string;
}

/** Refunds and compensation are supplied by the app, including for hourly offers. */
export function CancellationSummary({ policy, helperName }: CancellationSummaryProps) {
  const t = useTranslations('bookingConfirm.cancellation');

  return <section aria-label={t('title')} className={cn(surface, surfacePad, 'space-y-3')}>
    <h2 className="font-heading text-xl/7 font-semibold tracking-[-0.015em]">{t('title')}</h2>
    <p className="tabular-nums">{t('freeUntil', { date: formatDateTime(policy.freeUntil) })}</p>
    <p className="tabular-nums">{t('late', {
      refund: formatMoney(policy.lateRefundCents),
      helperName,
      compensation: formatMoney(policy.lateHelperCompensationCents),
    })}</p>
    <Link href={routes.legal('cancellation-policy')} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t('fullPolicy')}</Link>
  </section>;
}
