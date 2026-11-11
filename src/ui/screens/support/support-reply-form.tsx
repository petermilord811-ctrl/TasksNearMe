'use client';

import { useId } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send } from 'lucide-react';
import { supportReplyInputSchema, type ActionResult, type SupportCaseHandlers, type SupportReplyInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export function SupportReplyForm({ handlers, initialResult, initialPending = false, initialBody = '' }: {
  handlers: SupportCaseHandlers;
  initialResult?: ActionResult;
  initialPending?: boolean;
  initialBody?: string;
}) {
  const t = useTranslations('supportCase');
  const fields = useTranslations('forms.fieldErrors');
  const id = useId();
  const router = useRouter();
  const form = useForm<SupportReplyInput>({ resolver: zodResolver(supportReplyInputSchema), defaultValues: { body: initialBody } });
  const action = useFormAction(form, { initialResult, onResult: (result) => {
    if (result.ok && result.code === 'sent') { form.reset({ body: '' }); router.refresh(); }
  } });
  const pending = action.pending || initialPending;
  const body = useWatch({ control: form.control, name: 'body' }) ?? '';
  const code = form.formState.errors.body?.message;
  const error = code === 'required' ? t('bodyRequired') : code === 'too_long' ? t('bodyTooLong') : code ? fields(fields.has(code) ? code : 'invalid') : undefined;
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : action.result;

  return <form noValidate aria-label={t('reply')} aria-busy={pending} className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-6" onSubmit={(event) => {
    if (pending) { event.preventDefault(); return; }
    void form.handleSubmit((input) => action.run(handlers.onReply, input))(event);
  }}>
    <Field className="gap-2" data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`${id}-body`}>{t('body')}</FieldLabel>
      <FieldDescription id={`${id}-hint`}>{t('bodyHint')}</FieldDescription>
      <Textarea {...form.register('body')} id={`${id}-body`} rows={4} maxLength={2000} required disabled={pending} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint ${id}-count${error ? ` ${id}-error` : ''}`} />
      <p id={`${id}-count`} className="text-sm tabular-nums text-muted-foreground">{t('bodyCount', { count: body.length })}</p>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
    <FormFeedback result={feedback} successMessage={action.result?.ok && action.result.code === 'sent' ? t('sent') : undefined} errorMessage={action.result && !action.result.ok && action.result.code === 'not_allowed' ? t('notAllowed') : undefined} />
    <div className="flex justify-end">
      <Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending ? <Spinner aria-hidden="true" /> : <Send aria-hidden="true" className="size-4" />}{t(pending ? 'sending' : 'send')}</Button>
    </div>
  </form>;
}
