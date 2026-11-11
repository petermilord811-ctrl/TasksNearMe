'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { STAFF_REFUND_REASONS, staffRefundInputSchema, type ActionResult, type AdminBookingHandlers, type AdminBookingPageData, type StaffRefundInput } from '@/contracts';
import { formatMoney, formatMoneyInput, parseMoneyInput } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { AlertDialogCancel } from '@/ui/primitives/alert-dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export interface AdminRefundState { initialValues?: Partial<StaffRefundInput>; initialResult?: ActionResult; initialPending?: boolean }

export function AdminBookingRefundForm({ refund, onRefund, onCancel, onBusy, onSuccess, initialValues, initialResult, initialPending = false }: {
  refund: NonNullable<AdminBookingPageData['refund']>; onRefund: AdminBookingHandlers['onRefund'];
  onCancel: () => void; onBusy: (busy: boolean) => void; onSuccess: (result: ActionResult) => void;
} & AdminRefundState) {
  const t = useTranslations('adminBooking.refund');
  const fields = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const form = useForm<StaffRefundInput>({ resolver: zodResolver(staffRefundInputSchema), defaultValues: { amountCents: 0, note: '', ...initialValues } });
  const [editing, setEditing] = useState<{ raw: string; cents: number }>();
  const amount = useWatch({ control: form.control, name: 'amountCents' });
  const aboveMax = amount > refund.maxCents;
  const action = useFormAction(form, { initialResult, onResult: (result) => { if (result.ok) { onSuccess(result); router.refresh(); } } });
  const pending = action.pending || form.formState.isSubmitting || initialPending;
  const fieldCopy = (code?: string) => code ? fields(fields.has(code) ? code : 'invalid') : undefined;
  const errors = form.formState.errors;
  const amountError = aboveMax || errors.amountCents?.message === 'out_of_range' ? t('amountTooHigh', { amount: formatMoney(refund.maxCents) }) : errors.amountCents ? t('amountInvalid') : undefined;
  const reasonError = errors.reason ? t('reasonRequired') : undefined;
  const noteError = errors.note?.message === 'too_short' || errors.note?.message === 'required' ? t('noteTooShort') : fieldCopy(errors.note?.message);
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : action.result;
  return <form noValidate aria-label={t('title')} aria-busy={pending} className="space-y-4" onSubmit={(event) => {
    if (pending || aboveMax) { event.preventDefault(); if (aboveMax) form.setFocus('amountCents'); return; }
    void form.handleSubmit(async (input) => {
      if (input.amountCents > refund.maxCents) { form.setError('amountCents', { type: 'max', message: 'invalid' }, { shouldFocus: true }); return; }
      onBusy(true); try { await action.run(onRefund, input); } finally { onBusy(false); }
    })(event);
  }}>
    <p className="rounded-lg bg-secondary p-3 text-sm font-medium tabular-nums text-secondary-foreground">{t('limit', { amount: formatMoney(refund.limitCents) })}</p>
    <fieldset disabled={pending} className="space-y-4">
      <legend className="sr-only">{t('title')}</legend>
      <Field data-invalid={Boolean(amountError)} className="gap-2">
        <FieldLabel htmlFor={`${id}-amount`}>{t('amount')}</FieldLabel>
        <FieldDescription id={`${id}-amount-hint`}>{t('amountHint', { amount: formatMoney(refund.maxCents) })}</FieldDescription>
        <Controller control={form.control} name="amountCents" render={({ field }) => <Input ref={field.ref} name={field.name} onBlur={field.onBlur} id={`${id}-amount`} inputMode="decimal" required aria-invalid={Boolean(amountError)} aria-describedby={`${id}-amount-hint${amountError ? ` ${id}-amount-error` : ''}`} className="tabular-nums" value={editing && Object.is(editing.cents, field.value) ? editing.raw : field.value > 0 ? formatMoneyInput(field.value) : ''} onChange={(event) => { const raw = event.target.value; const cents = parseMoneyInput(raw) ?? -1; setEditing({ raw, cents }); field.onChange(cents); }} />} />
        {amountError && <FieldError id={`${id}-amount-error`}>{amountError}</FieldError>}
      </Field>
      <Field data-invalid={Boolean(reasonError)} className="gap-2">
        <FieldLabel htmlFor={`${id}-reason`}>{t('reason')}</FieldLabel>
        <FieldDescription id={`${id}-reason-hint`}>{t('reasonHint')}</FieldDescription>
        <select {...form.register('reason')} id={`${id}-reason`} defaultValue={initialValues?.reason ?? ''} required aria-invalid={Boolean(reasonError)} aria-describedby={`${id}-reason-hint${reasonError ? ` ${id}-reason-error` : ''}`} className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-invalid:border-destructive">
          <option value="">{t('chooseReason')}</option>{STAFF_REFUND_REASONS.map((reason) => <option key={reason} value={reason}>{t(`reasons.${reason}`)}</option>)}
        </select>
        {reasonError && <FieldError id={`${id}-reason-error`}>{reasonError}</FieldError>}
      </Field>
      <Field data-invalid={Boolean(noteError)} className="gap-2">
        <FieldLabel htmlFor={`${id}-note`}>{t('note')}</FieldLabel>
        <FieldDescription id={`${id}-note-hint`}>{t('noteHint')}</FieldDescription>
        <Textarea {...form.register('note')} id={`${id}-note`} rows={4} maxLength={1000} required aria-invalid={Boolean(noteError)} aria-describedby={`${id}-note-hint${noteError ? ` ${id}-note-error` : ''}`} />
        {noteError && <FieldError id={`${id}-note-error`}>{noteError}</FieldError>}
      </Field>
    </fieldset>
    <FormFeedback result={feedback} successMessage={t('submitted')} errorMessage={feedback && !feedback.ok && feedback.code === 'not_allowed' ? t('notAllowed') : undefined} />
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><AlertDialogCancel type="button" disabled={pending} onClick={onCancel}>{t('cancel')}</AlertDialogCancel><Button type="submit" disabled={pending || aboveMax} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'submitting' : 'submit')}</Button></div>
  </form>;
}
