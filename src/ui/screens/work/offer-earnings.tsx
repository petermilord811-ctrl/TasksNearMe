'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { HelperWorkHandlers, PriceBreakdown as Breakdown, PricingInput } from '@/contracts';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export function OfferEarnings({ pricing, valid, onQuote }: { pricing: PricingInput; valid: boolean; onQuote: HelperWorkHandlers['onQuote'] }) {
  const t = useTranslations('helperTask.form');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; breakdown?: Breakdown; failed?: boolean }>();
  const key = JSON.stringify(pricing);
  useEffect(() => {
    if (!valid) return;
    let active = true;
    const timer = setTimeout(() => {
      void Promise.resolve().then(() => onQuote({ pricing: JSON.parse(key) as PricingInput })).then(
        (breakdown) => { if (active) setResult({ key, attempt, breakdown }); },
        () => { if (active) setResult({ key, attempt, failed: true }); },
      );
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [key, valid, attempt, onQuote]);
  const current = result?.key === key && result.attempt === attempt ? result : undefined;
  return <div aria-live="polite" aria-busy={valid && !current}>
    {!valid ? <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">{t('earningsHint')}</p>
      : current?.breakdown ? <PriceBreakdown breakdown={current.breakdown} variant="helper" title={t('earnings')} />
        : current?.failed ? <div className="space-y-3 rounded-xl border border-destructive p-4"><p>{t('earningsError')}</p><Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('retryEarnings')}</Button></div>
          : <p className="flex items-center gap-3 rounded-xl border bg-card p-5"><Spinner />{t('earningsLoading')}</p>}
  </div>;
}
