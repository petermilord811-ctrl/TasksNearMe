'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Crown, LockKeyhole, Send, Sparkles } from 'lucide-react';
import { routes, startDirectChatInputSchema, type ActionHandler, type ActionResult, type NewDirectMessagePageData, type StartDirectChatInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { newRequestKey } from '@/ui/lib/request-key';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export interface DirectMessageFormProps {
  data: NewDirectMessagePageData;
  onStart: ActionHandler<StartDirectChatInput>;
  /** After the first message: the new conversation (`redirectTo`). The page goes there; the chat window shows it. */
  onStarted(redirectTo: string): void;
  /** The chat window's narrow pane: fewer rows, smaller type. */
  compact?: boolean;
  /** The message box takes the focus when the form shows (a person was just chosen). */
  autoFocus?: boolean;
  /** Seeds for the preview gallery. */
  initialResult?: ActionResult;
  initialBody?: string;
}

/**
 * The first message to someone (2026-11-21; shared by the New message page, its dialog and the chat window since
 * 2026-11-23): the message, the rules said plainly (a few messages until they answer, contact details hidden until a
 * paid booking, new conversations left today), and Send. When the conversation can't be started, the reason replaces
 * the form.
 */
export function DirectMessageForm({ data, onStart, onStarted, compact = false, autoFocus = false, initialResult, initialBody = '' }: DirectMessageFormProps) {
  const t = useTranslations('directMessage');
  const fields = useTranslations('forms.fieldErrors');
  const { formatDateTime, zoneName } = useFormat();
  const id = useId();
  const { recipient } = data;
  const firstName = recipient.displayName.split(' ')[0] ?? recipient.displayName;
  const form = useForm<StartDirectChatInput>({ resolver: zodResolver(startDirectChatInputSchema), defaultValues: { to: recipient.id, body: initialBody } });
  const body = useWatch({ control: form.control, name: 'body' }) ?? '';
  const [result, setResult] = useState<ActionResult | undefined>(initialResult);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const requestKey = useRef<string | null>(null);

  useEffect(() => {
    if (autoFocus && !data.refusal) form.setFocus('body');
  }, [autoFocus, data.refusal, form]);

  async function submit(input: StartDirectChatInput) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    // A retry after a lost answer sends the same key, so the conversation starts once (bad connections pass, J-N1).
    requestKey.current ??= newRequestKey();
    let next: ActionResult;
    try {
      next = await onStart({ ...input, to: recipient.id, requestKey: requestKey.current });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    locked.current = false;
    setPending(false);
    if (next.ok && next.redirectTo) {
      onStarted(next.redirectTo);
      return;
    }
    if (!next.ok) {
      const code = next.fieldErrors?.body?.[0];
      if (code) form.setError('body', { type: 'server', message: code });
    }
    setResult(next);
  }

  const bodyCode = form.formState.errors.body?.message;
  const overLimit = body.length > data.maxLength;
  const bodyError = overLimit ? t('tooLong', { maximum: data.maxLength }) : bodyCode === 'required' ? t('empty') : bodyCode && fields.has(bodyCode) ? fields(bodyCode) : undefined;
  const limitResult = result && !result.ok && result.code === 'limit_reached';
  const card = compact ? 'space-y-3' : 'space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]';

  if (data.refusal) {
    return <div role="status" className={cn(card, 'space-y-3')}>
      <p className={cn('flex items-start gap-2.5 font-medium', compact && 'text-sm')}><LockKeyhole aria-hidden="true" className={cn('mt-0.5 shrink-0 text-muted-foreground', compact ? 'size-4' : 'size-5')} />{t(`refusals.${data.refusal}`, { name: firstName })}</p>
      {data.refusal === 'limit_reached' && data.allowance.resetsAt && <p className="text-sm tabular-nums text-muted-foreground">{t('resetsAt', { at: formatDateTime(data.allowance.resetsAt), zone: zoneName })}</p>}
      {data.refusal === 'limit_reached' && <div className="flex flex-wrap gap-x-5">
        <Link href={routes.app.sparks()} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"><Sparkles aria-hidden="true" className="size-4" />{t('moreWithSparks')}</Link>
        {/* Plus and Pro start more a day (the plans' ladder, 2026-11-23). */}
        <Link href={routes.app.plan()} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"><Crown aria-hidden="true" className="size-4" />{t('moreWithPlans')}</Link>
      </div>}
    </div>;
  }

  return <form noValidate aria-label={t('formLabel', { name: firstName })} aria-busy={pending} onSubmit={(event) => { if (locked.current) { event.preventDefault(); return; } void form.handleSubmit(submit)(event); }} className={card}>
    <Field data-invalid={bodyError ? true : undefined}>
      <FieldLabel htmlFor={`${id}-body`} className={cn(compact && 'sr-only')}>{t('label')}</FieldLabel>
      <Textarea
        id={`${id}-body`}
        rows={compact ? 4 : 5}
        placeholder={t('placeholder', { name: firstName })}
        aria-invalid={bodyError ? true : undefined}
        aria-describedby={`${id}-hint${bodyError ? ` ${id}-error` : ''}`}
        disabled={pending}
        {...form.register('body')}
        onKeyDown={(event) => {
          // Ctrl/Cmd+Enter sends, as in a conversation's composer.
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <FieldDescription id={`${id}-hint`} className={cn('flex flex-wrap justify-between gap-x-3 tabular-nums', compact && 'text-xs', overLimit && 'text-destructive')}>
        <span>{t('firstMessages', { count: data.firstMessagesMax, name: firstName })}</span>
        <span>{t('count', { used: body.length, maximum: data.maxLength })}</span>
      </FieldDescription>
      {bodyError && <FieldError id={`${id}-error`}>{bodyError}</FieldError>}
    </Field>
    {data.contactMasking && <p className={cn('flex items-start gap-2 rounded-xl bg-secondary/70 px-3 py-2 text-secondary-foreground', compact ? 'text-xs leading-5' : 'text-sm leading-6')}><LockKeyhole aria-hidden="true" className={cn('shrink-0', compact ? 'mt-0.5 size-3.5' : 'mt-1 size-4')} />{t('masking')}</p>}
    <FormFeedback result={result} {...(limitResult ? { errorMessage: t('refusals.limit_reached', { name: firstName }) } : {})} />
    {limitResult && result.retryAt && <p className="text-sm tabular-nums text-muted-foreground">{t('resetsAt', { at: formatDateTime(result.retryAt), zone: zoneName })}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className={cn('tabular-nums text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{data.allowance.staff ? t('allowanceStaff') : t('allowance', { left: data.allowance.left, perDay: data.allowance.perDay })}</p>
      <Button type="submit" disabled={pending || overLimit} className="min-h-11">
        {pending ? <Spinner aria-hidden="true" className="size-4" /> : <Send aria-hidden="true" className="size-4" />}
        {pending ? t('sending') : t('send')}
      </Button>
    </div>
  </form>;
}
