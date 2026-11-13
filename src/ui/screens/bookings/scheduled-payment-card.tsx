'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarClock, CircleAlert } from 'lucide-react';
import {
  needsBankVerification, payScheduledInputSchema,
  type ActionResult, type BookingView, type FieldErrorCode, type PaymentAttemptResult, type PaymentChoice,
  type PaymentVerification, type ScheduledPaymentHandlers, type ScheduledPaymentView,
} from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { sectionTitle, surface, surfacePad } from '@/ui/components/bookings/surface';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { BankVerificationDialog, getDefaultPaymentChoice, PaymentMethodLabel, PaymentMethodPicker } from '@/ui/components/payments';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/** Preview seeds: the form opened, and a result to start from. */
export interface ScheduledPaymentPreviewState {
  open?: boolean;
  result?: PaymentAttemptResult;
}

/**
 * A booking paid later (`scheduled`: a regular visit, or a one-time booking far ahead), on its booking page. The
 * client sees when their card is charged, or why the charge didn't go through and until when they can pay, with
 * "Pay now"; the helper sees when the payment is due (the address shows once it's paid). The dates and the amount
 * come from the server.
 */
export function ScheduledPaymentCard({ data, handlers, preview }: {
  data: Pick<BookingView, 'scheduledPayment' | 'viewerRole' | 'poster' | 'series'>;
  handlers?: ScheduledPaymentHandlers;
  preview?: ScheduledPaymentPreviewState;
}) {
  const scheduled = data.scheduledPayment;
  if (!scheduled) return null;
  if (data.viewerRole !== 'poster') return <HelperView scheduled={scheduled} clientName={data.poster.displayName} visit={Boolean(data.series)} />;
  return <ClientView scheduled={scheduled} visit={Boolean(data.series)} handlers={handlers} preview={preview} />;
}

function HelperView({ scheduled, clientName, visit }: { scheduled: ScheduledPaymentView; clientName: string; visit: boolean }) {
  const t = useTranslations('bookingHub.scheduledCard');
  const { formatDateTime } = useFormat();
  const id = useId();
  const waiting = Boolean(scheduled.failure) || !scheduled.chargeAt;
  return <section aria-labelledby={`${id}-title`} className={cn(surface, surfacePad, 'flex items-start gap-4')}>
    <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-info/12 text-info"><CalendarClock className="size-5" /></span>
    <div className="min-w-0 space-y-1.5">
      <h2 id={`${id}-title`} className={sectionTitle}>{t('title')}</h2>
      <p className="text-pretty tabular-nums">{waiting
        ? t('helperWaiting', { name: clientName, date: formatDateTime(scheduled.payBy), kind: visit ? 'visit' : 'booking' })
        : t('helperScheduled', { name: clientName, date: formatDateTime(scheduled.chargeAt!) })}</p>
    </div>
  </section>;
}

