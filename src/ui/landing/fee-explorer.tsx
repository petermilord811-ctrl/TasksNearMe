'use client';

import { useId, useState } from 'react';
import { LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { HandCoins, ShieldCheck, WalletCards } from 'lucide-react';
import { PAYMENT_MODES, type FeeExample, type PaymentMode, type PriceBreakdown } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { spring, TweenMoney, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';

/**
 * The pricing card (no service fees since 2026-11-23): one example task, paid directly (the default, no fees) or held by
 * TasksNearMe (upfront, the client's small hold fee), and (when there are several) a price picker. Switching moves
 * everything together: the pills slide, each line and both totals run to their new amounts, and the bar re-splits
 * between what the helper gets and the hold fee. Every number is the fee engine's (`HomePageData.feeExamples`); the
 * card only chooses which example to show.
 */
export function FeeExplorer({ examples, initial, className = 'glass rounded-[2rem] p-6 sm:p-8' }: { examples: FeeExample[]; initial: PriceBreakdown; className?: string }) {
  const t = useTranslations('landing.pricing');
  const reduced = usePrefersReducedMotion();
  const pillId = useId();
  const modeId = useId();
  const options: FeeExample[] = examples.length > 0 ? examples : [{ direct: initial, held: initial }];
  const [index, setIndex] = useState(() => Math.max(0, options.findIndex((example) => example.held.taskPriceCents === initial.taskPriceCents)));
  const [mode, setMode] = useState<PaymentMode>('direct');
  const fee = (options[index] ?? options[0]!)[mode];
  const held = mode === 'held';
  const helperShare = fee.posterTotalCents > 0 ? (fee.helperEarningsCents / fee.posterTotalCents) * 100 : 0;
  const pill = (layoutId: string) => <m.span layoutId={layoutId} aria-hidden="true" className="absolute inset-0 -z-10 rounded-full bg-card shadow-[0_6px_16px_-8px_rgb(0_0_0/0.35)]" transition={reduced ? { duration: 0 } : spring.bloom} />;
  const pillButton = 'relative isolate min-h-9 rounded-full px-3 text-sm font-semibold transition-[color,transform] duration-300 active:scale-[0.95]';

  return (
    <LazyMotion features={domMax}>
      <div className={className}>
        <div role="group" aria-label={t('modeLabel')} className="grid grid-cols-2 gap-1 rounded-full bg-foreground/[0.06] p-1">
          {PAYMENT_MODES.map((option) => {
            const on = option === mode;
            const Icon = option === 'held' ? ShieldCheck : HandCoins;
            return (
              <button key={option} type="button" aria-pressed={on} onClick={() => setMode(option)} className={cn(pillButton, 'inline-flex items-center justify-center gap-1.5 px-2', on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {on && pill(modeId)}
                <Icon aria-hidden="true" className="size-4 shrink-0" />{t(`modes.${option}`)}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground" aria-live="polite">{t('example', { price: formatMoney(fee.taskPriceCents) })}</p>
          {options.length > 1 && (
            <div role="group" aria-label={t('pickPrice')} className="flex gap-1 rounded-full bg-foreground/[0.06] p-1">
              {options.map((example, position) => {
                const on = position === index;
                return (
                  <button
                    key={example.held.taskPriceCents}
                    type="button"
                    aria-pressed={on}
                    aria-label={t('priceOption', { price: formatMoney(example.held.taskPriceCents) })}
                    onClick={() => setIndex(position)}
                    className={cn(pillButton, 'min-w-11 tabular-nums', on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {on && pill(pillId)}
                    {formatMoney(example.held.taskPriceCents)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t('taskPrice')}</dt><dd className="font-medium"><TweenMoney cents={fee.taskPriceCents} /></dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t('serviceFees')}</dt><dd className="font-medium text-success">{t('none')}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t('holdFee')}</dt><dd className="font-medium">{held && fee.posterFeeCents > 0 ? <TweenMoney cents={fee.posterFeeCents} prefix="+" /> : <span className="text-success">{t('none')}</span>}</dd></div>
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
            <div className={cn('h-full rounded-l-full transition-[width] duration-700 ease-[var(--ease-out)]', helperShare >= 100 && 'rounded-r-full')} style={{ width: `${helperShare}%`, backgroundImage: 'linear-gradient(90deg, var(--violet), #3a2a8a)' }} />
            <div className="h-full flex-1 bg-primary/70" />
          </div>
          <div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
            <span>{t('splitHelper', { amount: formatMoney(fee.helperEarningsCents) })}</span>
            <span>{held && fee.posterFeeCents > 0 ? t('splitHold', { amount: formatMoney(fee.posterFeeCents) }) : t('splitNone')}</span>
          </div>
        </div>
        <p className="mt-5 flex items-start gap-2 text-sm text-muted-foreground"><WalletCards aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(`note.${mode}`)}</p>
      </div>
    </LazyMotion>
  );
}
