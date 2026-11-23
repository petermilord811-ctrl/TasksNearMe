'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Lock, MessageSquareText, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { sendMessageInputSchema, type ActionResult, type ComposerRules, type MessageSavedReply, type Photo, type SendMessageInput, type ThreadHandlers } from '@/contracts';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { useReply } from './reply-context';
import { useFormat } from '@/ui/lib/format';
import { EvidencePhotoPicker } from '@/ui/components/bookings/evidence-photo-picker';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { newRequestKey } from '@/ui/lib/request-key';
import { cn } from '@/ui/lib/utils';

export interface MessageComposerProps {
  rules: ComposerRules;
  handlers: ThreadHandlers;
  /** The viewer's saved replies, and what fills `{first_name}` and `{task}` in them (completion plan 7.3). */
  savedReplies?: MessageSavedReply[];
  template?: { firstName: string; task: string };
  /** What reads the conversation again after a message is sent (the chat window's own load); the page refreshes without it. */
  onRefresh?: () => void;
  /** The chat window's tighter composer: no hint line under the box. */
  compact?: boolean;
  /**
   * The other person's latest message, when they wrote last (2026-11-23): "Suggest replies" answers it (with
   * `handlers.onSuggest`). New suggestions for each new message.
   */
  suggestFor?: string;
}

export function MessageComposer({ rules, handlers }: MessageComposerProps) {
  return <MessageComposerContent rules={rules} handlers={handlers} />;
}

