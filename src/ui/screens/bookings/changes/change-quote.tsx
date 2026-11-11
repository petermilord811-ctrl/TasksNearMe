'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ChangeQuoteResult, ProposeChangeHandlers, ProposeChangeInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
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
    {!key ? <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t('quoteHint')}</p>
      : current?.ok ? <ChangeMoneyComparison before={current.before} after={current.after} differenceCents={current.differenceCents} viewerRole={viewerRole} />
        : current ? <div className="space-y-3"><FormFeedback result={current} errorMessage={current.code === 'not_allowed' ? t('notAllowed') : undefined} /><Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</Button></div>
          : <p className="flex items-center gap-3 rounded-xl border bg-card p-5"><Spinner />{t('quotePending')}</p>}
  </div>;
}
