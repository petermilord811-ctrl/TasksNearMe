'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, ShieldCheck } from 'lucide-react';
import { PROBLEM_REASONS, reportProblemInputSchema, routes, type ActionResult, type Photo, type ReportProblemInput } from '@/contracts';
import { EvidencePhotoPicker } from '@/ui/components/bookings/evidence-photo-picker';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import type { ReportProblemScreenProps } from './report-problem-screen';

export function ReportProblemForm({ data, handlers, initialResult, initialPending = false }: Omit<ReportProblemScreenProps, 'now'> & {
  initialResult?: ActionResult;
  initialPending?: boolean;
}) {
  const t = useTranslations('reportProblem');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const router = useRouter();
  const id = useId();
  const form = useForm<ReportProblemInput>({
    resolver: zodResolver(reportProblemInputSchema),
    defaultValues: { description: '', photoIds: [] },
    shouldFocusError: false,
  });
  const description = useWatch({ control: form.control, name: 'description' });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(initialPending);
  const [result, setResult] = useState<ActionResult | undefined>(initialResult);
  const [confirmation, setConfirmation] = useState<ReportProblemInput>();
  const locked = useRef(initialPending);
  const photoInput = useRef<HTMLInputElement>(null);
  const reasonInput = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const submitBar = useRef<HTMLDivElement>(null);
  const disabled = pending || uploading || Boolean(result?.ok);
  const { setError, setFocus } = form;

  useEffect(() => {
    if (!result || pending) return;
    let first: keyof ReportProblemInput | undefined;
    for (const field of ['reason', 'description', 'photoIds'] as const) {
      const code = !result.ok ? result.fieldErrors?.[field]?.[0] : undefined;
      if (code) { setError(field, { type: 'server', message: code }); first ??= field; }
    }
    const timer = setTimeout(() => {
      if (first === 'reason') reasonInput.current?.focus();
      else if (first === 'photoIds') photoInput.current?.focus();
      else if (first) setFocus(first);
      else feedback.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [result, pending, setError, setFocus]);

  function focusInvalid(errors: FieldErrors<ReportProblemInput>) {
    if (errors.reason) reasonInput.current?.focus();
    else if (errors.description) form.setFocus('description');
    else if (errors.photoIds) photoInput.current?.focus();
  }

  async function submit(input: ReportProblemInput) {
    if (locked.current || uploading) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    form.clearErrors();
    let next: ActionResult;
    try { next = await handlers.onSubmit(input); }
    catch { next = { ok: false, code: 'unknown' }; }
    setPending(false);
    setConfirmation(undefined);
    setResult(next);
    locked.current = next.ok;
    if (next.ok && next.redirectTo) router.push(next.redirectTo);
  }

  const errorText = (code: string) => fieldCopy(fieldCopy.has(code) ? code : 'invalid');
  const specificError = result && !result.ok && (result.code === 'expired' || result.code === 'not_allowed') ? result.code : undefined;
  const genericFeedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;

  return <>
    <form noValidate aria-label={t('title')} aria-busy={pending || uploading} className="space-y-6" onFocusCapture={(event) => {
      const bar = submitBar.current;
      if (bar && !bar.contains(event.target) && event.target.getBoundingClientRect().bottom > bar.getBoundingClientRect().top) event.target.scrollIntoView({ block: 'center', behavior: 'instant' });
    }} onSubmit={(event) => {
      if (disabled || locked.current || confirmation) { event.preventDefault(); return; }
      void form.handleSubmit((input) => { setResult(undefined); setConfirmation(input); }, focusInvalid)(event);
    }}>
      <fieldset disabled={disabled} className="min-w-0 space-y-6 rounded-xl border bg-card p-4 shadow-card sm:p-6">
        <legend className="sr-only">{t('title')}</legend>
        <Controller control={form.control} name="reason" render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid} className="gap-2">
          <p id={`${id}-reason-label`} className="font-medium">{t('reason')}</p>
          <FieldDescription id={`${id}-reason-hint`}>{t('reasonHint')}</FieldDescription>
          <RadioGroup name={field.name} value={field.value ?? ''} onValueChange={field.onChange} onBlur={field.onBlur} disabled={disabled} aria-labelledby={`${id}-reason-label`} aria-describedby={`${id}-reason-hint${fieldState.error ? ` ${id}-reason-error` : ''}`} aria-invalid={fieldState.invalid} aria-required="true" className="gap-1">
            {PROBLEM_REASONS.map((reason, index) => <div key={reason} className="flex min-h-11 items-center gap-2">
              <RadioGroupItem id={`${id}-${reason}`} value={reason} ref={index === 0 ? (node) => { reasonInput.current = node; field.ref(node); } : undefined} className="size-11 shrink-0" />
              <label htmlFor={`${id}-${reason}`} className="flex min-h-11 flex-1 cursor-pointer items-center text-sm">{t(`reasons.${reason}`)}</label>
            </div>)}
          </RadioGroup>
          {fieldState.error?.message && <FieldError id={`${id}-reason-error`}>{errorText(fieldState.error.message)}</FieldError>}
        </Field>} />
        <Field data-invalid={!!form.formState.errors.description} className="gap-2">
          <FieldLabel htmlFor={`${id}-description`}>{t('description')}</FieldLabel>
          <Textarea {...form.register('description')} id={`${id}-description`} rows={5} aria-required="true" aria-invalid={!!form.formState.errors.description} aria-describedby={`${id}-description-hint ${id}-description-count${form.formState.errors.description ? ` ${id}-description-error` : ''}`} className="min-h-36" />
          <FieldDescription id={`${id}-description-hint`}>{t('descriptionHint')}</FieldDescription>
          <p id={`${id}-description-count`} className="text-sm tabular-nums text-muted-foreground">{t('descriptionCount', { count: description?.length ?? 0, max: 2000 })}</p>
          {form.formState.errors.description?.message && <FieldError id={`${id}-description-error`}>{errorText(form.formState.errors.description.message)}</FieldError>}
        </Field>
        <EvidencePhotoPicker id={`${id}-photos`} label={t('photos')} hint={t('photosHint', { megabytes: data.maxPhotoMegabytes })} photos={photos} onChange={(next) => {
          setPhotos(next);
          form.setValue('photoIds', next.map((photo) => photo.id), { shouldDirty: true, shouldValidate: true });
        }} onUploadPhoto={handlers.onUploadPhoto} maxPhotos={6} maxPhotoMegabytes={data.maxPhotoMegabytes} disabled={disabled} onBusyChange={setUploading} inputRef={photoInput} error={form.formState.errors.photoIds?.message ? errorText(form.formState.errors.photoIds.message) : undefined} />
      </fieldset>
      <p className="flex items-start gap-2 rounded-lg bg-secondary p-4 text-sm text-secondary-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />{t('supportNote')}</p>
      <div ref={feedback} tabIndex={-1} className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {specificError ? <div aria-live="polite" aria-atomic="true"><Alert role="status" className="border-destructive/30"><CircleAlert aria-hidden="true" className="text-destructive" /><AlertDescription className="space-y-3 text-foreground">
          <p>{t(`errors.${specificError}`)}</p>
          {specificError === 'expired' ? <Link href={routes.help()} className="inline-flex min-h-11 items-center rounded-md text-primary underline underline-offset-4">{t('getHelp')}</Link> : <Button type="button" variant="outline" disabled={disabled} onClick={() => router.refresh()}>{t('reload')}</Button>}
        </AlertDescription></Alert></div> : <FormFeedback result={genericFeedback} successMessage={t('success')} />}
      </div>
      <div ref={submitBar} className="sticky bottom-0 z-10 border-t bg-background pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button ref={submitButton} type="submit" disabled={disabled} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'submitting' : 'submit')}</Button>
      </div>
    </form>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open && !pending) setConfirmation(undefined); }}>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); if (!result) submitButton.current?.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('confirmDescription')}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction disabled={pending} aria-busy={pending} onClick={(event) => { event.preventDefault(); if (confirmation) void submit(confirmation); }}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'submitting' : 'confirmSubmit')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
