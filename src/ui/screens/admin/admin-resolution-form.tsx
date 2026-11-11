'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { caseResolutionInputSchema, type ActionResult, type AdminCaseHandlers, type AdminCasePageData, type CaseResolutionInput, type ResolutionPreviewResult } from '@/contracts';
import { formatMoney, formatMoneyInput, parseMoneyInput } from '@/shared/format';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { AlertDialogCancel } from '@/ui/primitives/alert-dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { AdminCaseFeedback } from './admin-case-forms';

export interface AdminResolutionState {
  initialValues?: CaseResolutionInput;
  initialPreview?: ResolutionPreviewResult;
  initialPreviewPending?: boolean;
}

function ResolutionField({ id, label, hint, error, children }: { id: string; label: string; hint: string; error?: string; children: ReactNode }) {
  return <Field data-invalid={Boolean(error)} className="gap-2">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
    {children}
    <div id={`${id}-error`} aria-live="polite">{error && <FieldError>{error}</FieldError>}</div>
  </Field>;
}

/** Only converts entered dollars to cents; the handler owns all money movements and refund limits. */
export function AdminResolutionForm({ data, handlers, onSuccess, onBusy, onCancel, initialValues, initialPreview, initialPreviewPending = false }: {
  data: AdminCasePageData;
  handlers: AdminCaseHandlers;
  onSuccess: (result: ActionResult) => void;
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
} & AdminResolutionState) {
  const t = useTranslations('adminCase');
  const fields = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const form = useForm<CaseResolutionInput>({ resolver: zodResolver(caseResolutionInputSchema), defaultValues: { summary: '', ...initialValues }, shouldUnregister: true });
  const action = useFormAction(form, { onResult: (result) => { if (result.ok) { onSuccess(result); router.refresh(); } } });
  const values = useWatch({ control: form.control });
  const resolution = values.resolution;
  const summary = values.summary ?? '';
  const amountName = resolution === 'settle' ? 'settlePriceCents' : resolution === 'goodwill_refund' ? 'goodwillCents' : undefined;
  const amount = amountName ? values[amountName] : undefined;
  const isMoney = resolution === 'release_full' || resolution === 'settle' || resolution === 'refund_full' || resolution === 'goodwill_refund';
  const [editing, setEditing] = useState<{ name: string; raw: string; cents: number }>();
  const [attempt, setAttempt] = useState(0);
  const previewKey = JSON.stringify([resolution, summary.trim(), amount, attempt]);
  const [seedKey] = useState(previewKey);
  const [previewState, setPreviewState] = useState<{ key: string; result: ResolutionPreviewResult } | undefined>(() => initialPreview ? { key: previewKey, result: initialPreview } : undefined);
  const seededPending = initialPreviewPending && previewKey === seedKey;
  const previewResult = isMoney && previewState?.key === previewKey ? previewState.result : undefined;
  const previewPending = isMoney && (!previewResult || seededPending);
  const preview = previewResult?.ok ? previewResult.preview : undefined;
  const previewError = previewResult && !previewResult.ok ? previewResult : undefined;
  const pending = action.pending || form.formState.isSubmitting;
  const { onPreviewResolution } = handlers;

  useEffect(() => {
    if (!isMoney || !resolution || seededPending || (initialPreview && previewKey === seedKey)) return;
    let current = true;
    const timer = setTimeout(async () => {
      const input: CaseResolutionInput = { resolution, summary: summary.trim(), ...(amountName ? { [amountName]: amount } : {}) };
      let result: ResolutionPreviewResult;
      try { result = await onPreviewResolution(input); }
      catch { result = { ok: false, code: 'unknown' }; }
      if (current) setPreviewState({ key: previewKey, result });
    }, 350);
    return () => { current = false; clearTimeout(timer); };
  }, [isMoney, resolution, summary, amountName, amount, previewKey, seededPending, initialPreview, seedKey, onPreviewResolution]);

  const errorCode = (name: keyof CaseResolutionInput) => previewError?.fieldErrors?.[name]?.[0] ?? form.formState.errors[name]?.message;
  const fieldCopy = (code?: string) => code ? fields(fields.has(code) ? code : 'invalid') : undefined;
  const resolutionCode = errorCode('resolution');
  const summaryCode = errorCode('summary');
  const amountCode = amountName ? errorCode(amountName) : undefined;
  const resolutionError = resolutionCode === 'required' ? t('resolve.required') : fieldCopy(resolutionCode);
  const summaryError = summaryCode === 'too_short' ? t('resolve.summaryTooShort') : summaryCode === 'too_long' ? t('resolve.summaryTooLong') : fieldCopy(summaryCode);
  const amountError = amountCode && resolution === 'settle' && (amountCode === 'invalid' || amountCode === 'out_of_range') && data.money ? t('resolve.settleInvalid', { price: formatMoney(data.money.priceCents) }) : fieldCopy(amountCode);
  const amountOutOfRange = amountName !== undefined && (!Number.isSafeInteger(amount) || (amount ?? 0) <= 0 || (resolution === 'settle' && data.money !== undefined && amount! >= data.money.priceCents));
  const blocked = pending || (isMoney && (previewPending || !preview?.withinLimit || amountOutOfRange));

  return <form noValidate aria-label={t('resolve.title')} aria-busy={pending} className="space-y-4" onSubmit={(event) => {
    if (blocked) { event.preventDefault(); return; }
    void form.handleSubmit(async (input) => {
      onBusy(true);
      try { await action.run(handlers.onResolve, input); }
      finally { onBusy(false); }
    })(event);
  }}>
    <fieldset disabled={pending} className="space-y-4">
      <legend className="sr-only">{t('resolve.title')}</legend>
      <fieldset className="space-y-2" aria-describedby={`${id}-resolution-hint${resolutionError ? ` ${id}-resolution-error` : ''}`}>
        <legend className="text-sm font-medium">{t('resolve.resolution')}</legend>
        <p id={`${id}-resolution-hint`} className="text-sm text-muted-foreground">{t('resolve.resolutionHint')}</p>
        <div className="grid gap-2">{data.resolutions.map((choice) => <label key={choice} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-secondary has-checked:text-secondary-foreground">
          <input {...form.register('resolution')} type="radio" value={choice} required aria-describedby={`${id}-resolution-hint${resolutionError ? ` ${id}-resolution-error` : ''}`} className="size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
          {t(`resolutions.${choice}`)}
        </label>)}</div>
        {resolutionError && <FieldError id={`${id}-resolution-error`}>{resolutionError}</FieldError>}
      </fieldset>
      {amountName && <ResolutionField id={`${id}-amount`} label={t(resolution === 'settle' ? 'resolve.settlePrice' : 'resolve.goodwillAmount')} hint={resolution === 'settle' && data.money ? t('resolve.settleHint', { price: formatMoney(data.money.priceCents) }) : t('resolve.goodwillHint')} error={amountError}>
        <Controller key={amountName} name={amountName} control={form.control} render={({ field }) => <Input id={`${id}-amount`} name={field.name} ref={field.ref} onBlur={field.onBlur} inputMode="decimal" required className="tabular-nums" aria-invalid={Boolean(amountError)} aria-describedby={`${id}-amount-hint ${id}-amount-error`}
          value={editing?.name === amountName && Object.is(editing.cents, field.value) ? editing.raw : Number.isInteger(field.value) && field.value! >= 0 ? formatMoneyInput(field.value!) : ''}
          onChange={(event) => { const raw = event.target.value; const cents = parseMoneyInput(raw) ?? -1; setEditing({ name: amountName, raw, cents }); field.onChange(cents); form.clearErrors(amountName); }} />}
        />
      </ResolutionField>}
      <ResolutionField id={`${id}-summary`} label={t('resolve.summary')} hint={t('resolve.summaryHint')} error={summaryError}>
        <Textarea {...form.register('summary')} id={`${id}-summary`} required rows={3} maxLength={1000} aria-invalid={Boolean(summaryError)} aria-describedby={`${id}-summary-hint ${id}-summary-error`} />
      </ResolutionField>
    </fieldset>
    {isMoney && <section aria-label={t('resolve.previewTitle')} aria-busy={previewPending} className="space-y-3 rounded-xl border bg-muted/40 p-4">
      <h3 className="font-semibold">{t('resolve.previewTitle')}</h3>
      <div aria-live="polite">
        {previewPending ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{t('resolve.previewPending')}</p> : preview ? <dl className="space-y-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><dt>{t('resolve.clientRefund')}</dt><dd className="font-semibold tabular-nums">{formatMoney(preview.posterRefundCents)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt>{t('resolve.helperReceives')}</dt><dd className="font-semibold tabular-nums">{formatMoney(preview.helperReceivesCents)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt>{t('resolve.platformKeeps')}</dt><dd className="font-semibold tabular-nums">{formatMoney(preview.platformKeepsCents)}</dd></div>
        </dl> : <AdminCaseFeedback result={previewError} />}
      </div>
      {preview && !preview.withinLimit && <p role="alert" className="rounded-lg border border-warning/30 bg-badge-warning p-3 text-sm text-badge-warning-foreground">{t('resolve.overLimit')}</p>}
      {previewError && previewError.code !== 'validation_failed' && <Button type="button" variant="outline" disabled={pending} onClick={() => setAttempt((value) => value + 1)}>{t('resolve.retryPreview')}</Button>}
    </section>}
    <AdminCaseFeedback result={action.result} />
    <div className="flex flex-wrap justify-end gap-2"><AlertDialogCancel type="button" disabled={pending} onClick={onCancel}>{t('cancel')}</AlertDialogCancel><Button type="submit" disabled={blocked} aria-busy={pending || previewPending}>{(pending || previewPending) && <Spinner aria-hidden="true" />}{t(pending ? 'working' : 'resolve.save')}</Button></div>
  </form>;
}