function ClientView({ scheduled, visit, handlers, preview }: { scheduled: ScheduledPaymentView; visit: boolean; handlers?: ScheduledPaymentHandlers; preview?: ScheduledPaymentPreviewState }) {
  const t = useTranslations('bookingHub.scheduledCard');
  const hub = useTranslations('bookingHub');
  const fields = useTranslations('forms.fieldErrors');
  const { formatDateTime } = useFormat();
  const id = useId();
  const router = useRouter();
  const initial = preview?.result;
  const failed = Boolean(scheduled.failure) || !scheduled.card;
  const [open, setOpen] = useState(Boolean(preview?.open) || failed);
  const [payment, setPayment] = useState<PaymentChoice | undefined>(() => (scheduled.payment ? getDefaultPaymentChoice(scheduled.payment) : undefined));
  const [result, setResult] = useState<ActionResult | undefined>(() => (initial && !needsBankVerification(initial) ? initial : undefined));
  const [verification, setVerification] = useState<PaymentVerification | undefined>(() => (initial && needsBankVerification(initial) ? initial.verification : undefined));
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const paymentControl = useRef<HTMLElement | null>(null);
  const done = Boolean(result?.ok);
  const disabled = pending || done;
  const paymentError = result && !result.ok ? Object.entries(result.fieldErrors ?? {}).find(([field, codes]) => field.startsWith('payment') && codes?.length)?.[1]?.[0] : undefined;
  const amount = formatMoney(scheduled.amountCents);
  const reason = scheduled.failure ?? (scheduled.card ? undefined : 'no_card');

  async function run(call: () => Promise<PaymentAttemptResult>) {
    if (locked.current) return;
    locked.current = true; setPending(true); setResult(undefined);
    let next: PaymentAttemptResult;
    try { next = await call(); } catch { next = { ok: false, code: 'unknown' }; }
    locked.current = false; setPending(false);
    if (needsBankVerification(next)) { setVerification(next.verification); return; }
    setVerification(undefined);
    setResult(next);
    if (next.ok) router.refresh();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !handlers || !payment) return;
    const parsed = payScheduledInputSchema.safeParse({ payment });
    if (!parsed.success) {
      setResult({ ok: false, code: 'validation_failed', fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), [issue.message as FieldErrorCode]])) });
      paymentControl.current?.focus();
      return;
    }
    void run(() => handlers.onPayNow(parsed.data));
  }

  return <section aria-labelledby={`${id}-title`} className={cn(surface, surfacePad, 'space-y-5', reason && 'border-warning/40 dark:border-warning/40')}>
    <div className="flex items-start gap-4">
      <span aria-hidden="true" className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', reason ? 'bg-warning/15 text-warning' : 'bg-info/12 text-info')}>
        {reason ? <CircleAlert className="size-5" /> : <CalendarClock className="size-5" />}
      </span>
      <div className="min-w-0 space-y-1.5">
        <h2 id={`${id}-title`} className={sectionTitle}>{reason ? t('failedTitle') : t('title')}</h2>
        {reason
          ? <>
            <p className="text-pretty">{t(`failure.${reason}`)}</p>
            <p className="text-pretty tabular-nums font-medium">{t(visit ? 'payByVisit' : 'payByBooking', { date: formatDateTime(scheduled.payBy) })}</p>
            {scheduled.chargeAt && <p className="text-sm tabular-nums text-muted-foreground">{t('retry', { date: formatDateTime(scheduled.chargeAt) })}</p>}
          </>
          : <>
            <p className="text-pretty tabular-nums">{t.rich('scheduled', { card: () => <PaymentMethodLabel method={scheduled.card!} />, date: formatDateTime(scheduled.chargeAt ?? scheduled.payBy), amount })}</p>
            <p className="text-sm text-muted-foreground">{t('nothingYet')}</p>
          </>}
      </div>
    </div>
    {handlers && scheduled.payment && payment && (open
      ? <form noValidate aria-busy={pending} onSubmit={submit} className="space-y-4">
        <fieldset disabled={disabled} className="min-w-0 space-y-3">
          <legend className="font-medium">{t('payWith')}</legend>
          <PaymentMethodPicker
            panel={scheduled.payment}
            id={`${id}-payment`}
            disabled={disabled}
            field={{ name: 'payment', value: payment, onChange: (value: PaymentChoice) => { setPayment(value); setResult(undefined); }, onBlur: () => {}, ref: (node: HTMLElement | null) => { paymentControl.current = node; } }}
            error={paymentError ? fields(paymentError) : undefined}
          />
        </fieldset>
        {result && !result.ok && result.code === 'not_allowed'
          ? <div role="status" className="space-y-3 rounded-2xl border border-warning/40 bg-badge-warning/60 p-4"><p>{t('changed')}</p><Button type="button" variant="outline" onClick={() => router.refresh()}>{hub('reload')}</Button></div>
          : <FormFeedback result={result && !result.ok && paymentError ? undefined : result} successMessage={t('paid')} />}
        {!done && <Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">
          {pending && <Spinner aria-hidden="true" />}
          {pending ? t('paying') : t('pay', { amount })}
        </Button>}
      </form>
      : <Button type="button" variant="outline" onClick={() => setOpen(true)}>{t('payNowInstead', { amount })}</Button>)}
    {verification && handlers && <BankVerificationDialog verification={verification} pending={pending} onDone={(outcome) => { void run(() => handlers.onFinishPayVerification({ paymentId: verification.paymentId, outcome })); }} />}
  </section>;
}
