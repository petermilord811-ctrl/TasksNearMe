'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Pin, Trash2 } from 'lucide-react';
import { communityModerationInputSchema, routes, type ActionHandler, type ActionResult, type AdminCaseQuestion, type CommunityModerationInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { useFormAction } from '@/ui/lib/use-form-action';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

type Action = CommunityModerationInput['action'];

/**
 * A reported question on a task, or its answer, on its case (sweep QA2): the question and the poster's answer as
 * written, which of them the report is about, whether members can see them, and hide, remove or restore with a
 * reason (audited, and noted on the case). Focus returns to the button that opened the dialog.
 */
/** `initialAction` and `initialResult` open the dialog with a result, for previews. */
export function AdminReportedQuestion({ data, onModerate, initialAction, initialResult }: { data: AdminCaseQuestion; onModerate: ActionHandler<CommunityModerationInput>; initialAction?: Action; initialResult?: ActionResult }) {
  const t = useTranslations('adminCase.question');
  const fields = useTranslations('forms.fieldErrors');
  const { formatDateTime } = useFormat();
  const router = useRouter();
  const id = useId();
  const triggers = useRef<Partial<Record<Action, HTMLButtonElement | null>>>({});
  const [action, setAction] = useState<Action | null>(initialAction ?? null);
  const visible = data.status === 'visible';
  const form = useForm<CommunityModerationInput>({ resolver: zodResolver(communityModerationInputSchema), defaultValues: { action: initialAction ?? 'hide', reason: '' } });
  const submit = useFormAction(form, {
    initialResult,
    onResult: (result) => {
      if (!result.ok) return;
      setAction(null);
      router.refresh();
    },
  });
  const pending = submit.pending || form.formState.isSubmitting;
  const code = form.formState.errors.reason?.message;
  const error = code === 'required' || code === 'too_short' ? t('dialog.required') : code === 'too_long' ? t('dialog.tooLong') : code ? fields(fields.has(code) ? code : 'invalid') : undefined;
  const feedback = submit.result && !submit.result.ok ? { ...submit.result, fieldErrors: undefined } : undefined;
  const feedbackMessage = feedback?.code === 'limit_reached' ? t('dialog.newerOpen') : feedback?.code === 'not_allowed' ? t('dialog.notAllowed') : undefined;
  const open = (next: Action) => {
    form.reset({ action: next, reason: '' });
    setAction(next);
  };
  const { question } = data;

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-xl font-semibold">{t(`title.${data.reported}`)}</h2>
        <Badge variant={visible ? 'secondary' : 'destructive'}>{t(`statuses.${data.status}`)}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('onTask')} <Link href={routes.admin.task(data.task.id)} className="font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{data.task.title}</Link>
      </p>
      <div className={cn('space-y-2 rounded-xl border p-3 sm:p-4', data.reported === 'question' ? 'border-callout-border bg-callout text-callout-foreground' : 'border-foreground/[0.07] dark:border-white/[0.06]')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t('askedBy', { name: question.asker.displayName })}</p>
          <time dateTime={question.askedAt} className={cn('text-xs tabular-nums', data.reported === 'question' ? 'text-callout-foreground/80' : 'text-muted-foreground')}>{formatDateTime(question.askedAt)}</time>
        </div>
        {data.reported === 'question' && <p className="text-xs font-semibold uppercase tracking-wide text-callout-accent">{t('reported')}</p>}
        <p className="whitespace-pre-wrap text-sm leading-6">{question.body}</p>
      </div>
      {question.answer
        ? <div className={cn('space-y-2 rounded-xl border p-3 sm:p-4', data.reported === 'answer' ? 'border-callout-border bg-callout text-callout-foreground' : 'border-foreground/[0.07] dark:border-white/[0.06]')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">{t('answeredBy', { name: question.answer.poster.displayName })}{question.pinned && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground"><Pin aria-hidden="true" className="size-3" />{t('pinned')}</span>}</p>
              <time dateTime={question.answer.answeredAt} className={cn('text-xs tabular-nums', data.reported === 'answer' ? 'text-callout-foreground/80' : 'text-muted-foreground')}>{formatDateTime(question.answer.answeredAt)}</time>
            </div>
            {data.reported === 'answer' && <p className="text-xs font-semibold uppercase tracking-wide text-callout-accent">{t('reported')}</p>}
            <p className="whitespace-pre-wrap text-sm leading-6">{question.answer.body}</p>
          </div>
        : <p className="text-sm text-muted-foreground">{t('unanswered')}</p>}
      {!visible && data.reason && <p className="text-sm"><span className="font-medium">{t(data.reason === 'author' ? 'takenBack' : 'reason')}</span>{data.reason !== 'author' && <> <span className="whitespace-pre-wrap">{data.reason}</span></>}</p>}
      <p className="text-sm text-muted-foreground">{t(visible ? 'whatHideDoes' : 'whatRestoreDoes')}</p>
      {data.canModerate && <div className="flex flex-wrap gap-2">
        {visible
          ? <>
              <Button ref={(node) => { triggers.current.hide = node; }} type="button" variant="outline" className="min-h-11" onClick={() => open('hide')}><EyeOff aria-hidden="true" />{t('hide')}</Button>
              <Button ref={(node) => { triggers.current.remove = node; }} type="button" variant="outline" className="min-h-11 text-destructive hover:text-destructive" onClick={() => open('remove')}><Trash2 aria-hidden="true" />{t('remove')}</Button>
            </>
          : <Button ref={(node) => { triggers.current.restore = node; }} type="button" variant="outline" className="min-h-11" onClick={() => open('restore')}><Eye aria-hidden="true" />{t('restore')}</Button>}
      </div>}
      <AlertDialog open={action !== null} onOpenChange={(next) => {
        if (pending) return;
        if (!next) setAction(null);
      }}>
        <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); const last = form.getValues('action'); triggers.current[last]?.focus(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{action ? t(`dialog.${action}Title`) : ''}</AlertDialogTitle>
            <AlertDialogDescription>{action ? t(`dialog.${action}Description`) : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <form noValidate aria-label={action ? t(`dialog.${action}Title`) : undefined} aria-busy={pending} className="space-y-4" onSubmit={(event) => {
            if (pending || !action) { event.preventDefault(); return; }
            void form.handleSubmit((input) => submit.run(onModerate, { ...input, action }))(event);
          }}>
            <Field data-invalid={Boolean(error)} className="gap-2">
              <FieldLabel htmlFor={`${id}-reason`}>{t('dialog.reason')}</FieldLabel>
              <FieldDescription id={`${id}-hint`}>{t('dialog.hint')}</FieldDescription>
              <Textarea {...form.register('reason')} id={`${id}-reason`} required maxLength={500} rows={4} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} />
              {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
            </Field>
            <FormFeedback result={feedback} errorMessage={feedbackMessage} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialogCancel type="button" disabled={pending}>{t('dialog.cancel')}</AlertDialogCancel>
              <Button type="submit" variant={action === 'restore' ? 'default' : 'destructive'} disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'dialog.pending' : `dialog.${action ?? 'hide'}Submit`)}</Button>
            </div>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
