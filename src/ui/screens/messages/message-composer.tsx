'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Lock, MessageSquareText, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { sendMessageInputSchema, type ActionResult, type ComposerRules, type GifResult, type MessageSavedReply, type Photo, type PhotoUploadResult, type SendMessageInput, type ThreadHandlers } from '@/contracts';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { useReply } from './reply-context';
import { useFormat } from '@/ui/lib/format';
import { ComposerPhotoStrip, PHOTO_TYPES, PhotoDropOverlay, useComposerPhotos, usePhotoDrop } from './composer-photos';
import { GifPicker, gifFailureKey } from './gif-picker';
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
  /** A direct conversation's "+" (Request a task, Ask for an offer…: 2026-11-23), before the paperclip. */
  actionsMenu?: ReactNode;
}

export function MessageComposer({ rules, handlers }: MessageComposerProps) {
  return <MessageComposerContent rules={rules} handlers={handlers} />;
}

/** Seeds let previews show asynchronous states without starting a request on mount. */
export function MessageComposerContent({ rules, handlers, savedReplies = [], template, onRefresh, compact = false, suggestFor, actionsMenu, initialResult, initialPending = false, initialBody = '', initialSuggestions }: MessageComposerProps & {
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
  // A GIF that couldn't be attached (2026-11-24): why, under the box.
  const [gifError, setGifError] = useState<Extract<PhotoUploadResult, { ok: false }>['code']>();
  const lastTyping = useRef(0);
  const locked = useRef(initialPending);
  const requestKey = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const uploadLocked = useRef(false);
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  // The paperclip: where focus goes when the photos need another look (the file input itself is hidden).
  const attachButton = useRef<HTMLButtonElement>(null);

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
  // Photos (2026-11-23): picked, dropped on the conversation or pasted; Send waits while any still uploads.
  const attach = useComposerPhotos({
    max: rules.maxAttachments,
    megabytes: rules.maxPhotoMegabytes,
    onUpload: handlers.onUploadPhoto,
    disabled: pending || !rules.canSend,
    onChange: (next, busy) => {
      setPhotos(next);
      form.setValue('attachmentIds', next.map((photo) => photo.id));
      form.clearErrors('attachmentIds');
      uploadLocked.current = busy;
      setUploading(busy);
    },
  });
  const drop = usePhotoDrop(formRef, attach.add, rules.canSend && rules.maxAttachments > 0);
  const fill = (text: string) => text.replaceAll('{first_name}', template?.firstName ?? '').replaceAll('{task}', template?.task ?? '');

  useEffect(() => {
    if (pending || !result || result.ok) return;
    const bodyError = result.fieldErrors?.body?.[0]
      ?? (result.code === 'validation_failed' && !Object.keys(result.fieldErrors ?? {}).length ? 'required' : undefined);
    const photoError = result.fieldErrors?.attachmentIds?.[0]
      ?? Object.entries(result.fieldErrors ?? {}).find(([name]) => name.startsWith('attachmentIds.'))?.[1]?.[0];
    if (bodyError) setError('body', { type: 'server', message: bodyError });
    if (photoError) setError('attachmentIds', { type: 'server', message: photoError });
    if (bodyError || photoError) {
      const timer = setTimeout(() => { if (bodyError) setFocus('body'); else attachButton.current?.focus(); }, 0);
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
    if (input.attachmentIds.length > rules.maxAttachments) { setError('attachmentIds', { type: 'maxLength', message: 'too_long' }); attachButton.current?.focus(); return; }
    // Writing goes on after a message: focus (and a phone's keyboard) stays in the message box (journeys on a phone, J-C4).
    // Only while it's still here when the answer comes: a reaction picker or a menu opened meanwhile keeps it (2026-11-23).
    const keepFocus = formRef.current?.contains(document.activeElement) ?? false;
    const focusStillHere = () => {
      const active = document.activeElement;
      return !active || active === document.body || (formRef.current?.contains(active) ?? false);
    };
    locked.current = true; setPending(true); setResult(undefined); setGifError(undefined);
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
      if (next.code === 'sent') { requestKey.current = null; form.reset({ body: '', attachmentIds: [] }); setPhotos([]); attach.clear(); setReplyTo(null); if (onRefresh) onRefresh(); else router.refresh(); }
      if (next.redirectTo) router.push(next.redirectTo);
      // By id: reset() has just let go of the field's ref, so setFocus would find nothing.
      else if (keepFocus && focusStillHere()) document.getElementById(`${id}-body`)?.focus();
    } else if (keepFocus && !next.fieldErrors && focusStillHere()) document.getElementById(`${id}-body`)?.focus();
  }

  // GIFs (2026-11-24): a picked GIF goes at once as its own message, like any messenger's (with the reply, if one is
  // set); what's written in the box and the photos waiting stay as they are.
  async function sendGif(gif: GifResult) {
    if (!handlers.onAttachGif || !rules.canSend || locked.current) return;
    locked.current = true; setPending(true); setResult(undefined); setGifError(undefined);
    let attached: PhotoUploadResult;
    try { attached = await handlers.onAttachGif({ id: gif.id }); } catch { attached = { ok: false, code: 'unknown' }; }
    if (!mounted.current) return;
    if (!attached.ok) { locked.current = false; setPending(false); setGifError(attached.code); return; }
    let next: ActionResult;
    try { next = await handlers.onSend({ body: '', attachmentIds: [attached.photo.id], requestKey: newRequestKey(), ...(replyTo ? { replyToId: replyTo.id } : {}) }); }
    catch { next = { ok: false, code: 'unknown' }; }
    if (!mounted.current) return;
    locked.current = false; setPending(false); setResult(next);
    if (next.ok && next.code === 'sent') { setReplyTo(null); if (onRefresh) onRefresh(); else router.refresh(); }
  }

  if (!rules.canSend) return <p role="status" className="flex items-center justify-center gap-2 rounded-xl border bg-muted px-4 py-5 text-sm text-muted-foreground"><Lock aria-hidden="true" className="size-4 shrink-0" />{t(rules.disabledReason ?? 'closed')}</p>;

  const specialError = result && !result.ok && (result.code === 'not_allowed' || result.code === 'rate_limited');
  const feedback = result && !result.ok ? { ...result, fieldErrors: undefined } : result;
  return <form ref={formRef} noValidate aria-label={t('label')} aria-busy={pending || uploading} onSubmit={(event) => {
    if (locked.current || uploadLocked.current) { event.preventDefault(); return; }
    void form.handleSubmit(submit)(event);
  }} className={cn('relative border-t border-foreground/[0.07] bg-card dark:border-white/[0.06]', compact ? 'space-y-1.5 px-2.5 pt-2 pb-2' : 'space-y-2.5 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-4 sm:pb-4')}>
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
    {rules.maxAttachments > 0 && <ComposerPhotoStrip photos={attach} max={rules.maxAttachments} megabytes={rules.maxPhotoMegabytes} compact={compact} />}
    {photoError && <p id={`${id}-photos-error`} role="alert" className="text-xs text-destructive">{photoError}</p>}
    {gifError && <p role="alert" className="text-xs text-destructive">{t(gifFailureKey(gifError))}</p>}
    <PhotoDropOverlay target={drop.target} over={drop.over} />
    <Field className="gap-1.5" data-invalid={!!bodyError}>
      {/* The panel above already says what this is: the label is for screen readers. */}
      <FieldLabel htmlFor={`${id}-body`} className="sr-only">{t('label')}</FieldLabel>
      {/* Send sits beside the message, as in any chat (on phones as an icon, still named "Send"). */}
      <div className="flex items-end gap-1.5">
      {actionsMenu}
      {/* Photos straight from the picker (2026-11-23): no panel to open first. */}
      {rules.maxAttachments > 0 && <>
        <input ref={fileInput} type="file" accept={PHOTO_TYPES.join(',')} multiple={rules.maxAttachments > 1} hidden tabIndex={-1} onChange={(event) => { attach.add(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
        <button ref={attachButton} type="button" onClick={() => fileInput.current?.click()} disabled={pending || attach.photos.length + attach.pending.length >= rules.maxAttachments} aria-label={t('attach')} aria-describedby={photoError ? `${id}-photos-error ${id}-photos-hint` : `${id}-photos-hint`} title={t('photosHint', { maximum: rules.maxAttachments, megabytes: rules.maxPhotoMegabytes })} className={cn('grid shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40', compact ? 'size-10' : 'size-12')}>
          <Paperclip aria-hidden="true" className={compact ? 'size-[1.125rem]' : 'size-5'} />
        </button>
        <span id={`${id}-photos-hint`} className="sr-only">{t('photosHint', { maximum: rules.maxAttachments, megabytes: rules.maxPhotoMegabytes })}</span>
      </>}
      {/* GIFs beside the paperclip (2026-11-24): only where the app offers them. */}
      {rules.maxAttachments > 0 && handlers.onSearchGifs && handlers.onAttachGif && <GifPicker onSearch={handlers.onSearchGifs} onPick={(gif) => void sendGif(gif)} busy={pending} compact={compact} />}
      <Textarea {...form.register('body')} onPaste={(event) => {
        // A photo pasted into the message attaches it (2026-11-23); pasted words paste as usual.
        const pasted = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
        if (pasted.length === 0 || rules.maxAttachments === 0) return;
        event.preventDefault();
        attach.add(pasted);
      }} id={`${id}-body`} rows={1} maxLength={rules.maxLength} readOnly={pending} aria-invalid={!!bodyError} aria-describedby={`${id}-hint ${id}-counter ${id}-body-error`} placeholder={t('label')} className={cn('max-h-40 flex-1 resize-none field-sizing-content', compact ? 'min-h-10 py-2 text-[14px] leading-5' : 'min-h-12')} onInput={() => {
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
        <Button type="submit" disabled={pending || uploading || empty || overLimit} aria-busy={pending} onMouseDown={(event) => event.preventDefault()} className={cn('shrink-0 transition-[transform,box-shadow,background-color,opacity] duration-200', compact ? 'size-10 px-0' : 'h-12 max-sm:w-12 max-sm:px-0 sm:min-w-24')}>{pending ? <Spinner aria-hidden="true" /> : <Send aria-hidden="true" className="size-4" />}<span className={compact ? 'sr-only' : 'max-sm:sr-only'}>{t(pending ? 'sending' : 'send')}</span></Button>
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 px-1">
        <FieldDescription id={`${id}-hint`} className={cn('text-xs', compact && 'sr-only')}>{t('hint')}</FieldDescription>
        <p className="flex gap-3 text-xs text-muted-foreground"><span className={compact ? 'hidden' : 'hidden lg:inline'}>{t('keyboardHint')}</span><span id={`${id}-counter`} className={cn('tabular-nums', compact && body.length < rules.maxLength * 0.8 && 'sr-only')}>{t('counter', { count: body.length, maximum: rules.maxLength })}</span></p>
      </div>
      <div id={`${id}-body-error`}>{bodyError && <FieldError>{bodyError}</FieldError>}</div>
    </Field>
    <div className="flex flex-wrap items-start gap-x-2">
    {handlers.onSuggest && suggestFor && !shownSuggestions && <button type="button" onClick={() => void suggest()} className={cn('flex items-center gap-2 rounded-md px-2 font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', compact ? 'min-h-9 text-[13px]' : 'min-h-11 text-sm')}><Sparkles aria-hidden="true" className="size-4" />{t('suggest.button')}</button>}
    {(handlers.onSaveReply || savedReplies.length > 0) && <Popover open={repliesOpen} onOpenChange={setRepliesOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn('flex items-center gap-2 rounded-md px-2 font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', compact ? 'min-h-9 text-[13px]' : 'min-h-11 text-sm')}><MessageSquareText aria-hidden="true" className="size-4" />{t('savedReplies.button')}</button>
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
    </div>
    {specialError ? <div aria-live="polite" aria-atomic="true"><Alert role="status" className="border-destructive/30"><CircleAlert aria-hidden="true" className="text-destructive" /><AlertDescription className="text-foreground">
      <p>{t(result.code === 'not_allowed' ? 'notAllowed' : 'rateLimited')}</p>
      {result.code === 'rate_limited' && result.retryAt && <p className="tabular-nums">{t('retryAt', { at: formatDateTime(result.retryAt), zone: zoneName })}</p>}
      {result.code === 'not_allowed' && <Button type="button" variant="outline" className="mt-2" onClick={() => (onRefresh ? onRefresh() : router.refresh())}>{t('reload')}</Button>}
    </AlertDescription></Alert></div> : <FormFeedback result={feedback} successMessage={result?.ok && result.code === 'sent' ? t('sent') : undefined} />}
  </form>;
}
