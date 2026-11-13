'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { EyeOff, Eye } from 'lucide-react';
import { reviewModerationInputSchema, type ActionHandler, type AdminCaseReview, type ReviewModerationInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { ReviewCard } from '@/ui/components/reviews/review-card';
import { useFormAction } from '@/ui/lib/use-form-action';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

/**
 * A review report's review on its case: the review as it shows (or showed) on the profile, whether it's
 * visible, and, for leads, trust and safety and admins, hiding it or showing it again with a reason (audited,
 * and noted on the case). Focus returns to the button when the dialog closes.
 */
export function AdminReportedReview({ data, onModerate, initialOpen = false }: { data: AdminCaseReview; onModerate: ActionHandler<ReviewModerationInput>; initialOpen?: boolean }) {
  const t = useTranslations('adminCase.review');
  const fields = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const hidden = data.status === 'hidden';
  const blank = { visible: hidden, reason: '' };
  const form = useForm<ReviewModerationInput>({ resolver: zodResolver(reviewModerationInputSchema), defaultValues: blank });
  const action = useFormAction(form, {
    onResult: (result) => {
      if (!result.ok) return;
      setOpen(false);
      router.refresh();
    },
  });
  const pending = action.pending || form.formState.isSubmitting;
  const code = form.formState.errors.reason?.message;
  const error = code === 'required' || code === 'too_short' ? t('dialog.required') : code === 'too_long' ? t('dialog.tooLong') : code ? fields(fields.has(code) ? code : 'invalid') : undefined;
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : undefined;
  const verb = hidden ? 'show' : 'hide';

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-xl font-semibold">{t('title')}</h2>
        <Badge variant={hidden ? 'destructive' : 'secondary'}>{t(`statuses.${data.status}`)}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{t('about', { name: data.subject.displayName })}</p>
      <ReviewCard review={data.review} />
      {hidden && data.hiddenReason && <p className="text-sm"><span className="font-medium">{t('hiddenReason')}</span> <span className="whitespace-pre-wrap">{data.hiddenReason}</span></p>}
      {data.canModerate ? (
        <Button ref={trigger} type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
          {hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}{t(verb)}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{t('whoCan')}</p>
      )}
      <AlertDialog open={open} onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        // A closed dialog starts over next time.
        if (!next) form.reset(blank);
      }}>
        <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`dialog.${verb}Title`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`dialog.${verb}Description`, { name: data.subject.displayName })}</AlertDialogDescription>
          </AlertDialogHeader>
          <form noValidate aria-label={t(`dialog.${verb}Title`)} aria-busy={pending} className="space-y-4" onSubmit={(event) => {
            if (pending) { event.preventDefault(); return; }
            void form.handleSubmit((input) => action.run(onModerate, { ...input, visible: hidden }))(event);
          }}>
            <Field data-invalid={Boolean(error)} className="gap-2">
              <FieldLabel htmlFor={`${id}-reason`}>{t('dialog.reason')}</FieldLabel>
              <FieldDescription id={`${id}-hint`}>{t('dialog.hint')}</FieldDescription>
              <Textarea {...form.register('reason')} id={`${id}-reason`} required maxLength={1000} rows={4} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} />
              {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
            </Field>
            <FormFeedback result={feedback} errorMessage={feedback?.code === 'not_allowed' ? t('dialog.notAllowed') : undefined} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialogCancel type="button" disabled={pending}>{t('dialog.cancel')}</AlertDialogCancel>
              <Button type="submit" variant={hidden ? 'default' : 'destructive'} disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'dialog.pending' : `dialog.${verb}Submit`)}</Button>
            </div>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
