'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { CornerDownRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { COMMUNITY_REPLY_MAX, COMMUNITY_REPLY_PHOTOS_MAX, type ActionHandler, type ActionResult, type CommunityPostPageData, type CommunityReplyInput, type Photo, type PhotoUploadResult, type QueryHandler } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { nativeSelectClassName } from '@/ui/components/forms/native-select';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { CommunityPhotoPicker } from './community-photo-picker';
import { isKindnessReminder, KindnessReminder } from './kindness-reminder';
import { REPLY_FORM_ID, useReplyTarget } from './reply-target';
import { useSparksToast } from './sparks-toast';

/**
 * Answering a post (completion plan 7.7–7.8, plan 10): the words, a photo, and on a recommendation request one helper
 * to name (ones you booked or saved, or yourself). A reply's Reply button makes it "Replying to Maya R." (she hears
 * about it). Masked on the server like any message; words that might land as unkind get the kindness reminder.
 */
export function CommunityReplyForm({ data, onReply, onUploadPhoto }: { data: Pick<CommunityPostPageData, 'post' | 'recommendOptions' | 'alreadyRecommended'>; onReply: ActionHandler<CommunityReplyInput>; onUploadPhoto?: QueryHandler<FormData, PhotoUploadResult> }) {
  const t = useTranslations('community.replyForm');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const sparksToast = useSparksToast();
  const { target, setTarget, form: formRef } = useReplyTarget();
  const id = useId();
  const [body, setBody] = useState('');
  const [recommend, setRecommend] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [result, setResult] = useState<ActionResult | undefined>();
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);
  const reminder = isKindnessReminder(result);
  const canRecommend = data.post.kind === 'recommendation' && data.recommendOptions.length > 0 && !data.alreadyRecommended;
  const bodyError = result && !result.ok && !reminder ? result.fieldErrors?.body?.[0] : undefined;
  const recommendError = result && !result.ok ? result.fieldErrors?.recommendHandle?.[0] : undefined;

  const submit = (kindnessConfirmed = false) => startTransition(async () => {
    let next: ActionResult;
    try {
      next = await onReply({
        body,
        ...(recommend ? { recommendHandle: recommend } : {}),
        ...(photos[0] ? { photoId: photos[0].id } : {}),
        ...(target ? { replyToId: target.id } : {}),
        ...(kindnessConfirmed ? { kindnessConfirmed: true } : {}),
      });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    setResult(next.ok ? undefined : next);
    if (next.ok) {
      setBody('');
      setRecommend('');
      setPhotos([]);
      setTarget(null);
      sparksToast(t('submit'), next.sparks);
    } else if (next.fieldErrors?.body && !isKindnessReminder(next)) input.current?.focus();
  });

  return <form ref={formRef} id={REPLY_FORM_ID} noValidate aria-label={t('label')} className="scroll-mt-28 space-y-3" onSubmit={(event) => { event.preventDefault(); if (!pending && body.trim().length >= 2) submit(); }}>
    <label htmlFor={`${id}-body`} className="text-sm font-semibold">{t('label')}</label>
    {target && <p className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 font-medium text-primary"><CornerDownRight aria-hidden="true" className="size-3.5" />{t('replyingTo', { name: target.authorName })}</span>
      <button type="button" onClick={() => setTarget(null)} aria-label={t('replyingToClear', { name: target.authorName })} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X aria-hidden="true" className="size-4" /></button>
    </p>}
    <Textarea
      ref={input}
      id={`${id}-body`}
      value={body}
      onChange={(event) => { setBody(event.target.value); if (reminder) setResult(undefined); }}
      onKeyDown={(event) => {
        // Ctrl or ⌘ + Enter sends, as in messages.
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && body.trim().length >= 2 && !pending) { event.preventDefault(); submit(); }
      }}
      placeholder={t('placeholder')}
      maxLength={COMMUNITY_REPLY_MAX}
      rows={3}
      aria-invalid={Boolean(bodyError)}
      aria-describedby={bodyError ? `${id}-body-error` : undefined}
      className="min-h-24"
    />
    {bodyError && <p id={`${id}-body-error`} className="text-sm text-destructive">{fieldCopy(fieldCopy.has(bodyError) ? bodyError : 'invalid')}</p>}
    {onUploadPhoto && <CommunityPhotoPicker id={`${id}-photo`} photos={photos} onChange={setPhotos} onUpload={onUploadPhoto} max={COMMUNITY_REPLY_PHOTOS_MAX} disabled={pending} variant="icon" />}
    {canRecommend && <div className="space-y-1.5">
      <label htmlFor={`${id}-recommend`} className="text-sm font-medium">{t('recommend')}</label>
      <select id={`${id}-recommend`} value={recommend} onChange={(event) => setRecommend(event.target.value)} aria-describedby={`${id}-recommend-hint`} aria-invalid={Boolean(recommendError)} className={nativeSelectClassName}>
        <option value="">{t('recommendNone')}</option>
        {data.recommendOptions.map((option) => <option key={option.handle} value={option.handle}>{option.self ? t('recommendSelf', { name: option.displayName }) : option.displayName}</option>)}
      </select>
      <p id={`${id}-recommend-hint`} className="text-sm text-muted-foreground">{t('recommendHint')}</p>
      {recommendError && <p className="text-sm text-destructive">{fieldCopy(fieldCopy.has(recommendError) ? recommendError : 'invalid')}</p>}
    </div>}
    {data.post.kind === 'recommendation' && data.alreadyRecommended && <p className="text-sm text-muted-foreground">{t('alreadyRecommended')}</p>}
    {reminder && <KindnessReminder kind="reply" busy={pending} onEdit={() => { setResult(undefined); input.current?.focus(); }} onSendAnyway={() => submit(true)} />}
    {result && !result.ok && !result.fieldErrors && <FormFeedback result={result} />}
    <Button type="submit" disabled={pending || body.trim().length < 2} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'submitting' : 'submit')}</Button>
  </form>;
}
