'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { badgeModerationInputSchema, type ActionHandler, type BadgeModerationInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

/**
 * Revoking a badge earned unfairly, or restoring it (trust and safety, support leads, admins; completion plan
 * 6.4): a reason, then it's hidden everywhere (or shown again). Focus returns to the button when the dialog closes.
 */
export function AdminBadgeModeration({ badgeId, label, revoke, onModerate, initialOpen = false }: { badgeId: string; label: string; revoke: boolean; onModerate: ActionHandler<BadgeModerationInput>; initialOpen?: boolean }) {
  const t = useTranslations('adminUser');
  const fields = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const form = useForm<BadgeModerationInput>({ resolver: zodResolver(badgeModerationInputSchema), defaultValues: { badgeId, revoke, reason: '' } });
  const action = useFormAction(form, {
    onResult: (result) => {
      if (!result.ok) return;
      setOpen(false);
      router.refresh();
    },
  });
  const pending = action.pending || form.formState.isSubmitting;
  const code = form.formState.errors.reason?.message;
  const error = code === 'required' || code === 'too_short' ? t('badgeDialog.required') : code === 'too_long' ? t('badgeDialog.tooLong') : code ? fields(fields.has(code) ? code : 'invalid') : undefined;
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : undefined;

  return <>
    <Button ref={trigger} type="button" variant="outline" className="min-h-11" aria-label={t(revoke ? 'badgeRevokeLabel' : 'badgeRestoreLabel', { badge: label })} onClick={() => setOpen(true)}>{t(revoke ? 'badgeRevoke' : 'badgeRestore')}</Button>
    <AlertDialog open={open} onOpenChange={(next) => {
      if (pending) return;
      setOpen(next);
      // A closed dialog starts over next time.
      if (!next) form.reset({ badgeId, revoke, reason: '' });
    }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(revoke ? 'badgeDialog.revokeTitle' : 'badgeDialog.restoreTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t(revoke ? 'badgeDialog.revokeDescription' : 'badgeDialog.restoreDescription', { badge: label })}</AlertDialogDescription>
        </AlertDialogHeader>
        <form noValidate aria-label={t(revoke ? 'badgeDialog.revokeTitle' : 'badgeDialog.restoreTitle')} aria-busy={pending} className="space-y-4" onSubmit={(event) => {
          if (pending) { event.preventDefault(); return; }
          void form.handleSubmit((input) => action.run(onModerate, input))(event);
        }}>
          <Field data-invalid={Boolean(error)} className="gap-2">
            <FieldLabel htmlFor={`${id}-reason`}>{t('badgeDialog.reason')}</FieldLabel>
            <FieldDescription id={`${id}-hint`}>{t('badgeDialog.hint')}</FieldDescription>
            <Textarea {...form.register('reason')} id={`${id}-reason`} required maxLength={1000} rows={4} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} />
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
          </Field>
          <FormFeedback result={feedback} errorMessage={feedback?.code === 'not_allowed' ? t('badgeDialog.notAllowed') : undefined} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel type="button" disabled={pending}>{t('badgeDialog.cancel')}</AlertDialogCancel>
            <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'badgeDialog.pending' : revoke ? 'badgeDialog.revoke' : 'badgeDialog.restore')}</Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
