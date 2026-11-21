'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, LockKeyhole, MessageCircle, Send, Sparkles } from 'lucide-react';
import { routes, startDirectChatInputSchema, type ActionResult, type NewDirectMessageHandlers, type NewDirectMessagePageData, type StartDirectChatInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { newRequestKey } from '@/ui/lib/request-key';
import { cn } from '@/ui/lib/utils';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export interface NewDirectMessageScreenProps {
  data: NewDirectMessagePageData;
  handlers: NewDirectMessageHandlers;
  /** Seeds for the preview gallery. */
  initialResult?: ActionResult;
  initialBody?: string;
}

/**
 * Start a direct conversation (2026-11-21): who it's with, the first message, and the rules said plainly (new
 * conversations left today, a few messages until they answer, contact details hidden until a paid booking). A helper
 * also gets "Send a task request", the funded way to give them a task directly. When the conversation can't be
 * started, the reason replaces the form.
 */
export function NewDirectMessageScreen({ data, handlers, initialResult, initialBody = '' }: NewDirectMessageScreenProps) {
  const t = useTranslations('directMessage');
  const fields = useTranslations('forms.fieldErrors');
  const { formatDateTime, zoneName } = useFormat();
  const router = useRouter();
  const id = useId();
  const { recipient } = data;
  const firstName = recipient.displayName.split(' ')[0] ?? recipient.displayName;
  const form = useForm<StartDirectChatInput>({ resolver: zodResolver(startDirectChatInputSchema), defaultValues: { to: recipient.id, body: initialBody } });
  const body = useWatch({ control: form.control, name: 'body' }) ?? '';
  const [result, setResult] = useState<ActionResult | undefined>(initialResult);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const requestKey = useRef<string | null>(null);

  async function submit(input: StartDirectChatInput) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    // A retry after a lost answer sends the same key, so the conversation starts once (bad connections pass, J-N1).
    requestKey.current ??= newRequestKey();
    let next: ActionResult;
    try {
      next = await handlers.onStart({ ...input, to: recipient.id, requestKey: requestKey.current });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    locked.current = false;
    setPending(false);
    if (next.ok && next.redirectTo) {
      router.push(next.redirectTo);
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

  return <div className="mx-auto w-full max-w-reading space-y-5">
    <header className="flex min-w-0 items-center gap-3">
      <Link href={routes.app.messages()} aria-label={t('back')} title={t('back')} className={buttonVariants({ variant: 'ghost', size: 'icon', className: '-ml-2 size-11 shrink-0 rounded-full' })}><ArrowLeft aria-hidden="true" className="size-5" /></Link>
      <InitialsAvatar initials={recipient.initials} photo={recipient.photo} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-xl leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere] sm:text-2xl">{t('title', { name: recipient.displayName })}</h1>
        {data.helperHandle && <Link href={routes.helperProfile(data.helperHandle)} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">{t('viewProfile')}</Link>}
      </div>
    </header>

    {data.refusal
      ? <div role="status" className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
        <p className="flex items-start gap-2.5 font-medium"><LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />{t(`refusals.${data.refusal}`, { name: firstName })}</p>
        {data.refusal === 'limit_reached' && data.allowance.resetsAt && <p className="text-sm tabular-nums text-muted-foreground">{t('resetsAt', { at: formatDateTime(data.allowance.resetsAt), zone: zoneName })}</p>}
        {data.refusal === 'limit_reached' && <Link href={routes.app.sparks()} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"><Sparkles aria-hidden="true" className="size-4" />{t('moreWithSparks')}</Link>}
      </div>
      : <form noValidate aria-label={t('formLabel', { name: firstName })} aria-busy={pending} onSubmit={(event) => { if (locked.current) { event.preventDefault(); return; } void form.handleSubmit(submit)(event); }} className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
        <Field data-invalid={bodyError ? true : undefined}>
          <FieldLabel htmlFor={`${id}-body`}>{t('label')}</FieldLabel>
          <Textarea id={`${id}-body`} rows={5} placeholder={t('placeholder', { name: firstName })} aria-invalid={bodyError ? true : undefined} aria-describedby={`${id}-hint${bodyError ? ` ${id}-error` : ''}`} disabled={pending} {...form.register('body')} />
          <FieldDescription id={`${id}-hint`} className={cn('flex flex-wrap justify-between gap-x-3 tabular-nums', overLimit && 'text-destructive')}>
            <span>{t('firstMessages', { count: data.firstMessagesMax, name: firstName })}</span>
            <span>{t('count', { used: body.length, maximum: data.maxLength })}</span>
          </FieldDescription>
          {bodyError && <FieldError id={`${id}-error`}>{bodyError}</FieldError>}
        </Field>
        {data.contactMasking && <p className="flex items-start gap-2 rounded-xl bg-secondary/70 px-3 py-2 text-sm leading-6 text-secondary-foreground"><LockKeyhole aria-hidden="true" className="mt-1 size-4 shrink-0" />{t('masking')}</p>}
        <FormFeedback result={result} {...(limitResult ? { errorMessage: t('refusals.limit_reached', { name: firstName }) } : {})} />
        {limitResult && result.retryAt && <p className="text-sm tabular-nums text-muted-foreground">{t('resetsAt', { at: formatDateTime(result.retryAt), zone: zoneName })}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm tabular-nums text-muted-foreground">{t('allowance', { left: data.allowance.left, perDay: data.allowance.perDay })}</p>
          <Button type="submit" disabled={pending || overLimit} className="min-h-11">
            {pending ? <Spinner aria-hidden="true" className="size-4" /> : <Send aria-hidden="true" className="size-4" />}
            {pending ? t('sending') : t('send')}
          </Button>
        </div>
      </form>}

    {data.canRequest && data.helperHandle && <section aria-labelledby={`${id}-request`} className="flex flex-wrap items-center justify-between gap-3 rounded-[1.375rem] border border-dashed border-foreground/15 p-card dark:border-white/15">
      <div className="min-w-0 space-y-1">
        <h2 id={`${id}-request`} className="flex items-center gap-2 font-medium"><MessageCircle aria-hidden="true" className="size-4 text-primary" />{t('request.title', { name: firstName })}</h2>
        <p className="text-sm text-muted-foreground">{t('request.description')}</p>
      </div>
      <Link href={routes.app.requestHelper(data.helperHandle)} className={buttonVariants({ variant: 'outline', className: 'min-h-11' })}>{t('request.action')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
    </section>}
  </div>;
}
