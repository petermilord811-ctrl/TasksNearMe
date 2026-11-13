'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { acceptProposalInputSchema, needsBankVerification, routes, type AcceptProposalInput, type ActionResult, type PaymentAttemptResult, type PaymentVerification, type ProposalHandlers, type ProposalPageData, type RebookActionId } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { BankVerificationDialog, getDefaultPaymentChoice, PaymentMethodPicker } from '@/ui/components/payments';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Checkbox } from '@/ui/primitives/checkbox';
import { Spinner } from '@/ui/primitives/spinner';

type ConfirmAction = Exclude<RebookActionId, 'accept_proposal'>;

export function ProposalActions({ data, handlers, initialResult, initialPending = false }: {
  data: ProposalPageData;
  handlers: ProposalHandlers;
  initialResult?: PaymentAttemptResult;
  initialPending?: boolean;
}) {
  const t = useTranslations('proposal');
  const actions = useTranslations('actions');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const opener = useRef<HTMLButtonElement | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const paymentRef = useRef<HTMLElement>(null);
  const locked = useRef(initialPending);
  const [pending, setPending] = useState(initialPending);
  const [active, setActive] = useState<RebookActionId | undefined>(initialPending ? 'accept_proposal' : undefined);
  const [result, setResult] = useState<ActionResult | undefined>(initialResult && !needsBankVerification(initialResult) ? initialResult : undefined);
  const [verification, setVerification] = useState<PaymentVerification | undefined>(initialResult && needsBankVerification(initialResult) ? initialResult.verification : undefined);
  const [confirm, setConfirm] = useState<ConfirmAction>();
  const { proposal, payment } = data;
  const canAccept = proposal.actions.includes('accept_proposal');
  const form = useForm<AcceptProposalInput>({
    resolver: zodResolver(acceptProposalInputSchema),
    defaultValues: {
      payment: payment ? getDefaultPaymentChoice(payment) : undefined,
      acceptTerms: initialPending || Boolean(initialResult && (initialResult.ok || initialResult.code !== 'validation_failed')),
    },
    shouldFocusError: false,
  });
  const { setError, setFocus } = form;
  const disabled = pending || Boolean(verification) || Boolean(result?.ok);

  useEffect(() => {
    if (!result || pending) return;
    const fields: FieldPath<AcceptProposalInput>[] = ['payment.methodId', 'payment.card', 'payment.save', 'payment', 'acceptTerms'];
    let first: FieldPath<AcceptProposalInput> | undefined;
    for (const field of fields) {
      const code = !result.ok ? result.fieldErrors?.[field]?.[0] : undefined;
      if (code) { setError(field, { type: 'server', message: code }); first ??= field; }
    }
    const timer = setTimeout(() => {
      if (first === 'acceptTerms') setFocus('acceptTerms');
      else if (first === 'payment.card') paymentRef.current?.querySelector<HTMLElement>('[id$="-card"] [role="radio"][data-state="checked"]')?.focus();
      else if (first === 'payment.save') paymentRef.current?.querySelector<HTMLElement>('[id$="-save"]')?.focus();
      else if (first) setFocus('payment');
      else feedbackRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [result, pending, setError, setFocus]);

  async function run(action: () => Promise<PaymentAttemptResult>) {
    if (locked.current) return;
    locked.current = true;
    setPending(true); setResult(undefined); setConfirm(undefined); form.clearErrors();
    let next: PaymentAttemptResult;
    try { next = await action(); } catch { next = { ok: false, code: 'unknown' }; }
    locked.current = false; setPending(false);
    if (needsBankVerification(next)) { setVerification(next.verification); return; }
    setVerification(undefined); setResult(next);
    if (next.ok) {
      locked.current = true;
      if (next.redirectTo) router.push(next.redirectTo);
      else router.refresh();
    }
  }

  const paymentError = form.getFieldState('payment.methodId', form.formState).error?.message
    ?? form.getFieldState('payment.card', form.formState).error?.message
    ?? form.getFieldState('payment.save', form.formState).error?.message
    ?? form.formState.errors.payment?.message;
  const errorText = (code: string) => fieldCopy(fieldCopy.has(code) ? code : 'invalid');
  const refreshCode = result && !result.ok && (result.code === 'not_allowed' || result.code === 'expired') ? result.code : undefined;
  const feedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  const successMessage = result?.ok && result.code === 'updated' && active && active !== 'accept_proposal' ? t(`success.${active}`) : undefined;

  return <>
    <form noValidate aria-label={t('actionsLabel')} aria-busy={pending} className="space-y-6" onSubmit={(event) => {
      if (disabled || locked.current || !canAccept || !payment) { event.preventDefault(); return; }
      void form.handleSubmit((input) => { setActive('accept_proposal'); return run(() => handlers.onAccept(input)); }, (errors) => {
        if (errors.payment) setFocus('payment'); else if (errors.acceptTerms) setFocus('acceptTerms');
      })(event);
    }}>
      {canAccept && payment && <fieldset disabled={disabled} className="min-w-0 space-y-6">
        <legend className="sr-only">{t('payment')}</legend>
        <section ref={paymentRef} aria-labelledby={`${id}-payment-title`} className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
          <h2 id={`${id}-payment-title`} className="font-display text-xl/7 font-semibold tracking-[-0.015em]">{t('payment')}</h2>
          <Controller control={form.control} name="payment" render={({ field }) => <PaymentMethodPicker panel={payment} id={`${id}-payment`} disabled={disabled} field={{ ...field, onChange: (choice) => { form.clearErrors('payment'); field.onChange(choice); } }} error={paymentError ? errorText(paymentError) : undefined} />} />
          <p className="text-sm tabular-nums">{t('chargeNow', { amount: formatMoney(proposal.breakdown.posterTotalCents) })}</p>
        </section>
        <div className="space-y-2">
          <Controller control={form.control} name="acceptTerms" render={({ field, fieldState }) => <div className="flex items-start gap-3">
            <Checkbox id={`${id}-terms`} ref={field.ref} name={field.name} checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} onBlur={field.onBlur} disabled={disabled} aria-required="true" aria-invalid={fieldState.invalid} aria-describedby={fieldState.error ? `${id}-terms-error` : undefined} className="size-11 scroll-mb-40" />
            <label htmlFor={`${id}-terms`} className="min-h-11 flex-1 text-sm leading-6">{t.rich('terms', {
              terms: (chunks) => <Link href={routes.legal('terms')} className="inline-flex min-h-11 items-center rounded-sm text-primary underline underline-offset-4">{chunks}</Link>,
              cancellation: (chunks) => <Link href={routes.legal('cancellation-policy')} className="inline-flex min-h-11 items-center rounded-sm text-primary underline underline-offset-4">{chunks}</Link>,
            })}</label>
          </div>} />
          <div aria-live="polite">{form.formState.errors.acceptTerms?.message && <p id={`${id}-terms-error`} className="text-sm text-destructive">{errorText(form.formState.errors.acceptTerms.message)}</p>}</div>
        </div>
      </fieldset>}
      <div ref={feedbackRef} tabIndex={-1} className="space-y-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <FormFeedback result={feedback} errorMessage={refreshCode ? t(`errors.${refreshCode}`) : undefined} successMessage={successMessage} />
        {refreshCode && <Button type="button" variant="outline" disabled={disabled} onClick={() => router.refresh()}>{t('reload')}</Button>}
      </div>
      {proposal.actions.length > 0 && <div role="group" aria-label={t('actionsLabel')} className="sticky bottom-app-navigation z-10 flex flex-wrap gap-3 border-t bg-background pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {proposal.actions.map((action) => <Button key={action} type={action === 'accept_proposal' ? 'submit' : 'button'} variant={action === 'accept_proposal' ? 'default' : 'outline'} disabled={disabled} aria-busy={pending && active === action} onClick={action === 'accept_proposal' ? undefined : (event) => { opener.current = event.currentTarget; setConfirm(action); }}>
          {pending && active === action && <Spinner aria-hidden="true" />}{pending && active === action ? t(action === 'accept_proposal' ? 'accepting' : 'updating') : actions(action)}
        </Button>)}
      </div>}
    </form>
    <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(undefined); }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); if (opener.current?.isConnected && !opener.current.disabled) opener.current.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm ? actions(confirm) : t('actionsLabel')}</AlertDialogTitle>
          <AlertDialogDescription>{confirm ? t(`confirm.${confirm}`, { helper: proposal.helper.displayName, client: proposal.client.displayName }) : ''}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('keepProposal')}</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={disabled} onClick={() => {
            if (!confirm || !proposal.actions.includes(confirm)) return;
            setActive(confirm);
            void run(() => confirm === 'decline_proposal' ? handlers.onDecline() : handlers.onWithdraw());
          }}>{confirm ? actions(confirm) : t('actionsLabel')}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {verification && <BankVerificationDialog verification={verification} pending={pending} onDone={(outcome) => { void run(() => handlers.onFinishVerification({ paymentId: verification.paymentId, outcome })); }} />}
  </>;
}
