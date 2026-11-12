'use client';

import { useId, useState } from 'react';
import { LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { WalletCards } from 'lucide-react';
import type { PriceBreakdown } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { spring, TweenMoney, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';

/**
 * The pricing card: one example task at the published fees, and (when there are several) a price picker.
 * Picking a price moves everything together: the pill slides to it, each line and both totals run to their
 * new amounts, and the bar re-splits between what the helper earns and the service fees. Every number is the
 * fee engine's (`HomePageData.feeExamples`); the card only chooses which example to show.
 */
export function FeeExplorer({ examples, initial }: { examples: PriceBreakdown[]; initial: PriceBreakdown }) {
  const t = useTranslations('landing.pricing');
  const reduced = usePrefersReducedMotion();
  const pillId = useId();
  const options = examples.length > 0 ? examples : [initial];
  const [index, setIndex] = useState(() => Math.max(0, options.findIndex((example) => example.taskPriceCents === initial.taskPriceCents)));
  const fee = options[index] ?? initial;
  const serviceFees = fee.posterFeeCents + fee.helperFeeCents;
  const helperShare = fee.posterTotalCents > 0 ? (fee.helperEarningsCents / fee.posterTotalCents) * 100 : 0;

  return (
    <LazyMotion features={domMax}>
      <div className="glass rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground" aria-live="polite">{t('example', { price: formatMoney(fee.taskPriceCents) })}</p>
          {options.length > 1 && (
            <div role="group" aria-label={t('pickPrice')} className="flex gap-1 rounded-full bg-foreground/[0.06] p-1">
              {options.map((example, position) => {
                const on = position === index;
                return (
                  <button
                    key={example.taskPriceCents}
                    type="button"
                    aria-pressed={on}
                    aria-label={t('priceOption', { price: formatMoney(example.taskPriceCents) })}
                    onClick={() => setIndex(position)}
                    className={cn('relative isolate min-h-9 min-w-11 rounded-full px-3 text-sm font-semibold tabular-nums transition-[color,transform] duration-300 active:scale-[0.95]', on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {on && <m.span layoutId={pillId} aria-hidden="true" className="absolute inset-0 -z-10 rounded-full bg-card shadow-[0_6px_16px_-8px_rgb(0_0_0/0.35)]" transition={reduced ? { duration: 0 } : spring.bloom} />}
                    {formatMoney(example.taskPriceCents)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t('taskPrice')}</dt><dd className="font-medium"><TweenMoney cents={fee.taskPriceCents} /></dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t('clientFee')}</dt><dd className="font-medium"><TweenMoney cents={fee.posterFeeCents} prefix="+" /></dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t('helperFee')}</dt><dd className="font-medium"><TweenMoney cents={fee.helperFeeCents} prefix="−" /></dd></div>
        </dl>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-card/80 p-5">
            <p className="text-sm text-muted-foreground">{t('clientPays')}</p>
            <p className="mt-1 font-display text-4xl font-semibold tracking-[-0.03em]"><TweenMoney cents={fee.posterTotalCents} countUpOnReveal /></p>
          </div>
          <div className="rounded-2xl p-5 text-white" style={{ backgroundImage: 'linear-gradient(135deg, var(--violet), #3a2a8a)' }}>
            <p className="text-sm text-white/80">{t('helperEarns')}</p>
            <p className="mt-1 font-display text-4xl font-semibold tracking-[-0.03em]"><TweenMoney cents={fee.helperEarningsCents} countUpOnReveal /></p>
          </div>
        </div>
        <div className="mt-5" aria-hidden="true">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-foreground/[0.06]">
            <div className="h-full rounded-l-full transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${helperShare}%`, backgroundImage: 'linear-gradient(90deg, var(--violet), #3a2a8a)' }} />
            <div className="h-full flex-1 bg-primary/70" />
          </div>
          <div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
            <span>{t('splitHelper', { amount: formatMoney(fee.helperEarningsCents) })}</span>
            <span>{t('splitFees', { amount: formatMoney(serviceFees) })}</span>
          </div>
        </div>
        <p className="mt-5 flex items-start gap-2 text-sm text-muted-foreground"><WalletCards aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('note')}</p>
      </div>
    </LazyMotion>
  );
}
