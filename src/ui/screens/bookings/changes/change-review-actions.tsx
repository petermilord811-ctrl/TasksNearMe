'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { acceptChangeInputSchema, needsBankVerification, type ActionResult, type ChangeActionId, type ChangeReviewHandlers, type ChangeReviewPageData, type PaymentAttemptResult, type PaymentChoice, type PaymentVerification } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { actionTray, sectionTitle, surface, surfacePad, warningPanel } from '@/ui/components/bookings/surface';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { cn } from '@/ui/lib/utils';
import { BankVerificationDialog, getDefaultPaymentChoice, PaymentMethodPicker } from '@/ui/components/payments';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export function ChangeReviewActions({ data, handlers, initialResult, initialPending = false }: {
  data: ChangeReviewPageData;
  handlers: ChangeReviewHandlers;
  initialResult?: PaymentAttemptResult;
  initialPending?: boolean;
}) {
  const t = useTranslations('changes.review');
  const fields = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const paymentSection = useRef<HTMLElement>(null);
  const paymentControl = useRef<HTMLElement | null>(null);
  const feedbackSection = useRef<HTMLDivElement>(null);
  const confirmationOpener = useRef<HTMLButtonElement | null>(null);
  const locked = useRef(initialPending);
  const [choice, setChoice] = useState<PaymentChoice | undefined>(() => data.payment ? getDefaultPaymentChoice(data.payment) : undefined);
  const [result, setResult] = useState<ActionResult | undefined>(() => initialResult && !needsBankVerification(initialResult) ? initialResult : undefined);
  const [verification, setVerification] = useState<PaymentVerification | undefined>(() => initialResult && needsBankVerification(initialResult) ? initialResult.verification : undefined);
  const [pending, setPending] = useState(initialPending);
  const [active, setActive] = useState<ChangeActionId | undefined>(() => initialPending ? data.change.actions[0] : undefined);
  const [confirm, setConfirm] = useState<ChangeActionId>();
  const disabled = pending || Boolean(verification) || Boolean(result?.ok);
  const paymentActions = data.change.actions.some((action) => action === 'accept_change' || action === 'pay_change_difference');
  const needsPayment = paymentActions && data.booking.viewerRole === 'poster' && (data.change.differenceCents ?? 0) > 0;
  const paymentMissing = needsPayment && (!data.payment || !choice);
  const paymentErrorCode = result && !result.ok ? Object.entries(result.fieldErrors ?? {}).find(([field, codes]) => field.startsWith('payment') && codes?.length)?.[1]?.[0] : undefined;
  const feedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  const errorMessage = result && !result.ok && t.has(`errors.${result.code}`) ? t(`errors.${result.code}`) : undefined;
  const reload = result && !result.ok && ['not_allowed', 'version_conflict', 'expired'].includes(result.code);

  useEffect(() => {
    if (!result || pending) return;
    const timer = setTimeout(() => {
      if (paymentErrorCode) paymentControl.current?.focus();
      else if (!result.ok && (result.code === 'payment_declined' || result.code === 'insufficient_funds')) paymentSection.current?.focus();
      else feedbackSection.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [result, pending, paymentErrorCode]);

  async function run(action: () => Promise<PaymentAttemptResult>) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    setConfirm(undefined);
    let next: PaymentAttemptResult;
    try { next = await action(); }
    catch { next = { ok: false, code: 'unknown' }; }
    setPending(false);
    locked.current = false;
    if (needsBankVerification(next)) {
      setVerification(next.verification);
      return;
    }
    setVerification(undefined);
    setResult(next);
    if (next.ok) {
      locked.current = true;
      if (next.redirectTo) router.push(next.redirectTo);
    }
  }

  function submit(action: ChangeActionId) {
    if (disabled || locked.current) return;
    setActive(action);
    if (action === 'accept_change' || action === 'pay_change_difference') {
      if (paymentMissing) return;
      const parsed = acceptChangeInputSchema.safeParse(choice && data.payment ? { payment: choice } : {});
      if (!parsed.success) { setConfirm(undefined); setResult({ ok: false, code: 'validation_failed' }); return; }
      void run(() => action === 'accept_change' ? handlers.onAccept(parsed.data) : handlers.onPayDifference(parsed.data));
    } else void run(() => action === 'decline_change' ? handlers.onDecline() : handlers.onWithdraw());
  }

  function label(action: ChangeActionId) {
    return action === 'pay_change_difference' && data.change.differenceCents !== undefined
      ? t('payAmount', { amount: formatMoney(data.change.differenceCents) })
      : t(`actions.${action}`);
  }

  return <>
    {data.payment && choice && paymentActions && <section ref={paymentSection} tabIndex={-1} aria-labelledby={`${id}-payment-heading`} className={cn(surface, surfacePad, 'space-y-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring')}>
      <h2 id={`${id}-payment-heading`} className={sectionTitle}>{t('payment')}</h2>
      <p className="text-sm text-muted-foreground">{t('paymentHint')}</p>
      <PaymentMethodPicker panel={data.payment} id={`${id}-payment`} disabled={disabled} field={{ name: 'payment', value: choice, onChange: (value: PaymentChoice) => { setChoice(value); setResult(undefined); }, onBlur: () => {}, ref: (node: HTMLElement | null) => { paymentControl.current = node; } }} error={paymentErrorCode ? fields(paymentErrorCode) : undefined} />
    </section>}
    {paymentMissing && <p role="status" className={cn(warningPanel, 'px-4 py-3.5 text-sm')}>{t('paymentMissing')}</p>}
    <div ref={feedbackSection} tabIndex={-1} className="space-y-3 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <FormFeedback result={feedback} errorMessage={errorMessage} />
      {reload && <Button type="button" variant="outline" onClick={() => router.refresh()}>{t('reload')}</Button>}
    </div>
    {data.change.actions.length > 0 && <div aria-label={t('actionGroup')} className={cn(actionTray, 'flex flex-col gap-3 sm:flex-row')}>
      {data.change.actions.map((action) => <Button key={action} type="button" variant={action === 'accept_change' || action === 'pay_change_difference' ? 'default' : 'outline'} disabled={disabled || (paymentMissing && (action === 'accept_change' || action === 'pay_change_difference'))} aria-busy={pending && active === action} onClick={(event) => { confirmationOpener.current = event.currentTarget; setConfirm(action); }}>
        {pending && active === action && <Spinner aria-hidden="true" />}{label(action)}
      </Button>)}
    </div>}
    <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(undefined); }}>
      <AlertDialogContent onCloseAutoFocus={(event) => {
        event.preventDefault();
        const opener = confirmationOpener.current;
        if (opener?.isConnected && !opener.disabled) opener.focus();
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm ? label(confirm) : t('confirmation')}</AlertDialogTitle>
          <AlertDialogDescription>{confirm ? t(confirm === 'accept_change' && needsPayment ? 'confirm.acceptPayment' : `confirm.${confirm}`, { amount: data.change.differenceCents !== undefined ? formatMoney(data.change.differenceCents) : '' }) : t('confirm.accept_change')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('backToReview')}</AlertDialogCancel>
          <Button type="button" disabled={disabled} onClick={() => { if (confirm) submit(confirm); }}>{confirm ? label(confirm) : t('confirmation')}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {verification && <BankVerificationDialog verification={verification} pending={pending} onDone={(outcome) => { void run(() => handlers.onFinishVerification({ paymentId: verification.paymentId, outcome })); }} />}
  </>;
}
