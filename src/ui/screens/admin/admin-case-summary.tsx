'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CircleAlert, Sparkles } from 'lucide-react';
import type { AdminCaseSummary, AiAssistResult, QueryHandler } from '@/contracts';
import { AiDraftButton } from '@/ui/components/forms/ai-draft';

export type AdminCaseSummaryState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'done'; summary: AdminCaseSummary }
  | { kind: 'failed'; code: 'unavailable' | 'rate_limited' | 'prohibited' | 'not_found' };

function failureOf(result: Extract<AiAssistResult<AdminCaseSummary>, { ok: false }>): Extract<AdminCaseSummaryState, { kind: 'failed' }>['code'] {
  if (result.code === 'rate_limited' || result.code === 'not_found') return result.code;
  if (result.code === 'validation_failed') return 'prohibited';
  return 'unavailable';
}

/**
 * "Summarize with AI" on a support case (2026-11-24): what happened and what's still open, from what this page shows
 * the staff member. Saved nowhere; a fresh one on each press.
 */
export function AdminCaseSummaryCard({ onSummarize, initialState = { kind: 'idle' } }: {
  onSummarize: QueryHandler<Record<string, never>, AiAssistResult<AdminCaseSummary>>;
  initialState?: AdminCaseSummaryState;
}) {
  const t = useTranslations('adminCase.summary');
  const id = useId();
  const [state, setState] = useState<AdminCaseSummaryState>(initialState);

  async function run() {
    if (state.kind === 'pending') return;
    setState({ kind: 'pending' });
    let result: AiAssistResult<AdminCaseSummary>;
    try {
      result = await onSummarize({});
    } catch {
      result = { ok: false, code: 'unavailable' };
    }
    setState(result.ok ? { kind: 'done', summary: result.value } : { kind: 'failed', code: failureOf(result) });
  }

  const summary = state.kind === 'done' ? state.summary : undefined;
  return <section aria-labelledby={`${id}-title`} data-case-summary className="space-y-3 rounded-xl border border-primary/20 bg-card p-4 shadow-card sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-xl font-semibold"><Sparkles aria-hidden="true" className="size-5 text-primary" />{t('title')}</h2>
      <AiDraftButton pending={state.kind === 'pending'} onClick={() => void run()} pendingLabel={t('working')} size="sm" className="rounded-full">{t(summary ? 'again' : 'button')}</AiDraftButton>
    </div>
    <div aria-live="polite" className="space-y-3">
      {summary && <>
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold">{t('happened')}</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6">{summary.points.map((point) => <li key={point}>{point}</li>)}</ul>
        </div>
        {summary.open.length > 0 && <div className="space-y-1.5">
          <h3 className="text-sm font-semibold">{t('open')}</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6">{summary.open.map((point) => <li key={point}>{point}</li>)}</ul>
        </div>}
        <p className="text-xs text-muted-foreground">{t('caption')}</p>
      </>}
      {state.kind === 'failed' && <p className="flex items-start gap-2 text-sm text-destructive"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(`errors.${state.code}`)}</p>}
    </div>
  </section>;
}
