'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert } from 'lucide-react';
import {
  confirmBookingInputSchema, needsBankVerification, routes,
  type ActionResult, type ConfirmBookingInput, type PaymentAttemptResult, type PaymentVerification,
} from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { actionTray, sectionTitle, surface, surfacePad, warningPanel } from '@/ui/components/bookings/surface';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { BankVerificationDialog, getDefaultPaymentChoice, PaymentMethodLabel, PaymentMethodPicker } from '@/ui/components/payments';
import { cn } from '@/ui/lib/utils';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { Button } from '@/ui/primitives/button';
import { Checkbox } from '@/ui/primitives/checkbox';
import { Spinner } from '@/ui/primitives/spinner';
import { useKeepFocusAboveBar } from '@/ui/lib/keep-focus-above-bar';
import type { BookingConfirmScreenProps } from './booking-confirm-screen';

export function BookingConfirmForm({ data, handlers, now, initialResult, initialPending = false, children }: BookingConfirmScreenProps & {
  initialResult?: PaymentAttemptResult;
  initialPending?: boolean;
  children: ReactNode;
}) {
  const { formatRelative, formatTime } = useFormat();
  const t = useTranslations('bookingConfirm');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const paymentId = `${id}-payment`;
  const paymentSection = useRef<HTMLElement>(null);
  const feedbackSection = useRef<HTMLDivElement>(null);
  const submitBar = useRef<HTMLDivElement>(null);
  // A field that focus reaches behind the sticky bar, or whose hint or count is, comes clear of it, also when a
  // keyboard that shrinks the page opens (WCAG 2.4.11).
  const formRef = useRef<HTMLFormElement>(null);
  useKeepFocusAboveBar(formRef, submitBar);
  const [result, setResult] = useState<ActionResult | undefined>(() => initialResult && !needsBankVerification(initialResult) ? initialResult : undefined);
  const [verification, setVerification] = useState<PaymentVerification | undefined>(() => initialResult && needsBankVerification(initialResult) ? initialResult.verification : undefined);
  const [pending, setPending] = useState(initialPending);
  const locked = useRef(initialPending);
  const form = useForm<ConfirmBookingInput>({
    resolver: zodResolver(confirmBookingInputSchema),
    defaultValues: {
      offerRevision: data.offer.revision,
      payment: getDefaultPaymentChoice(data.payment),
      acceptTerms: initialPending || Boolean(initialResult && (initialResult.ok || initialResult.code !== 'validation_failed')),
    },
    shouldFocusError: false,
  });
  const { setError, setFocus } = form;
  const disabled = pending || Boolean(verification) || Boolean(result?.ok);
  const paymentFailure = result && !result.ok && (result.code === 'payment_declined' || result.code === 'insufficient_funds');
  const reloadCode = result && !result.ok && (result.code === 'version_conflict' || result.code === 'not_allowed' || result.code === 'expired') ? result.code : undefined;

  // Dotted payment errors come from the app; the picker registers the whole choice.
  useEffect(() => {
    if (!result || pending) return;
    const fields: FieldPath<ConfirmBookingInput>[] = ['payment.methodId', 'payment.card', 'payment', 'acceptTerms'];
    let first: FieldPath<ConfirmBookingInput> | undefined;
    for (const field of fields) {
      const code = !result.ok ? result.fieldErrors?.[field]?.[0] : undefined;
      if (code) { setError(field, { type: 'server', message: code }); first ??= field; }
    }
    const timer = setTimeout(() => {
      if (first === 'acceptTerms') setFocus('acceptTerms');
      else if (first === 'payment.card') {
        const group = paymentSection.current?.querySelector<HTMLElement>(`[id="${paymentId}-card"]`);
        const target = group?.querySelector<HTMLElement>('[role="radio"][data-state="checked"]') ?? group?.querySelector<HTMLElement>('[role="radio"]');
        if (target) target.focus(); else setFocus('payment');
      } else if (first) setFocus('payment');
      else if (result.code === 'payment_declined' || result.code === 'insufficient_funds') paymentSection.current?.focus();
      else feedbackSection.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [result, pending, paymentId, setError, setFocus]);

  async function run(action: () => Promise<PaymentAttemptResult>) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    form.clearErrors();
    let next: PaymentAttemptResult;
    try { next = await action(); }
    catch { next = { ok: false, code: 'unknown' }; }
    locked.current = false;
    setPending(false);
    if (needsBankVerification(next)) {
      setVerification(next.verification);
      return;
    }
    setVerification(undefined);
    setResult(next);
    if (next.ok) locked.current = true;
    if (next.ok && next.redirectTo) router.push(next.redirectTo);
  }

  const paymentError = form.getFieldState('payment.methodId', form.formState).error?.message
    ?? form.getFieldState('payment.card', form.formState).error?.message
    ?? form.formState.errors.payment?.message;
  const errorText = (code: string) => fieldCopy(fieldCopy.has(code) ? code : 'invalid');
  const feedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  const lastFailure = data.pending?.lastFailure;

  return <>
    <form ref={formRef} noValidate aria-label={t('title')} aria-busy={pending} className="space-y-6" onSubmit={(event) => {
      if (disabled || locked.current) { event.preventDefault(); return; }
      void form.handleSubmit(
        (input) => run(() => handlers.onConfirm(input)),
        (errors) => { if (errors.payment) setFocus('payment'); else if (errors.acceptTerms) setFocus('acceptTerms'); },
      )(event);
    }}>
      {children}
      {data.pending && <aside aria-label={t('pending.title')} className={cn(warningPanel, surfacePad, 'space-y-2')}>
        <h2 className={cn(sectionTitle, 'flex items-start gap-2')}><CircleAlert aria-hidden="true" className="mt-1 size-5 shrink-0" />{t(lastFailure ? 'pending.failed' : 'pending.title')}</h2>
        {lastFailure && <p>{t.rich(`pending.${lastFailure.code}`, { method: () => <PaymentMethodLabel method={lastFailure.method} />, time: formatTime(lastFailure.at) })}</p>}
        <p className="tabular-nums">{t(lastFailure ? 'pending.retry' : 'pending.hold', { time: formatTime(data.pending.expiresAt), relative: formatRelative(data.pending.expiresAt, now) })}</p>
      </aside>}
      <fieldset disabled={disabled} className="min-w-0 space-y-6">
        <legend className="sr-only">{t('payment')}</legend>
        <section ref={paymentSection} tabIndex={-1} aria-labelledby={`${id}-payment-title`} className={cn(surface, surfacePad, 'space-y-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring')}>
          <h2 id={`${id}-payment-title`} className={sectionTitle}>{t('payment')}</h2>
          <Controller control={form.control} name="payment" render={({ field }) => <PaymentMethodPicker panel={data.payment} onRemoveCard={handlers.onRemoveCard} id={paymentId} disabled={disabled} keepCard={Boolean(data.paysLater)} field={{ ...field, onChange: (choice) => { form.clearErrors('payment'); field.onChange(choice); } }} error={paymentError ? errorText(paymentError) : undefined} />} />
          {paymentFailure && <FormFeedback result={feedback} />}
        </section>
        <div className="space-y-2">
          {/* The whole row is the checkbox's label (and its tap target); the links inside still open on their own. */}
          <Controller control={form.control} name="acceptTerms" render={({ field, fieldState }) => <label htmlFor={`${id}-terms`} className={cn(
            'flex min-h-14 items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm leading-6 transition-[border-color,background-color,box-shadow] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
            field.value ? 'border-primary/60 bg-primary/[0.045] shadow-[0_0_0_1px_var(--primary)]' : 'border-foreground/[0.09] bg-card',
            !field.value && !disabled && 'hover:border-foreground/20',
            fieldState.invalid && 'border-destructive/60',
          )}>
            <Checkbox id={`${id}-terms`} ref={field.ref} name={field.name} checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} onBlur={field.onBlur} disabled={disabled} aria-required="true" aria-invalid={fieldState.invalid} aria-describedby={fieldState.error ? `${id}-terms-error` : undefined} className="mt-0.5 size-5" />
            <span className="min-w-0 flex-1 text-pretty">{t.rich('terms', {
              terms: (chunks) => <Link href={routes.legal('terms')} className="rounded-sm font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-200 hover:decoration-primary">{chunks}</Link>,
              cancellation: (chunks) => <Link href={routes.legal('cancellation-policy')} className="rounded-sm font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-200 hover:decoration-primary">{chunks}</Link>,
            })}</span>
          </label>} />
          <div aria-live="polite">{form.formState.errors.acceptTerms?.message && <p id={`${id}-terms-error`} className="text-sm text-destructive">{errorText(form.formState.errors.acceptTerms.message)}</p>}</div>
        </div>
      </fieldset>
      <div ref={feedbackSection} tabIndex={-1} className="rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {reloadCode ? <div aria-live="polite" aria-atomic="true">
        <Alert role="status" className="border-destructive/30"><CircleAlert aria-hidden="true" className="text-destructive" /><AlertDescription className="space-y-3 text-foreground">
          <p>{t(`errors.${reloadCode}`, { helper: data.offer.helper.displayName })}</p>
          <Button type="button" variant="outline" disabled={disabled} onClick={() => router.refresh()}>{t('reload')}</Button>
        </AlertDescription></Alert>
      </div> : !paymentFailure && <FormFeedback result={feedback} errorMessage={feedback && !feedback.ok && feedback.code === 'not_ready' ? t('errors.not_ready') : undefined} />}
      </div>
      <div ref={submitBar} className={actionTray}>
        <Button type="submit" disabled={disabled} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner />}{t(pending ? 'booking' : data.paysLater ? 'submitLater' : 'submit', { amount: formatMoney(data.breakdown.posterTotalCents) })}</Button>
      </div>
    </form>
    {verification && <BankVerificationDialog verification={verification} pending={pending} onDone={(outcome) => { void run(() => handlers.onFinishVerification({ paymentId: verification.paymentId, outcome })); }} />}
  </>;
}
