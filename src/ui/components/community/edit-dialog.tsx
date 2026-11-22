'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { COMMUNITY_BODY_MAX, COMMUNITY_BODY_OPTIONAL_KINDS, COMMUNITY_REPLY_MAX, COMMUNITY_TITLE_MAX, type ActionHandler, type ActionResult, type CommunityEditInput, type CommunityPostKind } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { isKindnessReminder, KindnessReminder } from './kindness-reminder';

export interface EditTarget {
  target: 'post' | 'reply';
  id: string;
  title?: string;
  body: string;
  /** A post's kind: an ask's details are optional. */
  kind?: CommunityPostKind;
}

/**
 * Editing your own post or reply (plan 10.5): the same words, changed in place. It then says "Edited"; the words before
 * stay with our team, so an edit can't hide what someone reported. Masked and checked like a new one.
 */
export function EditDialog({ item, open, onOpenChange, onEdit }: { item: EditTarget; open: boolean; onOpenChange: (open: boolean) => void; onEdit: ActionHandler<CommunityEditInput> }) {
  const t = useTranslations('community.edit');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const id = useId();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(item.title ?? '');
  const [body, setBody] = useState(item.body);
  const [result, setResult] = useState<ActionResult | undefined>();
  const [pending, startTransition] = useTransition();
  const isPost = item.target === 'post';
  const bodyOptional = isPost && item.kind !== undefined && (COMMUNITY_BODY_OPTIONAL_KINDS as readonly string[]).includes(item.kind);
  const reminder = isKindnessReminder(result);
  const errorOf = (field: 'title' | 'body') => {
    const codeOf = result && !result.ok && !reminder ? result.fieldErrors?.[field]?.[0] : undefined;
    return codeOf ? fieldCopy(fieldCopy.has(codeOf) ? codeOf : 'invalid') : undefined;
  };
  const tooShort = isPost ? title.trim().length < 5 || (!bodyOptional && body.trim().length < 10) : body.trim().length < 2;

  const save = (kindnessConfirmed = false) => startTransition(async () => {
    let next: ActionResult;
    try {
      next = await onEdit({ target: item.target, id: item.id, ...(isPost ? { title } : {}), body, ...(kindnessConfirmed ? { kindnessConfirmed: true } : {}) });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    if (next.ok) {
      setResult(undefined);
      toast.success(t('saved'));
      onOpenChange(false);
    } else setResult(next);
  });

  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{t(isPost ? 'titlePost' : 'titleReply')}</DialogTitle>
        <DialogDescription>{t('hint')}</DialogDescription>
      </DialogHeader>
      <form id={`${id}-form`} noValidate className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!pending && !tooShort) save(); }}>
        {isPost && <div className="space-y-1.5">
          <label htmlFor={`${id}-title`} className="text-sm font-semibold">{t('titleLabel')}</label>
          <Input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={COMMUNITY_TITLE_MAX} aria-invalid={Boolean(errorOf('title'))} />
          {errorOf('title') && <p className="text-sm text-destructive">{errorOf('title')}</p>}
        </div>}
        <div className="space-y-1.5">
          <label htmlFor={`${id}-body`} className="text-sm font-semibold">{isPost ? (bodyOptional ? t('bodyOptional') : t('body')) : t('replyLabel')}</label>
          <Textarea ref={bodyRef} id={`${id}-body`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={isPost ? COMMUNITY_BODY_MAX : COMMUNITY_REPLY_MAX} rows={isPost ? 6 : 4} aria-invalid={Boolean(errorOf('body'))} />
          {errorOf('body') && <p className="text-sm text-destructive">{errorOf('body')}</p>}
        </div>
        {reminder && <KindnessReminder busy={pending} onEdit={() => { setResult(undefined); bodyRef.current?.focus(); }} onSendAnyway={() => save(true)} />}
        {result && !result.ok && !result.fieldErrors && <FormFeedback result={result} />}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{t('cancel')}</Button>
        <Button type="submit" form={`${id}-form`} disabled={pending || tooShort} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'saving' : 'save')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
