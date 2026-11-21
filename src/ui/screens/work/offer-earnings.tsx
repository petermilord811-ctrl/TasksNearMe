'use client';

import { useTranslations } from 'next-intl';
import type { HelperWorkHandlers, PricingInput } from '@/contracts';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { usePriceQuote } from '@/ui/lib/use-price-quote';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export function OfferEarnings({ pricing, valid, onQuote }: { pricing: PricingInput; valid: boolean; onQuote: HelperWorkHandlers['onQuote'] }) {
  const t = useTranslations('helperTask.form');
  const quote = usePriceQuote({ pricing, valid, onQuote });
  return <div aria-live="polite" aria-busy={quote.pending}>
    {!valid ? <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">{t('earningsHint')}</p>
      : quote.breakdown ? <PriceBreakdown breakdown={quote.breakdown} variant="helper" title={t('earnings')} headingLevel={3} />
        : quote.failed ? <div className="space-y-3 rounded-xl border border-destructive p-4"><p>{t('earningsError')}</p><Button type="button" variant="outline" onClick={quote.retry}>{t('retryEarnings')}</Button></div>
          : <p className="flex items-center gap-3 rounded-xl border bg-card p-5"><Spinner />{t('earningsLoading')}</p>}
  </div>;
}
