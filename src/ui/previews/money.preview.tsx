import { useTranslations } from 'next-intl';
import type { BreakdownVariant, PreviewEntry, PriceBreakdown as PriceBreakdownData } from '@/contracts';
import {
  deskBreakdown,
  smallTaskBreakdown,
  movingFundedBreakdown,
  movingFinalBreakdown,
  deskWithExpensesFinalBreakdown,
  deskSettledBreakdown,
} from '@/fixtures';
import { Money } from '@/ui/components/money/money';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import moneyCopy from '../../../messages/en/ui/money.json';

function AmountsPreview() {
  const t = useTranslations('money');
  const sizes = [
    { size: 'sm', label: 'small' },
    { size: 'md', label: 'medium' },
    { size: 'lg', label: 'large' },
  ] as const;

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('preview.amounts')}</h1>
      {sizes.map(({ size, label }) => (
        <section key={size} className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">{t(`preview.${label}`)}</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Money cents={6600} size={size} />
            <Money cents={-600} size={size} />
            <Money cents={2200} signDisplay="always" size={size} />
            <Money cents={0} size={size} />
          </div>
        </section>
      ))}
    </main>
  );
}

type BreakdownTitle = 'deskPoster' | 'deskHelper' | 'deskAdmin' | 'smallTaskPoster' | 'movingFundedPoster' | 'movingFinalPoster' | 'movingFinalHelper' | 'expensesFinalPoster' | 'expensesFinalHelper' | 'settledPoster' | 'settledHelper';

function BreakdownPreview({ breakdown, variant, titleKey }: { breakdown: PriceBreakdownData; variant: BreakdownVariant; titleKey: BreakdownTitle }) {
  const t = useTranslations('money');
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t(`preview.${titleKey}`)}</h1>
      <PriceBreakdown breakdown={breakdown} variant={variant} />
    </main>
  );
}

const breakdowns: Array<{ id: string; titleKey: BreakdownTitle; breakdown: PriceBreakdownData; variant: BreakdownVariant }> = [
  { id: 'desk-poster', titleKey: 'deskPoster', breakdown: deskBreakdown, variant: 'poster' },
  { id: 'desk-helper', titleKey: 'deskHelper', breakdown: deskBreakdown, variant: 'helper' },
  { id: 'desk-admin', titleKey: 'deskAdmin', breakdown: deskBreakdown, variant: 'admin' },
  { id: 'small-task-poster', titleKey: 'smallTaskPoster', breakdown: smallTaskBreakdown, variant: 'poster' },
  { id: 'moving-funded-poster', titleKey: 'movingFundedPoster', breakdown: movingFundedBreakdown, variant: 'poster' },
  { id: 'moving-final-poster', titleKey: 'movingFinalPoster', breakdown: movingFinalBreakdown, variant: 'poster' },
  { id: 'moving-final-helper', titleKey: 'movingFinalHelper', breakdown: movingFinalBreakdown, variant: 'helper' },
  { id: 'expenses-final-poster', titleKey: 'expensesFinalPoster', breakdown: deskWithExpensesFinalBreakdown, variant: 'poster' },
  { id: 'expenses-final-helper', titleKey: 'expensesFinalHelper', breakdown: deskWithExpensesFinalBreakdown, variant: 'helper' },
  { id: 'settled-poster', titleKey: 'settledPoster', breakdown: deskSettledBreakdown, variant: 'poster' },
  { id: 'settled-helper', titleKey: 'settledHelper', breakdown: deskSettledBreakdown, variant: 'helper' },
];

export const moneyPreviews: PreviewEntry[] = [
  { id: 'money/amounts', group: moneyCopy.preview.group, title: moneyCopy.preview.amounts, render: () => <AmountsPreview /> },
  ...breakdowns.map(({ id, titleKey, breakdown, variant }) => ({
    id: `price-breakdown/${id}`,
    group: moneyCopy.preview.breakdownGroup,
    title: moneyCopy.preview[titleKey],
    render: () => <BreakdownPreview titleKey={titleKey} breakdown={breakdown} variant={variant} />,
  })),
];
