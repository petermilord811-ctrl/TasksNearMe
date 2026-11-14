'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SUPPORT_TOPICS, newSupportRequestInputSchema, type ActionResult, type NewSupportRequestInput, type Photo } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { EvidencePhotoPicker } from '@/ui/components/bookings/evidence-photo-picker';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import type { SupportScreenProps } from './support-screen';

export function NewSupportRequestForm({ data, handlers, initialResult, initialPending = false }: Omit<SupportScreenProps, 'now'> & {
  initialResult?: ActionResult;
  initialPending?: boolean;
}) {
  const { formatDate } = useFormat();
  const t = useTranslations('support');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const form = useForm<NewSupportRequestInput>({ resolver: zodResolver(newSupportRequestInputSchema), defaultValues: { description: '', photoIds: [] }, shouldFocusError: false });
  const description = useWatch({ control: form.control, name: 'description' });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(initialPending);
  const [result, setResult] = useState<ActionResult | undefined>(initialResult);
  const locked = useRef(initialPending);
  const topicInput = useRef<HTMLButtonElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const disabled = pending || uploading || Boolean(result?.ok);
  const { setError, setFocus } = form;

  useEffect(() => {
    if (!result || pending) return;
    let first: keyof NewSupportRequestInput | undefined;
    for (const field of ['topic', 'bookingId', 'description', 'photoIds'] as const) {
      const code = !result.ok ? result.fieldErrors?.[field]?.[0] : undefined;
      if (code) { setError(field, { type: 'server', message: code }); first ??= field; }
    }
    const timer = setTimeout(() => {
      if (first === 'topic') topicInput.current?.focus();
      else if (first === 'photoIds') photoInput.current?.focus();
      else if (first) setFocus(first);
      else feedback.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [result, pending, setError, setFocus]);

  function focusInvalid(errors: FieldErrors<NewSupportRequestInput>) {
    if (errors.topic) topicInput.current?.focus();
    else if (errors.bookingId) form.setFocus('bookingId');
    else if (errors.description) form.setFocus('description');
    else if (errors.photoIds) photoInput.current?.focus();
  }

  async function submit(input: NewSupportRequestInput) {
    if (locked.current || uploading) return;
    locked.current = true;
    setPending(true); setResult(undefined); form.clearErrors();
    let next: ActionResult;
    try { next = await handlers.onCreate(input); } catch { next = { ok: false, code: 'unknown' }; }
    setPending(false); setResult(next); locked.current = next.ok;
    if (next.ok && next.redirectTo) router.push(next.redirectTo);
  }

  const errorText = (code: string) => fieldCopy(fieldCopy.has(code) ? code : 'invalid');
  const errors = form.formState.errors;
  const genericFeedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;

  return <form noValidate aria-label={t('newRequest')} aria-busy={pending || uploading} className="space-y-4" onFocusCapture={(event) => {
    const bottomOffset = Number.parseFloat(window.getComputedStyle(event.currentTarget).getPropertyValue('--app-bottom-offset')) || 0;
    if (bottomOffset > 0 && event.target.getBoundingClientRect().bottom > window.innerHeight - bottomOffset) {
      event.target.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }} onSubmit={(event) => {
    if (disabled || locked.current) { event.preventDefault(); return; }
    void form.handleSubmit(submit, focusInvalid)(event);
  }}>
    <fieldset disabled={disabled} className="min-w-0 space-y-6 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card sm:p-6">
      <legend className="sr-only">{t('newRequest')}</legend>
      <Controller control={form.control} name="topic" render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid} className="gap-2">
        <p id={`${id}-topic-label`} className="font-medium">{t('topic')}</p>
        <FieldDescription id={`${id}-topic-hint`}>{t('topicHint')}</FieldDescription>
        <RadioGroup name={field.name} value={field.value ?? ''} onValueChange={field.onChange} onBlur={field.onBlur} disabled={disabled} aria-labelledby={`${id}-topic-label`} aria-describedby={`${id}-topic-hint${fieldState.error ? ` ${id}-topic-error` : ''}`} aria-invalid={fieldState.invalid} aria-required="true" className="gap-2 sm:grid-cols-2">
          {/* The row is the target (as in the booking sheets): a bordered choice with a normal-sized radio, not a 44 px circle. */}
          {SUPPORT_TOPICS.map((topic, index) => <label key={topic} htmlFor={`${id}-topic-${topic}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-foreground/[0.09] px-3.5 py-2 transition-[border-color,background-color] duration-200 ease-[var(--ease-out)] hover:not-has-[[data-state=checked]]:not-has-disabled:border-foreground/20 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring has-disabled:cursor-not-allowed has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/[0.045]">
            <RadioGroupItem id={`${id}-topic-${topic}`} value={topic} ref={index === 0 ? (node) => { topicInput.current = node; field.ref(node); } : undefined} className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 text-sm">{t(`topics.${topic}`)}</span>
          </label>)}
        </RadioGroup>
        {fieldState.error?.message && <FieldError id={`${id}-topic-error`}>{errorText(fieldState.error.message)}</FieldError>}
      </Field>} />
      <Field data-invalid={!!errors.bookingId} className="gap-2">
        <FieldLabel htmlFor={`${id}-booking`}>{t('booking')}</FieldLabel>
        <select {...form.register('bookingId', { setValueAs: (value: string) => value || undefined })} id={`${id}-booking`} defaultValue="" aria-invalid={!!errors.bookingId} aria-describedby={`${id}-booking-hint${errors.bookingId ? ` ${id}-booking-error` : ''}`} className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base disabled:opacity-50">
          <option value="">{t('noBooking')}</option>
          {data.bookings.map((booking) => <option key={booking.id} value={booking.id}>{t('bookingOption', { title: booking.title, date: formatDate(booking.start) })}</option>)}
        </select>
        <FieldDescription id={`${id}-booking-hint`}>{t('bookingHint')}</FieldDescription>
        {errors.bookingId?.message && <FieldError id={`${id}-booking-error`}>{errorText(errors.bookingId.message)}</FieldError>}
      </Field>
      <Field data-invalid={!!errors.description} className="gap-2">
        <FieldLabel htmlFor={`${id}-description`}>{t('description')}</FieldLabel>
        <Textarea {...form.register('description')} id={`${id}-description`} rows={5} aria-required="true" aria-invalid={!!errors.description} aria-describedby={`${id}-description-hint ${id}-description-count${errors.description ? ` ${id}-description-error` : ''}`} className="min-h-36" />
        <FieldDescription id={`${id}-description-hint`}>{t('descriptionHint')}</FieldDescription>
        <p id={`${id}-description-count`} className="text-sm tabular-nums text-muted-foreground">{t('descriptionCount', { count: description?.length ?? 0, max: 2000 })}</p>
        {errors.description?.message && <FieldError id={`${id}-description-error`}>{errorText(errors.description.message)}</FieldError>}
      </Field>
      <EvidencePhotoPicker id={`${id}-photos`} label={t('photos')} hint={t('photosHint', { megabytes: data.maxPhotoMegabytes })} photos={photos} onChange={(next) => {
        setPhotos(next); form.setValue('photoIds', next.map((photo) => photo.id), { shouldDirty: true, shouldValidate: true });
      }} onUploadPhoto={handlers.onUploadPhoto} maxPhotos={4} maxPhotoMegabytes={data.maxPhotoMegabytes} disabled={disabled} onBusyChange={setUploading} inputRef={photoInput} error={errors.photoIds?.message ? errorText(errors.photoIds.message) : undefined} />
    </fieldset>
    <div ref={feedback} tabIndex={-1} className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><FormFeedback result={genericFeedback} successMessage={t('success')} /></div>
    <Button type="submit" disabled={disabled} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'submitting' : 'submit')}</Button>
  </form>;
}
