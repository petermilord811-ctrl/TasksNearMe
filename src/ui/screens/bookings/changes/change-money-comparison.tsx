import { useTranslations } from 'next-intl';
import type { PriceBreakdown } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { PriceBreakdown as PriceBreakdownTable } from '@/ui/components/money/price-breakdown';

/** The server supplies both totals and their difference; only presentation happens here. */
export function ChangeMoneyComparison({ before, after, viewerRole, differenceCents }: {
  before: PriceBreakdown;
  after: PriceBreakdown;
  viewerRole: 'poster' | 'helper';
  differenceCents?: number;
}) {
  const t = useTranslations('changes.money');
  return <div className="space-y-4">
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <PriceBreakdownTable breakdown={before} variant={viewerRole} title={t('before')} />
      <PriceBreakdownTable breakdown={after} variant={viewerRole} title={t('after')} />
    </div>
    {viewerRole === 'poster' && differenceCents !== undefined && <p className="rounded-xl border border-primary/20 bg-secondary p-4 font-medium text-secondary-foreground tabular-nums">
      {t(differenceCents > 0 ? 'increase' : differenceCents < 0 ? 'refund' : 'unchanged', { amount: formatMoney(Math.abs(differenceCents)) })}
    </p>}
  </div>;
}
