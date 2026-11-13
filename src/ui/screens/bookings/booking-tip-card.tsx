'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { HandCoins } from 'lucide-react';
import {
  needsBankVerification, tipInputSchema,
  type ActionResult, type BookingTipHandlers, type BookingTipView, type BookingView, type FieldErrorCode,
  type PaymentAttemptResult, type PaymentChoice, type PaymentVerification,
} from '@/contracts';
import { formatMoney, parseMoneyInput } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { sectionTitle, surface, surfacePad } from '@/ui/components/bookings/surface';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { BankVerificationDialog, getDefaultPaymentChoice, PaymentMethodPicker } from '@/ui/components/payments';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Spinner } from '@/ui/primitives/spinner';

type Available = Extract<BookingTipView, { state: 'available' }>;
type Given = Extract<BookingTipView, { state: 'tipped' }>;

/** Preview seeds: the chosen amount (`p15` for the 15% preset, or `custom`) and a result to start from. */
export interface TipCardPreviewState {
  choice?: string;
  result?: PaymentAttemptResult;
}

/** An amount to choose: a soft card that lifts on hover; chosen, it takes the brand's ring (as the card picker). */
const amountCard = 'flex min-h-16 min-w-0 cursor-pointer items-center gap-3 rounded-2xl border border-foreground/[0.09] bg-card px-3.5 py-3 transition-[border-color,box-shadow,background-color] duration-200 ease-[var(--ease-out)] hover:border-foreground/20 hover:shadow-[0_8px_22px_-16px_rgb(60_30_10/0.45)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring motion-reduce:transition-none dark:border-white/[0.08]';
const amountChosen = 'border-primary/60 bg-primary/[0.045] shadow-[0_0_0_1px_var(--primary)] hover:border-primary/60 hover:shadow-[0_0_0_1px_var(--primary)]';

/**
 * The tip on the booking page (UI-057): the client's card for adding one after approving the work, then what they
 * gave; the helper sees what they received. The presets, the window and the cards come from the server.
 */
export function BookingTipCard({ data, handlers, preview }: {
  data: Pick<BookingView, 'tip' | 'viewerRole' | 'helper' | 'poster'>;
  handlers?: BookingTipHandlers;
  preview?: TipCardPreviewState;
}) {
  const tip = data.tip;
  if (!tip) return null;
  if (tip.state === 'tipped') {
    return <TipGiven tip={tip} client={data.viewerRole === 'poster'} otherName={data.viewerRole === 'poster' ? data.helper.displayName : data.poster.displayName} />;
  }
  if (data.viewerRole !== 'poster' || !handlers) return null;
  return <TipForm tip={tip} helperName={data.helper.displayName} handlers={handlers} preview={preview} />;
}

function TipGiven({ tip, client, otherName }: { tip: Given; client: boolean; otherName: string }) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('bookingHub.tipCard');
  const id = useId();
  return <section aria-labelledby={`${id}-title`} className={cn(surface, surfacePad, 'flex items-start gap-4')}>
    <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-success/12 text-success"><HandCoins className="size-5" /></span>
    <div className="min-w-0 space-y-1.5">
      <h2 id={`${id}-title`} className={sectionTitle}>{client ? t('tippedTitle') : t('receivedTitle', { name: otherName })}</h2>
      <p className="text-lg font-semibold tabular-nums">{t(client ? 'tipped' : 'received', { amount: formatMoney(tip.amountCents) })}</p>
      <p className="text-sm text-muted-foreground">{client ? t('tippedBody', { name: otherName }) : t('receivedBody')}</p>
      <time dateTime={tip.at} className="block text-sm tabular-nums text-muted-foreground">{formatDateTime(tip.at)}</time>
    </div>
  </section>;
}

