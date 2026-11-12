'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, FormProvider, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react';
import { invitePricingSchema, needsBankVerification, requestHelperInputSchema, routes, type ActionResult, type PaymentAttemptResult, type PaymentVerification, type RequestHelperInput } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { BankVerificationDialog, getDefaultPaymentChoice, PaymentMethodPicker } from '@/ui/components/payments';
import { Button } from '@/ui/primitives/button';
import { Checkbox } from '@/ui/primitives/checkbox';
import { Spinner } from '@/ui/primitives/spinner';
import { usePriceQuote } from '@/ui/lib/use-price-quote';
import { RequestHelperFields, requestStartWindow, suggestedPricing } from './request-helper-fields';
import type { RequestHelperScreenProps } from './request-helper-screen';

export function RequestHelperForm({ data, handlers, initialResult, initialPending = false }: Omit<RequestHelperScreenProps, 'now'> & {
  initialResult?: PaymentAttemptResult;
  initialPending?: boolean;
}) {
  const t = useTranslations('invites');
  const fields = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const submitBar = useRef<HTMLDivElement>(null);
  const feedbackSection = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<ActionResult | undefined>(() => initialResult && !needsBankVerification(initialResult) ? initialResult : undefined);
  const [verification, setVerification] = useState<PaymentVerification | undefined>(() => initialResult && needsBankVerification(initialResult) ? initialResult.verification : undefined);
  const [pending, setPending] = useState(initialPending);
  const locked = useRef(initialPending || Boolean(initialResult?.ok));
  const schema = useMemo(() => requestHelperInputSchema.superRefine((input, context) => {
    const task = data.tasks.find((candidate) => candidate.id === input.taskId);
    if (!task) context.addIssue({ code: 'custom', path: ['taskId'], message: 'invalid' });
    else {
      const window = requestStartWindow(data, task);
      if (Date.parse(input.start) < Date.parse(window.start) || Date.parse(input.start) > Date.parse(window.end)) {
        context.addIssue({ code: 'custom', path: ['start'], message: 'out_of_range' });
      }
    }
  }), [data]);
  const task = data.tasks.find((candidate) => candidate.id === data.suggestion?.taskId) ?? data.tasks[0];
  const form = useForm<RequestHelperInput>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      taskId: task.id, start: requestStartWindow(data, task).start, pricing: suggestedPricing(data, task), message: '',
      ...(data.slot && !data.slotUnavailable ? { slotId: data.slot.id } : {}),
      payment: getDefaultPaymentChoice(data.payment), acceptTerms: initialPending || Boolean(initialResult && (initialResult.ok || initialResult.code !== 'validation_failed')),
    },
  });
  const { setError, setFocus } = form;
  const pricing = useWatch({ control: form.control, name: 'pricing' });
  const validPricing = invitePricingSchema.safeParse(pricing).success;
  const quote = usePriceQuote({ pricing, valid: validPricing, onQuote: handlers.onQuote });
  const disabled = pending || Boolean(verification) || Boolean(result?.ok);

  useEffect(() => {
    if (!result || pending || verification) return;
    const names: FieldPath<RequestHelperInput>[] = ['taskId', 'start', 'pricing.type', 'pricing.priceCents', 'pricing.rateCents', 'pricing.estimatedHours', 'pricing.hoursCap', 'message', 'payment', 'acceptTerms'];
    let first: FieldPath<RequestHelperInput> | undefined;
    for (const name of names) {
      const code = !result.ok ? result.fieldErrors?.[name]?.[0]
        ?? (name === 'payment' ? Object.entries(result.fieldErrors ?? {}).find(([key]) => key.startsWith('payment.'))?.[1]?.[0] : undefined)
        ?? (name === (pricing.type === 'fixed' ? 'pricing.priceCents' : 'pricing.rateCents') ? result.fieldErrors?.pricing?.[0] : undefined) : undefined;
      if (code) { setError(name, { type: 'server', message: code }); first ??= name; }
    }
    const timer = setTimeout(() => {
      if (first) setFocus(first);
      else feedbackSection.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [result, pending, verification, pricing.type, setError, setFocus]);

  async function run(action: () => Promise<PaymentAttemptResult>) {
    if (locked.current) return;
    locked.current = true; setPending(true); setResult(undefined); form.clearErrors();
    let next: PaymentAttemptResult;
    try { next = await action(); }
    catch { next = { ok: false, code: 'unknown' }; }
    locked.current = false; setPending(false);
    if (needsBankVerification(next)) { setVerification(next.verification); return; }
    setVerification(undefined); setResult(next);
    if (next.ok) locked.current = true;
    if (next.ok && next.redirectTo) router.push(next.redirectTo);
  }

  const feedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  const slotRequestUnavailable = !!data.slot && !data.slotUnavailable && result && !result.ok && result.code === 'not_allowed';
  const fieldError = (code: string) => fields(fields.has(code) ? code : 'invalid');
  return <>
    <FormProvider {...form}><form noValidate aria-label={t('title', { helper: data.helper.displayName })} aria-busy={pending} className="space-y-6" onFocusCapture={(event) => {
      const bar = submitBar.current;
      if (bar && !bar.contains(event.target) && event.target.getBoundingClientRect().bottom > bar.getBoundingClientRect().top) event.target.scrollIntoView({ block: 'center', behavior: 'instant' });
    }} onSubmit={(event) => {
      if (disabled || locked.current || !quote.breakdown) { event.preventDefault(); return; }
      void form.handleSubmit((input) => run(() => handlers.onRequest({ ...input, message: input.message?.trim() || undefined })))(event);
    }}>
      <fieldset disabled={disabled} className="min-w-0"><legend className="sr-only">{t('details')}</legend><RequestHelperFields data={data} disabled={disabled} /></fieldset>
      <div aria-live="polite" aria-busy={quote.pending} className="space-y-3">
        {quote.breakdown ? <>
          <PriceBreakdown breakdown={quote.breakdown} variant="poster" title={t('total')} posterTotalLabel={t('total')} />
          <div className="flex items-start gap-3 rounded-xl bg-secondary p-4 text-secondary-foreground">
            <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><div className="space-y-2">
              <p>{t('hold', { amount: formatMoney(quote.breakdown.posterTotalCents), helper: data.helper.displayName })}</p>
              <p className="text-sm">{t('release', { helper: data.helper.displayName })}</p>
            </div>
          </div>
        </> : quote.failed ? <div className="space-y-3 rounded-xl border border-destructive bg-card p-4">
          <p>{t('quoteError')}</p><Button type="button" variant="outline" disabled={disabled} onClick={quote.retry}>{t('retryQuote')}</Button>
        </div> : <p className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm">{quote.pending && <Spinner />}{t(quote.pending ? 'quotePending' : 'quoteHint')}</p>}
      </div>
      <fieldset disabled={disabled} className="min-w-0 space-y-6">
        <legend className="sr-only">{t('payment')}</legend>
        <section aria-labelledby={`${id}-payment-title`} className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-6">
          <h2 id={`${id}-payment-title`} className="font-heading text-xl/7 font-semibold">{t('payment')}</h2>
          <Controller control={form.control} name="payment" render={({ field, fieldState }) => <PaymentMethodPicker id={`${id}-payment`} panel={data.payment} disabled={disabled} field={{ ...field, onChange: (choice) => { form.clearErrors('payment'); field.onChange(choice); } }} error={fieldState.error?.message ? fieldError(fieldState.error.message) : undefined} />} />
        </section>
        <Controller control={form.control} name="acceptTerms" render={({ field, fieldState }) => <div className="space-y-2">
          <div className="flex items-start gap-3">
            <Checkbox ref={field.ref} name={field.name} id={`${id}-terms`} checked={field.value} disabled={disabled} onBlur={field.onBlur} onCheckedChange={(checked) => field.onChange(checked === true)} aria-required="true" aria-invalid={fieldState.invalid} aria-describedby={fieldState.error ? `${id}-terms-error` : undefined} className="size-11 shrink-0 scroll-mb-40" />
            <label htmlFor={`${id}-terms`} className="min-h-11 text-sm leading-6">{t.rich('terms', {
              terms: (chunks) => <Link href={routes.legal('terms')} className="inline-flex min-h-11 items-center rounded-sm text-primary underline underline-offset-4">{chunks}</Link>,
              cancellation: (chunks) => <Link href={routes.legal('cancellation-policy')} className="inline-flex min-h-11 items-center rounded-sm text-primary underline underline-offset-4">{chunks}</Link>,
            })}</label>
          </div>
          <div id={`${id}-terms-error`} aria-live="polite">{fieldState.error?.message && <p className="text-sm text-destructive">{fieldError(fieldState.error.message)}</p>}</div>
        </div>} />
      </fieldset>
      <div ref={feedbackSection} tabIndex={-1} className="space-y-2 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <FormFeedback result={feedback} successMessage={result?.ok && result.code === 'sent' ? t('sent') : undefined} errorMessage={slotRequestUnavailable ? t('slotRequestUnavailable') : undefined} />
        {slotRequestUnavailable && <Link href={routes.app.requestHelper(data.helper.handle)} className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline underline-offset-4">{t('regularRequest')}</Link>}
      </div>
      <div ref={submitBar} className="sticky bottom-app-navigation z-10 border-t bg-background pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button type="submit" disabled={disabled || !quote.breakdown} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner />}{t(pending ? 'sending' : 'send')}</Button>
      </div>
    </form></FormProvider>
    {verification && <BankVerificationDialog verification={verification} pending={pending} onDone={(outcome) => { void run(() => handlers.onFinishVerification({ paymentId: verification.paymentId, outcome })); }} />}
  </>;
}