/** Seeds let previews show asynchronous states without starting a request on mount. */
export function MessageComposerContent({ rules, handlers, savedReplies = [], template, onRefresh, compact = false, suggestFor, initialResult, initialPending = false, initialBody = '', initialSuggestions }: MessageComposerProps & {
  initialResult?: ActionResult;
  initialPending?: boolean;
  initialBody?: string;
  /** Seeds for the preview gallery: the suggestions shown. */
  initialSuggestions?: string[];
}) {
  const { formatDateTime, zoneName } = useFormat();
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
  const lastTyping = useRef(0);
  const locked = useRef(initialPending);
  const requestKey = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const uploadLocked = useRef(false);
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoDetails = useRef<HTMLDetailsElement>(null);
  const { setError, setFocus } = form;
  const { replyTo, setReplyTo } = useReply();
  const [repliesOpen, setRepliesOpen] = useState(false);
  // Suggested replies (2026-11-23): for one message of theirs; a newer one starts over.
  const [suggestions, setSuggestions] = useState<{ for?: string; status: 'loading' | 'error' | 'ready'; replies: string[] } | null>(initialSuggestions ? { for: suggestFor, status: 'ready', replies: initialSuggestions } : null);
  const shownSuggestions = suggestions && suggestions.for === suggestFor ? suggestions : null;
  async function suggest() {
    if (!handlers.onSuggest || shownSuggestions?.status === 'loading') return;
    const asked = suggestFor;
    setSuggestions({ for: asked, status: 'loading', replies: [] });
    let answer: Awaited<ReturnType<NonNullable<ThreadHandlers['onSuggest']>>> = null;
    try { answer = await handlers.onSuggest(); } catch { answer = null; }
    if (!mounted.current) return;
    setSuggestions(answer && answer.replies.length > 0 ? { for: asked, status: 'ready', replies: answer.replies } : { for: asked, status: 'error', replies: [] });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const fill = (text: string) => text.replaceAll('{first_name}', template?.firstName ?? '').replaceAll('{task}', template?.task ?? '');

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
    // Writing goes on after a message: focus (and a phone's keyboard) stays in the message box (journeys on a phone, J-C4).
    const keepFocus = formRef.current?.contains(document.activeElement) ?? false;
    locked.current = true; setPending(true); setResult(undefined);
    // This message's key (bad connections pass, J-N1): a retry after an answer that never arrived sends the same key, so
    // the message goes once. A new key after it's sent.
    requestKey.current ??= newRequestKey();
    const keyed = { ...input, requestKey: requestKey.current };
    let next: ActionResult;
    try { next = await handlers.onSend(replyTo ? { ...keyed, replyToId: replyTo.id } : keyed); }
    catch { next = { ok: false, code: 'unknown' }; }
    if (!mounted.current) return;
    locked.current = false; setPending(false); setResult(next);
    if (next.ok) {
      if (next.code === 'sent') { requestKey.current = null; form.reset({ body: '', attachmentIds: [] }); setPhotos([]); setReplyTo(null); if (onRefresh) onRefresh(); else router.refresh(); }
      if (next.redirectTo) router.push(next.redirectTo);
      // By id: reset() has just let go of the field's ref, so setFocus would find nothing.
      else if (keepFocus) document.getElementById(`${id}-body`)?.focus();
    } else if (keepFocus && !next.fieldErrors) document.getElementById(`${id}-body`)?.focus();
  }

  if (!rules.canSend) return <p role="status" className="flex items-center justify-center gap-2 rounded-xl border bg-muted px-4 py-5 text-sm text-muted-foreground"><Lock aria-hidden="true" className="size-4 shrink-0" />{t(rules.disabledReason ?? 'closed')}</p>;

  const specialError = result && !result.ok && (result.code === 'not_allowed' || result.code === 'rate_limited');
  const feedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  return <form ref={formRef} noValidate aria-label={t('label')} aria-busy={pending || uploading} onSubmit={(event) => {
    if (locked.current || uploadLocked.current) { event.preventDefault(); return; }
    void form.handleSubmit(submit)(event);
  }} className={cn('space-y-2.5 border-t border-foreground/[0.07] bg-card px-3 pt-3 dark:border-white/[0.06]', compact ? 'pb-3' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-4 sm:pb-4')}>
    {replyTo && <div className="flex items-start justify-between gap-2 rounded-xl bg-foreground/[0.04] px-3 py-2 text-[13px] dark:bg-white/[0.05]">
      <p className="min-w-0"><span className="font-semibold">{t('replyingTo', { name: replyTo.name })}</span> <span className="line-clamp-1 text-muted-foreground [overflow-wrap:anywhere]">{replyTo.text}</span></p>
      <button type="button" onClick={() => setReplyTo(null)} aria-label={t('cancelReply')} className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X aria-hidden="true" className="size-4" /></button>
    </div>}
    {/* Suggested replies (2026-11-23): a tap puts one in the box, to change or send; nothing goes by itself. */}
    {shownSuggestions && <div role="group" aria-label={t('suggest.label')} aria-busy={shownSuggestions.status === 'loading'} className="flex flex-wrap items-center gap-1.5">
      {shownSuggestions.status === 'loading' && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner aria-hidden="true" className="size-3.5" />{t('suggest.loading')}</p>}
      {shownSuggestions.status === 'error' && <p role="status" className="text-xs text-muted-foreground">{t('suggest.failed')}</p>}
      {shownSuggestions.replies.map((reply) => <button key={reply} type="button" onClick={() => { form.setValue('body', reply, { shouldDirty: true }); setSuggestions(null); setFocus('body'); }} className="max-w-full rounded-full border border-primary/30 bg-brand-soft/50 px-3 py-1.5 text-left text-[13px] leading-5 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-ring [overflow-wrap:anywhere]">{reply}</button>)}
      {shownSuggestions.status !== 'loading' && <button type="button" onClick={() => setSuggestions(null)} aria-label={t('suggest.dismiss')} className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X aria-hidden="true" className="size-3.5" /></button>}
    </div>}
    <Field className="gap-1.5" data-invalid={!!bodyError}>
      {/* The panel above already says what this is: the label is for screen readers. */}
      <FieldLabel htmlFor={`${id}-body`} className="sr-only">{t('label')}</FieldLabel>
      {/* Send sits beside the message, as in any chat (on phones as an icon, still named "Send"). */}
      <div className="flex items-end gap-2">
      <Textarea {...form.register('body')} id={`${id}-body`} rows={1} maxLength={rules.maxLength} readOnly={pending} aria-invalid={!!bodyError} aria-describedby={`${id}-hint ${id}-counter ${id}-body-error`} placeholder={t('label')} className="max-h-40 min-h-12 flex-1 resize-none field-sizing-content" onInput={() => {
        // "Typing…" for the other person (completion plan 7.1), at most one ping every 2.5 s; never blocks typing.
        if (!handlers.onTyping || Date.now() - lastTyping.current < 2500) return;
        lastTyping.current = Date.now();
        void handlers.onTyping().catch(() => {});
      }} onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || !window.matchMedia('(min-width: 1024px)').matches) return;
        event.preventDefault();
        if (!empty && !overLimit && !locked.current && !uploadLocked.current) void form.handleSubmit(submit)();
      }} />
        {/* A tap on Send leaves focus in the message, so a phone's keyboard stays open for the next one. */}
        <Button type="submit" disabled={pending || uploading || empty || overLimit} aria-busy={pending} onMouseDown={(event) => event.preventDefault()} className="h-12 shrink-0 transition-[transform,box-shadow,background-color,opacity] duration-200 max-sm:w-12 max-sm:px-0 sm:min-w-24">{pending ? <Spinner aria-hidden="true" /> : <Send aria-hidden="true" className="size-4" />}<span className="max-sm:sr-only">{t(pending ? 'sending' : 'send')}</span></Button>
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 px-1">
        <FieldDescription id={`${id}-hint`} className={cn('text-xs', compact && 'sr-only')}>{t('hint')}</FieldDescription>
        <p className="flex gap-3 text-xs text-muted-foreground"><span className="hidden lg:inline">{t('keyboardHint')}</span><span id={`${id}-counter`} className="tabular-nums">{t('counter', { count: body.length, maximum: rules.maxLength })}</span></p>
      </div>
      <div id={`${id}-body-error`}>{bodyError && <FieldError>{bodyError}</FieldError>}</div>
    </Field>
    <div className="flex flex-wrap items-start gap-x-2">
    {handlers.onSuggest && suggestFor && !shownSuggestions && <button type="button" onClick={() => void suggest()} className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Sparkles aria-hidden="true" className="size-4" />{t('suggest.button')}</button>}
    {(handlers.onSaveReply || savedReplies.length > 0) && <Popover open={repliesOpen} onOpenChange={setRepliesOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><MessageSquareText aria-hidden="true" className="size-4" />{t('savedReplies.button')}</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-3">
        {savedReplies.length === 0
          ? <p className="text-sm text-muted-foreground">{t('savedReplies.empty')}</p>
          : <ul className="max-h-60 space-y-1 overflow-y-auto">{savedReplies.map((reply) => <li key={reply.id} className="flex items-start gap-1">
              <button type="button" onClick={() => { form.setValue('body', fill(reply.body), { shouldDirty: true }); setRepliesOpen(false); setFocus('body'); }} className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <span className="block truncate text-sm font-semibold">{reply.title}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{fill(reply.body)}</span>
              </button>
              {handlers.onDeleteReply && <button type="button" aria-label={t('savedReplies.delete', { title: reply.title })} onClick={() => void handlers.onDeleteReply!({ id: reply.id }).catch(() => undefined)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"><X aria-hidden="true" className="size-4" /></button>}
            </li>)}</ul>}
        {handlers.onSaveReply && <button type="button" disabled={body.trim().length === 0} onClick={async () => {
          const result = await handlers.onSaveReply!({ title: body.trim().slice(0, 40), body: body.trim() }).catch(() => ({ ok: false as const, code: 'unknown' as const }));
          if (result.ok) toast.success(t('savedReplies.saved'));
          else toast.error(t(result.code === 'limit_reached' ? 'savedReplies.limit' : 'savedReplies.failed'));
        }} className="w-full rounded-lg border border-dashed border-foreground/20 px-2 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">{t('savedReplies.save')}</button>}
        <p className="text-xs text-muted-foreground">{t('savedReplies.hint')}</p>
      </PopoverContent>
    </Popover>}
    {rules.maxAttachments > 0 && <details ref={photoDetails} className="group">
      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-md px-2 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Paperclip aria-hidden="true" className="size-4" />{t('attach')}</summary>
      <div className="pt-2"><EvidencePhotoPicker id={`${id}-photos`} label={t('photos')} hint={t('photosHint', { maximum: rules.maxAttachments, megabytes: rules.maxPhotoMegabytes })} photos={photos} onChange={(next) => { setPhotos(next); form.setValue('attachmentIds', next.map((photo) => photo.id)); form.clearErrors('attachmentIds'); }} onUploadPhoto={handlers.onUploadPhoto} maxPhotos={rules.maxAttachments} maxPhotoMegabytes={rules.maxPhotoMegabytes} disabled={pending} error={photoError} onBusyChange={(busy) => { uploadLocked.current = busy; setUploading(busy); }} inputRef={fileInput} /></div>
    </details>}
    </div>
    {specialError ? <div aria-live="polite" aria-atomic="true"><Alert role="status" className="border-destructive/30"><CircleAlert aria-hidden="true" className="text-destructive" /><AlertDescription className="text-foreground">
      <p>{t(result.code === 'not_allowed' ? 'notAllowed' : 'rateLimited')}</p>
      {result.code === 'rate_limited' && result.retryAt && <p className="tabular-nums">{t('retryAt', { at: formatDateTime(result.retryAt), zone: zoneName })}</p>}
      {result.code === 'not_allowed' && <Button type="button" variant="outline" className="mt-2" onClick={() => (onRefresh ? onRefresh() : router.refresh())}>{t('reload')}</Button>}
    </AlertDescription></Alert></div> : <FormFeedback result={feedback} successMessage={result?.ok && result.code === 'sent' ? t('sent') : undefined} />}
  </form>;
}
