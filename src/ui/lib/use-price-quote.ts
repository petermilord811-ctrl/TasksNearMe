'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PriceBreakdown, PricingInput, QueryHandler } from '@/contracts';

interface PriceQuoteOptions {
  pricing: PricingInput;
  valid: boolean;
  onQuote: QueryHandler<{ pricing: PricingInput }, PriceBreakdown>;
}

/** Debounces valid price edits and discards responses for superseded inputs. */
export function usePriceQuote({ pricing, valid, onQuote }: PriceQuoteOptions) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(pricing);
  const request = useMemo(() => ({ key, valid, attempt, onQuote }), [key, valid, attempt, onQuote]);
  const [result, setResult] = useState<{
    request: typeof request;
    breakdown?: PriceBreakdown;
    failed?: boolean;
  }>();

  useEffect(() => {
    if (!request.valid) return;
    let active = true;
    const timer = setTimeout(() => {
      void Promise.resolve().then(() => request.onQuote({ pricing: JSON.parse(request.key) as PricingInput })).then(
        (breakdown) => { if (active) setResult({ request, breakdown }); },
        () => { if (active) setResult({ request, failed: true }); },
      );
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [request]);

  const current = valid && result?.request === request ? result : undefined;
  return {
    breakdown: current?.breakdown,
    pending: valid && !current,
    failed: current?.failed ?? false,
    retry: () => setAttempt((value) => value + 1),
  };
}
