'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { SendHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { COMMUNITY_REPLY_MAX, type ActionResult, type CommunityReplyInput, type Photo } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { isKindnessReminder, KindnessReminder } from './kindness-reminder';
import { useSparksToast } from './sparks-toast';

/**
 * Replying right on a card (plan 10.3, Nextdoor's comment box): "Write a reply…" opens a short box; sending posts the
 * reply without leaving the feed (the card's latest replies refresh). Masked on the server like any reply; the kindness
 * reminder applies. A recommendation or a photo is for the post's own page.
 */
export function InlineReply({ postId, onReply, me, autoFocus = false, onDone }: {
  postId: string;
  onReply: (postId: string, input: CommunityReplyInput) => Promise<ActionResult>;
  me?: { initials: string; photo?: Photo };
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations('community.inlineReply');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const sparksToast = useSparksToast();
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState('');
  const [result, setResult] = useState<ActionResult | undefined>();
  const [pending, startTransition] = useTransition();
  const reminder = isKindnessReminder(result);
  const bodyError = result && !result.ok && !reminder ? result.fieldErrors?.body?.[0] : undefined;

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const send = (kindnessConfirmed = false) => startTransition(async () => {
    let next: ActionResult;
    try {
      next = await onReply(postId, { body, ...(kindnessConfirmed ? { kindnessConfirmed: true } : {}) });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    if (next.ok) {
      setBody('');
      setResult(undefined);
      sparksToast(t('sent'), next.sparks);
      onDone?.();
    } else setResult(next);
  });

  return <form noValidate aria-label={t('label')} className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (!pending && body.trim().length >= 2) send(); }}>
    <div className="flex items-start gap-2">
      {me && <span className="mt-1 shrink-0"><InitialsAvatar initials={me.initials} photo={me.photo} size="sm" /></span>}
      <label htmlFor={`${id}-body`} className="sr-only">{t('label')}</label>
      <Textarea
        ref={input}
        id={`${id}-body`}
        value={body}
        onChange={(event) => { setBody(event.target.value); if (result) setResult(undefined); }}
        onKeyDown={(event) => {
          // Ctrl or ⌘ + Enter sends, as in messages.
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && body.trim().length >= 2 && !pending) { event.preventDefault(); send(); }
        }}
        placeholder={t('placeholder')}
        maxLength={COMMUNITY_REPLY_MAX}
        rows={1}
        aria-invalid={Boolean(bodyError)}
        aria-describedby={bodyError ? `${id}-error` : undefined}
        className="min-h-10 flex-1 resize-none rounded-[1.25rem] py-2 [field-sizing:content] max-h-40"
      />
      <button type="submit" disabled={pending || body.trim().length < 2} aria-label={t('send')} className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40">
        {pending ? <Spinner aria-hidden="true" /> : <SendHorizontal aria-hidden="true" className="size-4" />}
      </button>
    </div>
    {bodyError && <p id={`${id}-error`} className="pl-10 text-sm text-destructive">{fieldCopy(fieldCopy.has(bodyError) ? bodyError : 'invalid')}</p>}
    {reminder && <KindnessReminder kind="reply" busy={pending} onEdit={() => { setResult(undefined); input.current?.focus(); }} onSendAnyway={() => send(true)} />}
    {result && !result.ok && !result.fieldErrors && <FormFeedback result={result} />}
  </form>;
}
