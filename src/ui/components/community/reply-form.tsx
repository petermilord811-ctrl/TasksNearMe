'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { COMMUNITY_REPLY_MAX, type ActionHandler, type ActionResult, type CommunityPostPageData, type CommunityReplyInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { nativeSelectClassName } from '@/ui/components/forms/native-select';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

/**
 * Answering a post (completion plan 7.7–7.8): the words, and on a recommendation request one helper to name
 * (ones you booked or saved, or yourself). Masked on the server like any message.
 */
export function CommunityReplyForm({ data, onReply }: { data: Pick<CommunityPostPageData, 'post' | 'recommendOptions' | 'alreadyRecommended'>; onReply: ActionHandler<CommunityReplyInput> }) {
  const t = useTranslations('community.replyForm');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const id = useId();
  const [body, setBody] = useState('');
  const [recommend, setRecommend] = useState('');
  const [result, setResult] = useState<ActionResult | undefined>();
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);
  const canRecommend = data.post.kind === 'recommendation' && data.recommendOptions.length > 0 && !data.alreadyRecommended;
  const bodyError = result && !result.ok ? result.fieldErrors?.body?.[0] : undefined;
  const recommendError = result && !result.ok ? result.fieldErrors?.recommendHandle?.[0] : undefined;

  const submit = () => startTransition(async () => {
    let next: ActionResult;
    try {
      next = await onReply({ body, ...(recommend ? { recommendHandle: recommend } : {}) });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    setResult(next.ok ? undefined : next);
    if (next.ok) {
      setBody('');
      setRecommend('');
      toast.success(t('submit'));
    } else if (next.fieldErrors?.body) input.current?.focus();
  });

  return <form noValidate aria-label={t('label')} className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (!pending) submit(); }}>
    <label htmlFor={`${id}-body`} className="text-sm font-semibold">{t('label')}</label>
    <Textarea
      ref={input}
      id={`${id}-body`}
      value={body}
      onChange={(event) => setBody(event.target.value)}
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
    {result && !result.ok && !result.fieldErrors && <FormFeedback result={result} />}
    <Button type="submit" disabled={pending || body.trim().length < 2} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'submitting' : 'submit')}</Button>
  </form>;
}
