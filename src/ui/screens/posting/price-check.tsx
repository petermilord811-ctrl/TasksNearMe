'use client';

import { useId, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { CircleAlert, CircleCheck, Scale, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { aiAssistOutcome, type AiAssistOutcome, type AiAssistResult, type PriceCheck, type PriceCheckInput, type QueryHandler, type TaskDraftInput } from '@/contracts';
import { formatMoney, formatMoneyShort } from '@/shared/format';
import { AiDraftButton } from '@/ui/components/forms/ai-draft';
import { cn } from '@/ui/lib/utils';

export type PriceCheckState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'needs_words' }
  | { kind: 'checked'; check: PriceCheck }
  | { kind: 'failed'; outcome: Exclude<AiAssistOutcome, 'drafted'> };

const verdictTone = {
  within: { icon: CircleCheck, className: 'border-success/30 bg-badge-success text-badge-success-foreground' },
  below: { icon: TrendingDown, className: 'border-warning/35 bg-badge-warning text-badge-warning-foreground' },
  above: { icon: TrendingUp, className: 'border-info/30 bg-badge-info text-badge-info-foreground' },
} as const;

/**
 * "Is this price fair?" on the posting form's budget step (2026-11-24), as it stands: before a check, while AI sizes the
 * job, the range from the market's guide with where the typed price sits and why, or why it didn't work. Presentational:
 * `PriceCheckCard` runs the check.
 */
export function PriceCheckView({ market, state, onCheck }: { market: string; state: PriceCheckState; onCheck?: () => void }) {
  const t = useTranslations('postTask.priceCheck');
  const id = useId();
  const check = state.kind === 'checked' ? state.check : undefined;
  const verdict = check?.verdict ? verdictTone[check.verdict] : undefined;
  return <section aria-labelledby={`${id}-title`} data-price-check className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-primary"><Scale className="size-5" /></span>
      <div className="min-w-0 space-y-1">
        <h3 id={`${id}-title`} className="font-heading text-[1.0625rem]/6 font-semibold">{t('title')}</h3>
        <p className="text-sm text-muted-foreground">{t('intro', { market })}</p>
      </div>
    </div>

    <div aria-live="polite" className="space-y-3">
      {check && <>
        <div className="space-y-1">
          <p className="font-heading text-xl/7 font-semibold tabular-nums">{t('range', { low: formatMoneyShort(check.lowCents), high: formatMoneyShort(check.highCents) })}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{check.unit === 'item'
            ? t('sizeItem', { count: check.units })
            : check.unit === 'hour'
              ? t('sizeHour', { hours: check.units })
              : t('sizeTask')}</p>
        </div>
        {check.verdict && check.budgetCents !== undefined && verdict
          ? <p className={cn('flex items-start gap-2 rounded-xl border px-3 py-2 text-sm', verdict.className)}><verdict.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span className="tabular-nums">{t(`verdict.${check.verdict}`, { amount: formatMoney(check.budgetCents) })}</span></p>
          : <p className="text-sm text-muted-foreground">{t('noBudget')}</p>}
        {check.reasons.length > 0 && <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('why')}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{check.reasons.map((reason) => <li key={reason} className="break-words">{reason}</li>)}</ul>
        </div>}
        {check.recent && <p className="text-sm text-muted-foreground tabular-nums">{t('recent', { market, low: formatMoneyShort(check.recent.lowCents), high: formatMoneyShort(check.recent.highCents), count: check.recent.count })}</p>}
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><Sparkles aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" /><span>{t('checkedWithAi')}</span></p>
      </>}
      {state.kind === 'needs_words' && <p className="flex items-start gap-2 text-sm text-destructive"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('needsWords')}</p>}
      {state.kind === 'failed' && <p className="flex items-start gap-2 text-sm text-destructive"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(`errors.${state.outcome}`)}</p>}
    </div>

    {onCheck && <AiDraftButton pending={state.kind === 'pending'} onClick={onCheck} pendingLabel={t('checking')} className="rounded-full">{t(check ? 'again' : 'check')}</AiDraftButton>}
  </section>;
}

/** What the form holds now, as the check takes it: no blanks, no half-typed amounts. */
function checkInput(values: TaskDraftInput): PriceCheckInput {
  const usable = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const details = Object.fromEntries(Object.entries(values.details ?? {}).filter((entry): entry is [string, string | number | boolean] => {
    const value = entry[1];
    return typeof value === 'boolean' || typeof value === 'string' ? value !== '' : typeof value === 'number' && Number.isFinite(value);
  }));
  const budget: PriceCheckInput['budget'] = values.budget.type === 'fixed'
    ? { type: 'fixed', ...(usable(values.budget.priceCents) ? { priceCents: values.budget.priceCents } : {}) }
    : { type: 'hourly', ...(usable(values.budget.rateCents) ? { rateCents: values.budget.rateCents } : {}), ...(usable(values.budget.estimatedHours) ? { estimatedHours: values.budget.estimatedHours } : {}) };
  return { categorySlug: values.categorySlug, title: (values.title ?? '').trim(), description: (values.description ?? '').trim(), details, budget };
}

/** The budget step's price check: reads the form, asks once per press, and changes nothing in it. */
export function PriceCheckCard({ market, onCheck, initialState = { kind: 'idle' } }: {
  market: string;
  onCheck: QueryHandler<PriceCheckInput, AiAssistResult<PriceCheck>>;
  initialState?: PriceCheckState;
}) {
  const { getValues } = useFormContext<TaskDraftInput>();
  const [state, setState] = useState<PriceCheckState>(initialState);

  async function run() {
    if (state.kind === 'pending') return;
    const input = checkInput(getValues());
    if (input.description.length < 10) {
      setState({ kind: 'needs_words' });
      return;
    }
    setState({ kind: 'pending' });
    let result: AiAssistResult<PriceCheck>;
    try {
      result = await onCheck(input);
    } catch {
      result = { ok: false, code: 'unavailable' };
    }
    if (result.ok) setState({ kind: 'checked', check: result.value });
    else {
      const outcome = aiAssistOutcome(result);
      setState({ kind: 'failed', outcome: outcome === 'drafted' ? 'unavailable' : outcome });
    }
  }

  return <PriceCheckView market={market} state={state} onCheck={() => void run()} />;
}

