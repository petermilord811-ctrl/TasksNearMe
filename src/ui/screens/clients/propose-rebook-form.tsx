'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { invitePricingSchema, rebookProposalInputSchema, type ActionResult, type RebookProposalInput } from '@/contracts';
import { marketClockTime, marketDayKey, marketLocalToUtc } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { useKeepFocusAboveBar } from '@/ui/lib/keep-focus-above-bar';
import { usePriceQuote } from '@/ui/lib/use-price-quote';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { ProposeRebookFields } from './propose-rebook-fields';
import type { ProposeRebookPreviewState, ProposeRebookScreenProps } from './propose-rebook-screen';

export function ProposeRebookForm({ data, handlers, now, initialResult, initialPending = false, initialBreakdown, initialQuoteFailed, initialValues }: ProposeRebookScreenProps & ProposeRebookPreviewState) {
  const t = useTranslations('clients.form');
  const id = useId();
  const router = useRouter();
  const earliestStart = new Date(Date.parse(now) + data.limits.leadHours * 3_600_000);
  // On the booking's market clock (completion plan 8.1).
  const zone = data.timeZone;
  const earliest = { date: marketDayKey(earliestStart, zone), time: marketClockTime(earliestStart, zone) };
  const schema = useMemo(() => rebookProposalInputSchema.superRefine((input, context) => {
    if (input.date < data.limits.firstDate || input.date > data.limits.lastDate) {
      context.addIssue({ code: 'custom', path: ['date'], message: 'out_of_range' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.startTime)) return;
    const start = marketLocalToUtc(input.date, input.startTime, zone);
    if (marketDayKey(start, zone) !== input.date) context.addIssue({ code: 'custom', path: ['date'], message: 'invalid' });
    if (marketClockTime(start, zone) !== input.startTime) context.addIssue({ code: 'custom', path: ['startTime'], message: 'invalid' });
    if (Date.parse(start) < Date.parse(now) + data.limits.leadHours * 3_600_000) {
      context.addIssue({ code: 'custom', path: ['startTime'], message: 'out_of_range' });
    }
  }), [data.limits, now, zone]);
  const form = useForm<RebookProposalInput>({ resolver: zodResolver(schema), defaultValues: { date: '', startTime: '', pricing: data.booking.lastPricing, message: '', ...(data.canRepeat ? { repeat: 'once' as const } : {}), ...initialValues } });
  const { setError, setFocus } = form;
  const pricing = useWatch({ control: form.control, name: 'pricing' });
  const quote = usePriceQuote({ pricing, valid: invitePricingSchema.safeParse(pricing).success, onQuote: handlers.onQuote, initialBreakdown, initialFailed: initialQuoteFailed });
  const [result, setResult] = useState(initialResult);
  const [pending, setPending] = useState(initialPending);
  const locked = useRef(initialPending || Boolean(initialResult?.ok));
  const submitBar = useRef<HTMLDivElement>(null);
  // A field that focus reaches behind the sticky Send proposal bar, or whose hint or count is, comes clear of it, also
  // when a keyboard that shrinks the page opens (WCAG 2.4.11).
  const fields = useRef<HTMLFieldSetElement>(null);
  useKeepFocusAboveBar(fields, submitBar);
  const feedbackSection = useRef<HTMLDivElement>(null);
  const disabled = pending || Boolean(result?.ok);

  useEffect(() => {
    if (!result || pending) return;
    const names: FieldPath<RebookProposalInput>[] = ['date', 'startTime', 'pricing.type', 'pricing.priceCents', 'pricing.rateCents', 'pricing.estimatedHours', 'pricing.hoursCap', 'message'];
    let first: FieldPath<RebookProposalInput> | undefined;
    for (const name of names) {
      const code = !result.ok ? result.fieldErrors?.[name]?.[0]
        ?? (name === (pricing.type === 'fixed' ? 'pricing.priceCents' : 'pricing.rateCents') ? result.fieldErrors?.pricing?.[0] : undefined) : undefined;
      if (code) { setError(name, { type: 'server', message: code }); first ??= name; }
    }
    const timer = setTimeout(() => { if (first) setFocus(first); else feedbackSection.current?.focus(); }, 0);
    return () => clearTimeout(timer);
  }, [result, pending, pricing.type, setError, setFocus]);

  async function submit(input: RebookProposalInput) {
    if (locked.current || !quote.breakdown) return;
    locked.current = true; setPending(true); setResult(undefined); form.clearErrors();
    let next: ActionResult;
    try { next = await handlers.onPropose({ ...input, message: input.message?.trim() || undefined }); }
    catch { next = { ok: false, code: 'unknown' }; }
    locked.current = next.ok; setPending(false); setResult(next);
    if (next.ok && next.redirectTo) router.push(next.redirectTo);
  }

  return <FormProvider {...form}><form noValidate aria-labelledby={`${id}-title`} aria-busy={pending} onSubmit={(event) => { void form.handleSubmit(submit)(event); }} className="space-y-6">
    <section className="space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
      <h2 id={`${id}-title`} className="font-display text-xl/7 font-semibold tracking-[-0.015em]">{t('details')}</h2>
      <fieldset ref={fields} disabled={disabled} className="min-w-0"><legend className="sr-only">{t('details')}</legend><ProposeRebookFields data={data} disabled={disabled} earliest={earliest} /></fieldset>
    </section>
    <div aria-live="polite" aria-busy={quote.pending}>
      {quote.breakdown ? <PriceBreakdown breakdown={quote.breakdown} variant="helper" title={t('earnings')} />
        : quote.failed ? <div className="space-y-3 rounded-xl border border-destructive bg-card p-4"><p>{t('earningsError')}</p><Button type="button" variant="outline" disabled={disabled} onClick={quote.retry}>{t('retryEarnings')}</Button></div>
          : quote.pending ? <p className="flex items-center gap-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-5 dark:border-white/[0.06]"><Spinner />{t('earningsPending')}</p>
            : <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">{t('earningsHint')}</p>}
    </div>
    <div className="space-y-2 text-sm text-muted-foreground"><p>{t('payment', { client: data.client.displayName })}</p><p>{t('expiry')}</p></div>
    <div ref={feedbackSection} tabIndex={-1} className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><FormFeedback result={result && !result.ok ? { ...result, fieldErrors: undefined } : result} successMessage={result?.ok && result.code === 'sent' ? t('sent') : undefined} /></div>
    <div ref={submitBar} className="sticky bottom-app-navigation z-10 border-t bg-background pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Button type="submit" disabled={disabled || !quote.breakdown} aria-busy={pending} className="w-full transition-colors sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'sending' : 'send')}</Button>
    </div>
  </form></FormProvider>;
}
