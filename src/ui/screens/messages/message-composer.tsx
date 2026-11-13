'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Lock, Paperclip, Send } from 'lucide-react';
import { sendMessageInputSchema, type ActionResult, type ComposerRules, type Photo, type SendMessageInput, type ThreadHandlers } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { EvidencePhotoPicker } from '@/ui/components/bookings/evidence-photo-picker';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export interface MessageComposerProps {
  rules: ComposerRules;
  handlers: ThreadHandlers;
}

export function MessageComposer({ rules, handlers }: MessageComposerProps) {
  return <MessageComposerContent rules={rules} handlers={handlers} />;
}

/** Seeds let previews show asynchronous states without starting a request on mount. */
export function MessageComposerContent({ rules, handlers, initialResult, initialPending = false, initialBody = '' }: MessageComposerProps & {
  initialResult?: ActionResult;
  initialPending?: boolean;
  initialBody?: string;
}) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('thread.composer');
  const fields = useTranslations('forms.fieldErrors');
  const id = useId();
  const router = useRouter();
  const form = useForm<SendMessageInput>({
    resolver: zodResolver(sendMessageInputSchema),
    defaultValues: { body: initialBody, attachmentIds: [] },
  });
  const body = useWatch({ control: form.control, name: 'body' }) ?? '';
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [result, setResult] = useState<ActionResult | undefined>(initialResult);
  const [pending, setPending] = useState(initialPending);
  const [uploading, setUploading] = useState(false);
  const locked = useRef(initialPending);
  const uploadLocked = useRef(false);
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoDetails = useRef<HTMLDetailsElement>(null);
  const { setError, setFocus } = form;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (pending || !result || result.ok) return;
    const bodyError = result.fieldErrors?.body?.[0]
      ?? (result.code === 'validation_failed' && !Object.keys(result.fieldErrors ?? {}).length ? 'required' : undefined);
    const photoError = result.fieldErrors?.attachmentIds?.[0]
      ?? Object.entries(result.fieldErrors ?? {}).find(([name]) => name.startsWith('attachmentIds.'))?.[1]?.[0];
    if (bodyError) setError('body', { type: 'server', message: bodyError });
    if (photoError) {
      setError('attachmentIds', { type: 'server', message: photoError });
      if (photoDetails.current) photoDetails.current.open = true;
    }
    if (bodyError || photoError) {
      const timer = setTimeout(() => { if (bodyError) setFocus('body'); else fileInput.current?.focus(); }, 0);
      return () => clearTimeout(timer);
    }
  }, [pending, result, setError, setFocus]);

  const overLimit = body.length > rules.maxLength;
  const empty = body.trim().length === 0 && photos.length === 0;
  const bodyCode = form.formState.errors.body?.message;
  const bodyError = overLimit ? t('tooLong', { maximum: rules.maxLength })
    : bodyCode === 'required' ? t('empty')
      : bodyCode && fields.has(bodyCode) ? fields(bodyCode) : undefined;
  const photoError = form.formState.errors.attachmentIds ? t('invalidAttachments', { maximum: rules.maxAttachments }) : undefined;

  async function submit(input: SendMessageInput) {
    if (!rules.canSend || locked.current || uploadLocked.current) return;
    if (body.length > rules.maxLength) { setError('body', { type: 'maxLength', message: 'too_long' }); setFocus('body'); return; }
    if (input.attachmentIds.length > rules.maxAttachments) { setError('attachmentIds', { type: 'maxLength', message: 'too_long' }); fileInput.current?.focus(); return; }
    locked.current = true; setPending(true); setResult(undefined);
    let next: ActionResult;
    try { next = await handlers.onSend(input); }
    catch { next = { ok: false, code: 'unknown' }; }
    if (!mounted.current) return;
    locked.current = false; setPending(false); setResult(next);
    if (next.ok) {
      if (next.code === 'sent') { form.reset({ body: '', attachmentIds: [] }); setPhotos([]); router.refresh(); }
      if (next.redirectTo) router.push(next.redirectTo);
    }
  }

  if (!rules.canSend) return <p role="status" className="flex items-center justify-center gap-2 rounded-xl border bg-muted px-4 py-5 text-sm text-muted-foreground"><Lock aria-hidden="true" className="size-4 shrink-0" />{t(rules.disabledReason ?? 'closed')}</p>;

  const specialError = result && !result.ok && (result.code === 'not_allowed' || result.code === 'rate_limited');
  const feedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  return <form noValidate aria-label={t('label')} aria-busy={pending || uploading} onSubmit={(event) => {
    if (locked.current || uploadLocked.current) { event.preventDefault(); return; }
    void form.handleSubmit(submit)(event);
  }} className="space-y-2.5 border-t border-foreground/[0.07] bg-card px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-4 sm:pb-4 dark:border-white/[0.06]">
    <Field className="gap-1.5" data-invalid={!!bodyError}>
      {/* The panel above already says what this is: the label is for screen readers. */}
      <FieldLabel htmlFor={`${id}-body`} className="sr-only">{t('label')}</FieldLabel>
      <Textarea {...form.register('body')} id={`${id}-body`} rows={1} maxLength={rules.maxLength} disabled={pending} aria-invalid={!!bodyError} aria-describedby={`${id}-hint ${id}-counter ${id}-body-error`} placeholder={t('label')} className="max-h-40 min-h-12 resize-none field-sizing-content" onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || !window.matchMedia('(min-width: 1024px)').matches) return;
        event.preventDefault();
        if (!empty && !overLimit && !locked.current && !uploadLocked.current) void form.handleSubmit(submit)();
      }} />
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 px-1">
        <FieldDescription id={`${id}-hint`} className="text-xs">{t('hint')}</FieldDescription>
        <p id={`${id}-counter`} className="text-xs text-muted-foreground tabular-nums">{t('counter', { count: body.length, maximum: rules.maxLength })}</p>
      </div>
      <div id={`${id}-body-error`} aria-live="polite">{bodyError && <FieldError>{bodyError}</FieldError>}</div>
    </Field>
    {rules.maxAttachments > 0 && <details ref={photoDetails} className="group">
      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-md px-2 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Paperclip aria-hidden="true" className="size-4" />{t('attach')}</summary>
      <div className="pt-2"><EvidencePhotoPicker id={`${id}-photos`} label={t('photos')} hint={t('photosHint', { maximum: rules.maxAttachments, megabytes: rules.maxPhotoMegabytes })} photos={photos} onChange={(next) => { setPhotos(next); form.setValue('attachmentIds', next.map((photo) => photo.id)); form.clearErrors('attachmentIds'); }} onUploadPhoto={handlers.onUploadPhoto} maxPhotos={rules.maxAttachments} maxPhotoMegabytes={rules.maxPhotoMegabytes} disabled={pending} error={photoError} onBusyChange={(busy) => { uploadLocked.current = busy; setUploading(busy); }} inputRef={fileInput} /></div>
    </details>}
    {specialError ? <div aria-live="polite" aria-atomic="true"><Alert role="status" className="border-destructive/30"><CircleAlert aria-hidden="true" className="text-destructive" /><AlertDescription className="text-foreground">
      <p>{t(result.code === 'not_allowed' ? 'notAllowed' : 'rateLimited')}</p>
      {result.code === 'rate_limited' && result.retryAt && <p className="tabular-nums">{t('retryAt', { at: formatDateTime(result.retryAt) })}</p>}
      {result.code === 'not_allowed' && <Button type="button" variant="outline" className="mt-2" onClick={() => router.refresh()}>{t('reload')}</Button>}
    </AlertDescription></Alert></div> : <FormFeedback result={feedback} successMessage={result?.ok && result.code === 'sent' ? t('sent') : undefined} />}
    <div className="flex items-center justify-end gap-3">
      <p className="hidden text-xs text-muted-foreground lg:block">{t('keyboardHint')}</p>
      <Button type="submit" disabled={pending || uploading || empty || overLimit} aria-busy={pending} className="min-w-24 transition-[transform,box-shadow,background-color,opacity] duration-200">{pending ? <Spinner aria-hidden="true" /> : <Send aria-hidden="true" className="size-4" />}{t(pending ? 'sending' : 'send')}</Button>
    </div>
  </form>;
}
