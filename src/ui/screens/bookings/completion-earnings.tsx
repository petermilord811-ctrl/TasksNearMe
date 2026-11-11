'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CompletionHandlers, PriceBreakdown as Breakdown } from '@/contracts';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export function CompletionEarnings({ hoursWorked, expensesCents, valid, onQuote, onBusyChange, disabled, initialError }: {
  hoursWorked?: number; expensesCents: number; valid: boolean;
  onQuote: CompletionHandlers['onQuoteFinal']; onBusyChange: (busy: boolean) => void;
  disabled?: boolean; initialError?: boolean;
}) {
  const t = useTranslations('bookingComplete');
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify({ ...(hoursWorked === undefined ? {} : { hoursWorked }), expensesCents });
  const [result, setResult] = useState<{ key: string; attempt: number; breakdown?: Breakdown; failed?: boolean }>(initialError ? { key, attempt: 0, failed: true } : { key: '', attempt: 0 });
  useEffect(() => {
    if (!valid || (initialError && attempt === 0)) return;
    let active = true;
    const timer = setTimeout(() => {
      onBusyChange(true);
      void Promise.resolve().then(() => onQuote(JSON.parse(key) as Parameters<CompletionHandlers['onQuoteFinal']>[0])).then(
        (breakdown) => { if (active) { setResult({ key, attempt, breakdown }); onBusyChange(false); } },
        () => { if (active) { setResult({ key, attempt, failed: true }); onBusyChange(false); } },
      );
    }, 350);
    return () => { active = false; clearTimeout(timer); onBusyChange(false); };
  }, [key, valid, attempt, onQuote, onBusyChange, initialError]);
  const current = result.key === key && result.attempt === attempt ? result : undefined;
  return <section aria-label={t('earnings')} aria-live="polite" aria-busy={valid && !current}>
    {!valid ? <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">{t('earningsHint')}</p>
      : current?.breakdown ? <PriceBreakdown breakdown={current.breakdown} variant="helper" title={t('earnings')} />
        : current?.failed ? <div className="space-y-3 rounded-xl border border-destructive p-4"><p>{t('earningsError')}</p><Button type="button" variant="outline" disabled={disabled} onClick={() => setAttempt((value) => value + 1)}>{t('retryEarnings')}</Button></div>
          : <p className="flex items-center gap-3 rounded-xl border bg-card p-5"><Spinner />{t('earningsLoading')}</p>}
  </section>;
}
