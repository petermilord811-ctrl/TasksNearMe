'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ChangeQuoteResult, ProposeChangeHandlers, ProposeChangeInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Skeleton } from '@/ui/primitives/skeleton';
import { Spinner } from '@/ui/primitives/spinner';
import { ChangeMoneyComparison } from './change-money-comparison';

export function ChangeQuote({ input, viewerRole, onQuote }: { input?: ProposeChangeInput; viewerRole: 'poster' | 'helper'; onQuote: ProposeChangeHandlers['onQuote'] }) {
  const t = useTranslations('changes.propose');
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ key: string; attempt: number; result: ChangeQuoteResult }>();
  const key = input ? JSON.stringify(input) : '';
  useEffect(() => {
    if (!key) return;
    let active = true;
    const timer = setTimeout(() => {
      void Promise.resolve().then(() => onQuote(JSON.parse(key) as ProposeChangeInput)).catch((): ChangeQuoteResult => ({ ok: false, code: 'unknown' })).then((result) => {
        if (active) setResponse({ key, attempt, result });
      });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [key, attempt, onQuote]);
  const current = response?.key === key && response.attempt === attempt ? response.result : undefined;
  return <div aria-live="polite" aria-busy={!!key && !current}>
    {!key ? <p className="rounded-2xl bg-muted/70 px-4 py-3.5 text-sm text-pretty text-muted-foreground">{t('quoteHint')}</p>
      : current?.ok ? <div className="animate-in fade-in-0 duration-300"><ChangeMoneyComparison before={current.before} after={current.after} differenceCents={current.differenceCents} viewerRole={viewerRole} /></div>
        : current ? <div className="space-y-3 animate-in fade-in-0 duration-300"><FormFeedback result={current} errorMessage={current.code === 'not_allowed' ? t('notAllowed') : undefined} /><Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</Button></div>
          : <div className="space-y-4"><p className="flex min-h-6 items-center gap-3 text-sm text-muted-foreground"><Spinner />{t('quotePending')}</p>
            {/* Holds the comparison's place, so the form doesn't jump when the totals arrive. */}
            <div aria-hidden="true" className="grid min-w-0 gap-4 sm:grid-cols-2"><Skeleton className="h-56 rounded-[1.375rem]" /><Skeleton className="h-56 rounded-[1.375rem]" /></div></div>}
  </div>;
}
