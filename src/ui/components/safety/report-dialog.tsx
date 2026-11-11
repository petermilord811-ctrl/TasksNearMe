'use client';

import { useId, useState, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { REPORT_REASONS, reportInputSchema, type ActionResult, type ReportHandlers, type ReportInput, type ReportSubject } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export interface ReportDialogProps {
  subject: ReportSubject;
  onReport: ReportHandlers['onReport'];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  initialResult?: ActionResult;
  initialPending?: boolean;
  initialValues?: Partial<ReportInput>;
}

export function ReportDialog({ subject, onReport, open, onOpenChange, returnFocusRef, ...state }: ReportDialogProps) {
  const t = useTranslations('safety');
  const [pending, setPending] = useState(false);
  const busy = pending || Boolean(state.initialPending);
  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    <DialogContent showCloseButton={!busy} className="top-auto bottom-0 max-h-[90dvh] max-w-full translate-y-0 overflow-y-auto rounded-b-none p-4 sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-xl sm:p-6" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }} onCloseAutoFocus={(event) => {
      if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus(); }
    }}>
      <DialogHeader>
        <DialogTitle>{t('reportTitle', { name: subject.displayName })}</DialogTitle>
        <DialogDescription>{t('reportDescription')}</DialogDescription>
      </DialogHeader>
      <ReportForm onReport={onReport} onClose={() => onOpenChange(false)} onPendingChange={setPending} {...state} />
    </DialogContent>
  </Dialog>;
}

function ReportForm({ onReport, onClose, onPendingChange, initialResult, initialPending = false, initialValues }: Pick<ReportDialogProps, 'onReport' | 'initialResult' | 'initialPending' | 'initialValues'> & { onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const t = useTranslations('safety');
  const fields = useTranslations('forms.fieldErrors');
  const id = useId();
  const form = useForm<ReportInput>({ resolver: zodResolver(reportInputSchema), shouldFocusError: false, defaultValues: { reason: undefined, details: '', ...initialValues } });
  const action = useFormAction(form, { initialResult });
  const details = useWatch({ control: form.control, name: 'details' });
  const pending = action.pending || initialPending;
  const submitted = action.result?.ok && action.result.code === 'submitted';
  const errorCopy = (code: string) => fields(fields.has(code) ? code : 'invalid');
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : action.result;

  return <form noValidate aria-label={t('send')} aria-busy={pending} className="space-y-5" onSubmit={(event) => {
    if (pending || submitted) { event.preventDefault(); return; }
    void form.handleSubmit(async (input) => {
      onPendingChange(true);
      await action.run(onReport, input);
      onPendingChange(false);
    }, (errors) => form.setFocus(errors.reason ? 'reason' : 'details'))(event);
  }}>
    {!submitted && <fieldset disabled={pending} className="min-w-0 space-y-5">
      <legend className="sr-only">{t('report')}</legend>
      <Controller control={form.control} name="reason" render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid} className="gap-2">
        <p id={`${id}-reason-label`} className="font-medium">{t('reason')}</p>
        <FieldDescription id={`${id}-reason-hint`}>{t('reasonHint')}</FieldDescription>
        <div role="radiogroup" aria-required="true" aria-labelledby={`${id}-reason-label`} aria-invalid={fieldState.invalid} aria-describedby={`${id}-reason-hint${fieldState.error ? ` ${id}-reason-error` : ''}`} className="grid gap-1">
          {REPORT_REASONS.map((reason, index) => <label key={reason} className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2', field.value === reason ? 'border-primary bg-secondary text-secondary-foreground' : 'border-input')}>
            <input type="radio" name={field.name} value={reason} checked={field.value === reason} onChange={() => field.onChange(reason)} onBlur={field.onBlur} ref={index === 0 ? field.ref : undefined} required disabled={pending} aria-describedby={`${id}-reason-hint${fieldState.error ? ` ${id}-reason-error` : ''}`} className="size-4 shrink-0 accent-primary" />
            <span>{t(`reasons.${reason}`)}</span>
          </label>)}
        </div>
        {fieldState.error?.message && <FieldError id={`${id}-reason-error`}>{fieldState.error.message === 'required' ? t('reasonRequired') : errorCopy(fieldState.error.message)}</FieldError>}
      </Field>} />
      <Field data-invalid={Boolean(form.formState.errors.details)} className="gap-2">
        <FieldLabel htmlFor={`${id}-details`} className="text-foreground">{t('details')}</FieldLabel>
        <Textarea {...form.register('details')} id={`${id}-details`} rows={4} maxLength={1000} aria-invalid={Boolean(form.formState.errors.details)} aria-describedby={`${id}-details-hint ${id}-details-count${form.formState.errors.details ? ` ${id}-details-error` : ''}`} />
        <FieldDescription id={`${id}-details-hint`}>{t('detailsHint')}</FieldDescription>
        <p id={`${id}-details-count`} className="text-sm tabular-nums text-muted-foreground">{t('detailsCount', { count: details.length })}</p>
        {form.formState.errors.details?.message && <FieldError id={`${id}-details-error`}>{form.formState.errors.details.message === 'too_short' ? t('detailsTooShort') : errorCopy(form.formState.errors.details.message)}</FieldError>}
      </Field>
    </fieldset>}
    <FormFeedback result={feedback} successMessage={t('submitted')} />
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t(submitted ? 'done' : 'cancel')}</Button>
      {!submitted && <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'sending' : 'send')}</Button>}
    </div>
  </form>;
}
