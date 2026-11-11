'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createOfferInputSchema, type ActionResult, type HelperTaskView, type HelperWorkHandlers, type OfferInput } from '@/contracts';
import { marketLocalToUtc } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { OfferFields } from './offer-fields';
import { OfferEarnings } from './offer-earnings';

export interface OfferFormProps {
  data: HelperTaskView;
  handlers: HelperWorkHandlers;
  revising?: boolean;
  onCancel?: () => void;
  /** Preview-only result state. */
  initialResult?: ActionResult;
}

export function OfferForm({ data, handlers, revising = false, onCancel, initialResult }: OfferFormProps) {
  const t = useTranslations('helperTask.form');
  const id = useId();
  const router = useRouter();
  const schema = useMemo(() => createOfferInputSchema(data.offerRules), [data.offerRules]);
  const own = revising ? data.myOffer : undefined;
  const form = useForm<OfferInput>({ resolver: zodResolver(schema), defaultValues: own ? {
    pricing: own.pricing,
    startTime: data.offerRules.startTimes.find((time) => marketLocalToUtc(data.offerRules.date, time) === own.proposedStart) ?? '',
    message: own.message, brings: own.brings,
  } : data.offerDefaults });
  const { setError, setFocus } = form;
  const pricing = useWatch({ control: form.control, name: 'pricing' });
  const validPricing = schema.safeParse({ pricing, startTime: data.offerRules.startTimes[0] ?? '', message: '', brings: [] }).success;
  const [result, setResult] = useState(initialResult);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const submitBar = useRef<HTMLDivElement>(null);
  useEffect(() => { if (revising) heading.current?.focus(); }, [revising]);

  useEffect(() => {
    if (!result || result.ok || pending) return;
    const names: FieldPath<OfferInput>[] = data.offerRules.pricingType === 'fixed'
      ? ['pricing.priceCents', 'startTime', 'message', 'brings']
      : ['pricing.rateCents', 'pricing.estimatedHours', 'pricing.hoursCap', 'startTime', 'message', 'brings'];
    let first: FieldPath<OfferInput> | undefined;
    for (const name of names) {
      const code = result.fieldErrors?.[name]?.[0] ?? (name === 'brings' ? Object.entries(result.fieldErrors ?? {}).find(([key]) => /^brings\.\d+$/.test(key))?.[1]?.[0] : undefined);
      if (code) { setError(name, { type: 'server', message: code }); first ??= name; }
    }
    if (first) {
      // Let controlled field refs finish registering and pending controls become enabled.
      const target = first;
      const timer = setTimeout(() => setFocus(target), 0);
      return () => clearTimeout(timer);
    }
  }, [result, pending, data.offerRules.pricingType, setError, setFocus]);

  async function submit(input: OfferInput) {
    if (locked.current) return;
    locked.current = true; setPending(true); setResult(undefined);
    let next: ActionResult;
    try { next = await (revising ? handlers.onReviseOffer : handlers.onSubmitOffer)(input); }
    catch { next = { ok: false, code: 'unknown' }; }
    locked.current = false; setPending(false); setResult(next);
    if (next.ok && next.redirectTo) router.push(next.redirectTo);
  }

  // Keep a summary even when a server error names a field this form doesn't know.
  const feedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  return <section aria-labelledby={`${id}-title`} className="space-y-5 rounded-xl border bg-card p-4 shadow-card sm:p-6">
    <h2 ref={heading} tabIndex={-1} id={`${id}-title`} className="rounded-sm font-heading text-xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t(revising ? 'reviseTitle' : 'title')}</h2>
    <p className="text-sm text-muted-foreground">{t('intro')}</p>
    <FormProvider {...form}><form noValidate aria-labelledby={`${id}-title`} aria-busy={pending} onSubmit={(event) => { void form.handleSubmit(submit)(event); }} className="space-y-6">
      <fieldset disabled={pending} className="min-w-0" onFocusCapture={(event) => {
        const bar = submitBar.current;
        // Native Tab scrolling can leave a partly visible field behind the sticky action bar.
        if (bar && event.target.getBoundingClientRect().bottom > bar.getBoundingClientRect().top) {
          event.target.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
      }}><legend className="sr-only">{t('details')}</legend><OfferFields rules={data.offerRules} /></fieldset>
      <OfferEarnings pricing={pricing} valid={validPricing} onQuote={handlers.onQuote} />
      <FormFeedback result={feedback} />
      <div ref={submitBar} className="sticky bottom-app-navigation z-10 flex flex-wrap gap-3 border-t bg-card pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button type="submit" disabled={pending} aria-busy={pending} className="min-w-0 flex-1 sm:flex-none">{pending && <Spinner />}{t(pending ? 'sending' : revising ? 'save' : 'send')}</Button>
        {onCancel && <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>{t('cancel')}</Button>}
      </div>
    </form></FormProvider>
  </section>;
}
