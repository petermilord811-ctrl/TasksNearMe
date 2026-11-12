'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { strikeReversalInputSchema, type AdminUserHandlers, type StrikeReversalInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

/**
 * Reversing one strike on appeal (trust and safety, support leads, admins): a reason, then the strike stops
 * counting. Focus returns to the button when the dialog closes.
 */
export function AdminStrikeReversal({ strikeId, label, handlers, initialOpen = false }: { strikeId: string; label: string; handlers: AdminUserHandlers; initialOpen?: boolean }) {
  const t = useTranslations('adminUser');
  const fields = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const form = useForm<StrikeReversalInput>({ resolver: zodResolver(strikeReversalInputSchema), defaultValues: { strikeId, reason: '' } });
  const action = useFormAction(form, {
    onResult: (result) => {
      if (!result.ok) return;
      setOpen(false);
      router.refresh();
    },
  });
  const pending = action.pending || form.formState.isSubmitting;
  const code = form.formState.errors.reason?.message;
  const error = code === 'required' || code === 'too_short' ? t('strikeDialog.required') : code === 'too_long' ? t('strikeDialog.tooLong') : code ? fields(fields.has(code) ? code : 'invalid') : undefined;
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : undefined;

  return <>
    <Button ref={trigger} type="button" variant="outline" className="min-h-11" aria-label={t('strikeReverseLabel', { strike: label })} onClick={() => setOpen(true)}>{t('strikeReverse')}</Button>
    <AlertDialog open={open} onOpenChange={(next) => {
      if (pending) return;
      setOpen(next);
      // A closed dialog starts over next time.
      if (!next) form.reset({ strikeId, reason: '' });
    }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('strikeDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('strikeDialog.description', { strike: label })}</AlertDialogDescription>
        </AlertDialogHeader>
        <form noValidate aria-label={t('strikeDialog.title')} aria-busy={pending} className="space-y-4" onSubmit={(event) => {
          if (pending) { event.preventDefault(); return; }
          void form.handleSubmit((input) => action.run(handlers.onReverseStrike, input))(event);
        }}>
          <Field data-invalid={Boolean(error)} className="gap-2">
            <FieldLabel htmlFor={`${id}-reason`}>{t('strikeDialog.reason')}</FieldLabel>
            <FieldDescription id={`${id}-hint`}>{t('strikeDialog.hint')}</FieldDescription>
            <Textarea {...form.register('reason')} id={`${id}-reason`} required maxLength={1000} rows={4} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} />
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
          </Field>
          <FormFeedback result={feedback} errorMessage={feedback?.code === 'not_allowed' ? t('strikeDialog.notAllowed') : undefined} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel type="button" disabled={pending}>{t('strikeDialog.cancel')}</AlertDialogCancel>
            <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'strikeDialog.pending' : 'strikeDialog.submit')}</Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
