'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, UsersRound } from 'lucide-react';
import { reviewModerationInputSchema, type ActionHandler, type AdminCaseGroupMessage, type ReviewModerationInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { MessageAttachments } from '@/ui/components/messaging/message-media';
import { useFormat } from '@/ui/lib/format';
import { useFormAction } from '@/ui/lib/use-form-action';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

/**
 * A reported message from a building or street group on its case (2026-11-24): the message as written and its group's
 * name, never the rest of the conversation; for trust and safety, leads and admins, removing it or restoring it with a
 * reason (audited, and noted on the case).
 */
export function AdminReportedGroupMessage({ data, onModerate, initialOpen = false }: { data: AdminCaseGroupMessage; onModerate?: ActionHandler<ReviewModerationInput>; initialOpen?: boolean }) {
  const t = useTranslations('adminCase.groupMessage');
  const fields = useTranslations('forms.fieldErrors');
  const { formatDate } = useFormat();
  const router = useRouter();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const hidden = data.status === 'removed';
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
  const verb = hidden ? 'restore' : 'remove';
  const gone = data.status === 'deleted';

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-xl font-semibold">{t('title')}</h2>
        <Badge variant={hidden ? 'destructive' : 'secondary'}>{t(`statuses.${data.status}`)}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{t('about', { author: data.message.author.displayName, group: data.group.name, area: data.group.areaName, count: data.group.memberCount, date: formatDate(data.message.createdAt) })}</p>
      {data.message.body && <blockquote className="flex gap-2 whitespace-pre-wrap rounded-xl bg-muted/50 px-3 py-2 text-[15px] leading-6 [overflow-wrap:anywhere]"><UsersRound aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" /><span>{data.message.body}</span></blockquote>}
      {/* Its photos or GIF (2026-11-24), through this case's staff link. */}
      {data.photos && <MessageAttachments attachments={data.photos} sender={data.message.author.displayName} className="max-w-md" />}
      {hidden && data.removedReason && <p className="text-sm"><span className="font-medium">{t('removedReason')}</span> <span className="whitespace-pre-wrap">{data.removedReason}</span></p>}
      {gone ? <p className="text-sm text-muted-foreground">{t('deletedByAuthor')}</p> : data.canModerate && onModerate ? (
        <Button ref={trigger} type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
          {hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}{t(verb)}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{t('whoCan')}</p>
      )}
      {onModerate && !gone && <AlertDialog open={open} onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) form.reset(blank);
      }}>
        <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`dialog.${verb}Title`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`dialog.${verb}Description`, { group: data.group.name })}</AlertDialogDescription>
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
      </AlertDialog>}
    </section>
  );
}