function TipForm({ tip, helperName, handlers, preview }: { tip: Available; helperName: string; handlers: BookingTipHandlers; preview?: TipCardPreviewState }) {
  const { formatDate } = useFormat();
  const t = useTranslations('bookingHub.tipCard');
  const hub = useTranslations('bookingHub');
  const fields = useTranslations('forms.fieldErrors');
  const id = useId();
  const router = useRouter();
  const initial = preview?.result;
  const [choice, setChoice] = useState<string | undefined>(preview?.choice);
  const [custom, setCustom] = useState('');
  const [customChecked, setCustomChecked] = useState(false);
  const [payment, setPayment] = useState<PaymentChoice>(() => getDefaultPaymentChoice(tip.payment));
  const [result, setResult] = useState<ActionResult | undefined>(() => (initial && !needsBankVerification(initial) ? initial : undefined));
  const [verification, setVerification] = useState<PaymentVerification | undefined>(() => (initial && needsBankVerification(initial) ? initial.verification : undefined));
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const focusCustom = useRef(false);
  const customInput = useRef<HTMLInputElement>(null);
  const paymentControl = useRef<HTMLElement | null>(null);

  const range = { min: formatMoney(tip.minCents), max: formatMoney(tip.maxCents) };
  const preset = tip.presets.find((item) => `p${item.percent}` === choice);
  const customCents = choice === 'custom' ? parseMoneyInput(custom) : null;
  const customValid = customCents !== null && customCents >= tip.minCents && customCents <= tip.maxCents;
  const amountCents = preset ? preset.amountCents : customValid ? customCents : undefined;
  const serverAmountError = result && !result.ok ? result.fieldErrors?.amountCents?.[0] : undefined;
  const customError = choice === 'custom' && ((customChecked && !customValid) || Boolean(serverAmountError));
  const paymentError = result && !result.ok ? Object.entries(result.fieldErrors ?? {}).find(([field, codes]) => field.startsWith('payment') && codes?.length)?.[1]?.[0] : undefined;
  const done = Boolean(result?.ok);
  const disabled = pending || done;

  useEffect(() => {
    if (!focusCustom.current) return;
    focusCustom.current = false;
    customInput.current?.focus();
  }, [choice]);
  useEffect(() => { if (paymentError) paymentControl.current?.focus(); }, [paymentError]);

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
    if (disabled) return;
    if (choice === 'custom' && !customValid) { setCustomChecked(true); customInput.current?.focus(); return; }
    if (amountCents === undefined) return;
    const parsed = tipInputSchema.safeParse({ amountCents, payment });
    if (!parsed.success) {
      setResult({ ok: false, code: 'validation_failed', fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), [issue.message as FieldErrorCode]])) });
      return;
    }
    void run(() => handlers.onTip(parsed.data));
  }

  const amountLabel = `${id}-amount`;
  return <section aria-labelledby={`${id}-title`} className={cn(surface, surfacePad, 'space-y-5')}>
    <div className="flex items-start gap-4">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><HandCoins className="size-5" /></span>
      <div className="min-w-0 space-y-1.5">
        <h2 id={`${id}-title`} className={sectionTitle}>{t('title', { name: helperName })}</h2>
        <p className="text-pretty text-muted-foreground">{t('body', { name: helperName })}</p>
        <p className="text-sm text-muted-foreground"><time dateTime={tip.availableUntil}>{t('until', { date: formatDate(tip.availableUntil) })}</time></p>
      </div>
    </div>
    <form noValidate aria-busy={pending} onSubmit={submit} className="space-y-5">
      <fieldset disabled={disabled} className="min-w-0 space-y-5">
        <div className="space-y-3">
          <p id={amountLabel} className="font-medium">{t('amount')}</p>
          <RadioGroup
            aria-labelledby={amountLabel}
            value={choice ?? ''}
            onValueChange={(value) => { focusCustom.current = value === 'custom'; setChoice(value); setResult(undefined); }}
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
          >
            {tip.presets.map((item) => <label key={item.percent} htmlFor={`${id}-p${item.percent}`} className={cn(amountCard, choice === `p${item.percent}` && amountChosen)}>
              <RadioGroupItem id={`${id}-p${item.percent}`} value={`p${item.percent}`} />
              <span className="min-w-0">
                <span className="block text-lg/6 font-semibold tabular-nums">{formatMoney(item.amountCents)}</span>{' '}
                <span className="block text-sm tabular-nums text-muted-foreground">{t('preset', { percent: item.percent })}</span>
              </span>
            </label>)}
            <label htmlFor={`${id}-custom`} className={cn(amountCard, choice === 'custom' && amountChosen)}>
              <RadioGroupItem id={`${id}-custom`} value="custom" />
              <span className="min-w-0 font-medium">{t('custom')}</span>
            </label>
          </RadioGroup>
        </div>
        {choice === 'custom' && <div className="space-y-2">
          <label htmlFor={`${id}-custom-amount`} className="block font-medium">{t('customLabel')}</label>
          <Input
            ref={customInput}
            id={`${id}-custom-amount`}
            inputMode="decimal"
            autoComplete="off"
            value={custom}
            onChange={(event) => { setCustom(event.target.value); setResult(undefined); }}
            onBlur={() => setCustomChecked(true)}
            aria-invalid={customError || undefined}
            aria-describedby={`${id}-custom-hint${customError ? ` ${id}-custom-error` : ''}`}
            className="max-w-48 tabular-nums"
          />
          <p id={`${id}-custom-hint`} className="text-sm text-muted-foreground">{t('customHint', range)}</p>
          {customError && <p id={`${id}-custom-error`} className="text-sm text-destructive">{t('customError', range)}</p>}
        </div>}
        {choice && <div className="space-y-3">
          <p className="font-medium">{t('payment')}</p>
          <PaymentMethodPicker
            panel={tip.payment}
            id={`${id}-payment`}
            disabled={disabled}
            field={{ name: 'payment', value: payment, onChange: (value: PaymentChoice) => { setPayment(value); setResult(undefined); }, onBlur: () => {}, ref: (node: HTMLElement | null) => { paymentControl.current = node; } }}
            error={paymentError ? fields(paymentError) : undefined}
          />
        </div>}
      </fieldset>
      {result && !result.ok && result.code === 'not_allowed'
        ? <div role="status" className="space-y-3 rounded-2xl border border-warning/40 bg-badge-warning/60 p-4"><p>{t('changed')}</p><Button type="button" variant="outline" onClick={() => router.refresh()}>{hub('reload')}</Button></div>
        : <FormFeedback result={result && !result.ok && paymentError ? undefined : result} successMessage={t('thanks', { name: helperName })} />}
      {choice && !done && <Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">
        {pending && <Spinner aria-hidden="true" />}
        {pending ? t('sending') : amountCents !== undefined ? t('send', { amount: formatMoney(amountCents) }) : t('sendAny')}
      </Button>}
    </form>
    {verification && <BankVerificationDialog verification={verification} pending={pending} onDone={(outcome) => { void run(() => handlers.onFinishTipVerification({ paymentId: verification.paymentId, outcome })); }} />}
  </section>;
}
