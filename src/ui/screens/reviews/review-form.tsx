'use client';

import { useId, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Lock, Star } from 'lucide-react';
import { createReviewInputSchema, reviewTagsFor, type ActionResult, type ReviewHandlers, type ReviewInput, type ReviewPageData } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { useKeepFocusAboveBar } from '@/ui/lib/keep-focus-above-bar';

export function ReviewForm({ data, handlers, initialResult, initialPending = false }: {
  data: ReviewPageData;
  handlers: ReviewHandlers;
  initialResult?: ActionResult;
  initialPending?: boolean;
}) {
  const { formatDate } = useFormat();
  const t = useTranslations('review');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const id = useId();
  const schema = useMemo(() => createReviewInputSchema(data.direction), [data.direction]);
  const form = useForm<ReviewInput>({ resolver: zodResolver(schema), defaultValues: { rating: 0, tags: [], body: '', privateFeedback: '' } });
  const action = useFormAction(form, { initialResult });
  const pending = action.pending || initialPending;
  const disabled = pending || Boolean(action.result?.ok);
  const body = useWatch({ control: form.control, name: 'body' });
  const privateFeedback = useWatch({ control: form.control, name: 'privateFeedback' });
  const submitBar = useRef<HTMLDivElement>(null);
  // A field that focus reaches behind the sticky bar, or whose hint or count is, comes clear of it, also when a
  // keyboard that shrinks the page opens (WCAG 2.4.11).
  const formRef = useRef<HTMLFormElement>(null);
  useKeepFocusAboveBar(formRef, submitBar);
  const fieldError = (code: string) => fieldCopy(fieldCopy.has(code) ? code : 'invalid');
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : action.result;

  return <form ref={formRef} noValidate aria-label={t('yourReview')} aria-busy={pending} className="space-y-6" onSubmit={(event) => {
    if (disabled) { event.preventDefault(); return; }
    void form.handleSubmit((input) => action.run(handlers.onSubmit, input))(event);
  }}>
    <fieldset disabled={disabled} className="min-w-0 space-y-6 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card sm:p-6">
      <legend className="sr-only">{t('yourReview')}</legend>
      <Controller control={form.control} name="rating" render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid} className="gap-2">
        <p id={`${id}-rating-label`} className="font-medium">{t('rating')}</p>
        <FieldDescription id={`${id}-rating-hint`}>{t('ratingHint')}</FieldDescription>
        <div role="radiogroup" aria-required="true" aria-labelledby={`${id}-rating-label`} aria-describedby={`${id}-rating-hint${fieldState.error ? ` ${id}-rating-error` : ''}`} aria-invalid={fieldState.invalid} className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((rating) => <label key={rating} className="relative cursor-pointer">
            <input type="radio" name={field.name} value={rating} checked={field.value === rating} onChange={() => field.onChange(rating)} onBlur={field.onBlur} ref={rating === 1 ? field.ref : undefined} required disabled={disabled} aria-label={t('stars', { count: rating })} aria-describedby={`${id}-rating-hint${fieldState.error ? ` ${id}-rating-error` : ''}`} className="peer sr-only" />
            <span className={cn('flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-muted-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:cursor-not-allowed peer-disabled:opacity-50', field.value === rating ? 'border-primary bg-secondary text-secondary-foreground' : 'border-input hover:bg-accent')}>
              <Star aria-hidden="true" className={cn('size-6', rating <= field.value && 'fill-current text-warning')} />
              <span aria-hidden="true" className="text-sm font-medium tabular-nums">{rating}</span>
            </span>
          </label>)}
        </div>
        {fieldState.error?.message && <FieldError id={`${id}-rating-error`}>{fieldState.error.message === 'required' ? t('ratingRequired') : fieldError(fieldState.error.message)}</FieldError>}
      </Field>} />
      <Controller control={form.control} name="tags" render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid} className="gap-2">
        <p id={`${id}-tags-label`} className="font-medium">{t('tagsLabel')}</p>
        <FieldDescription id={`${id}-tags-hint`}>{t('tagsHint')}</FieldDescription>
        <div role="group" aria-labelledby={`${id}-tags-label`} aria-describedby={`${id}-tags-hint ${id}-tags-count${fieldState.error ? ` ${id}-tags-error` : ''}`} className="flex flex-wrap gap-2">
          {reviewTagsFor(data.direction).map((tag) => {
            const selected = field.value.includes(tag);
            const focusTag = reviewTagsFor(data.direction).find((value) => field.value.length < 5 || field.value.includes(value));
            return <Button key={tag} type="button" variant={selected ? 'secondary' : 'outline'} ref={tag === focusTag ? field.ref : undefined} aria-pressed={selected} disabled={disabled || (!selected && field.value.length >= 5)} onBlur={field.onBlur} onClick={() => field.onChange(selected ? field.value.filter((value) => value !== tag) : [...field.value, tag])} className={cn('h-auto min-h-11 max-w-full rounded-full whitespace-normal border px-4 py-2 text-left', selected && 'border-primary')}>
              {selected && <Check aria-hidden="true" className="size-4 shrink-0" />}{t(`tags.${tag}`)}
            </Button>;
          })}
        </div>
        <p id={`${id}-tags-count`} aria-live="polite" className="text-sm tabular-nums text-muted-foreground">{t(field.value.length >= 5 ? 'tagsLimit' : 'tagsCount', { count: field.value.length })}</p>
        {fieldState.error?.message && <FieldError id={`${id}-tags-error`}>{fieldError(fieldState.error.message)}</FieldError>}
      </Field>} />
      <Field data-invalid={Boolean(form.formState.errors.body)} className="gap-2">
        <FieldLabel htmlFor={`${id}-body`} className="text-foreground">{t('bodyLabel')}</FieldLabel>
        <FieldDescription id={`${id}-body-hint`}>{t('bodyHint')}</FieldDescription>
        <Textarea {...form.register('body')} id={`${id}-body`} rows={5} maxLength={1000} aria-invalid={Boolean(form.formState.errors.body)} aria-describedby={`${id}-body-hint ${id}-body-count${form.formState.errors.body ? ` ${id}-body-error` : ''}`} className="min-h-32" />
        <p id={`${id}-body-count`} className="text-sm tabular-nums text-muted-foreground">{t('bodyCount', { count: body?.length ?? 0 })}</p>
        {form.formState.errors.body?.message && <FieldError id={`${id}-body-error`}>{fieldError(form.formState.errors.body.message)}</FieldError>}
      </Field>
      <Field data-invalid={Boolean(form.formState.errors.privateFeedback)} className="gap-2 border-t pt-6">
        <FieldLabel htmlFor={`${id}-private`} className="text-foreground">{t('privateLabel')}</FieldLabel>
        <FieldDescription id={`${id}-private-hint`} className="flex items-start gap-2"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{t('privateHint', { name: data.subject.displayName })}</span></FieldDescription>
        <Textarea {...form.register('privateFeedback')} id={`${id}-private`} rows={3} maxLength={1000} aria-invalid={Boolean(form.formState.errors.privateFeedback)} aria-describedby={`${id}-private-hint ${id}-private-count${form.formState.errors.privateFeedback ? ` ${id}-private-error` : ''}`} />
        <p id={`${id}-private-count`} className="text-sm tabular-nums text-muted-foreground">{t('bodyCount', { count: privateFeedback?.length ?? 0 })}</p>
        {form.formState.errors.privateFeedback?.message && <FieldError id={`${id}-private-error`}>{fieldError(form.formState.errors.privateFeedback.message)}</FieldError>}
      </Field>
    </fieldset>
    <p className="flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm text-secondary-foreground"><Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><span>{t('privacyNote', { date: formatDate(data.publishesBy) })}</span></p>
    <FormFeedback result={feedback} successMessage={t('sent')} errorMessage={action.result && !action.result.ok && action.result.code === 'not_allowed' ? t('notAllowed') : undefined} />
    <div ref={submitBar} className="sticky bottom-app-navigation z-10 border-t bg-background pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Button type="submit" disabled={disabled} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'sending' : 'send')}</Button>
    </div>
  </form>;
}
