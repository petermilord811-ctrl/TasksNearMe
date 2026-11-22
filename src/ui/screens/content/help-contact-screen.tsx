'use client';

import { useId, useRef, useState } from 'react';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { CircleAlert, MailCheck, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ActionResult, PublicSupportHandlers, PublicSupportInput, PublicSupportPageData } from '@/contracts';
import { PUBLIC_SUPPORT_TOPICS, publicSupportInputSchema } from '@/contracts/public-support';
import { routes } from '@/contracts/routes';
import { BotCheckField, useBotCheck } from '@/ui/components/forms/bot-check';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { PageHeader } from '@/ui/components/layout/page-header';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export interface HelpContactScreenProps {
  data: PublicSupportPageData;
  handlers: PublicSupportHandlers;
}

const card = 'rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]';

/**
 * `routes.helpContact()` (completion plan 5.22): support for someone who can't sign in or has no account.
 * The answer is the same whether or not an account uses the address, so the confirmation only repeats
 * the address typed.
 */
export function HelpContactScreen({ data, handlers, initialResult, initialEmail }: HelpContactScreenProps & { initialResult?: ActionResult; initialEmail?: string }) {
  const t = useTranslations('helpContact');
  const [sentTo, setSentTo] = useState<string | undefined>(initialResult?.ok ? (initialEmail ?? '') : undefined);
  const confirmation = useRef<HTMLHeadingElement>(null);
  return <div className="mx-auto max-w-reading space-y-section">
    <PageHeader title={t('title')} description={t('description')} />
    <aside className="flex flex-wrap items-center gap-x-2 rounded-xl border border-warning/40 bg-badge-warning px-4 py-2 text-badge-warning-foreground">
      <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
      <p>{t('danger')}</p>
      <a href="tel:911" className="inline-flex min-h-11 items-center rounded-md font-semibold underline underline-offset-4">{t('call')}</a>
    </aside>
    {sentTo === undefined
      ? <>
          <section className={`${card} flex flex-col gap-4 sm:flex-row sm:items-start`}>
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary"><UserRound aria-hidden="true" className="size-5" /></span>
            <div className="min-w-0 space-y-3">
              <h2 className="font-display text-xl leading-7 font-semibold tracking-[-0.015em]">{t('signedIn.title')}</h2>
              <p className="text-muted-foreground">{t('signedIn.body')}</p>
              <Link href={routes.app.support()} className={buttonVariants({ variant: 'outline' })}>{t('signedIn.link')}</Link>
            </div>
          </section>
          <ContactForm data={data} handlers={handlers} initialResult={initialResult} onSent={(email) => { setSentTo(email); setTimeout(() => confirmation.current?.focus(), 0); }} />
        </>
      : <section aria-labelledby="help-contact-sent" className={`${card} space-y-3`}>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary"><MailCheck aria-hidden="true" className="size-5" /></span>
          <h2 id="help-contact-sent" ref={confirmation} tabIndex={-1} className="font-display text-xl leading-7 font-semibold tracking-[-0.015em] outline-none">{t('sent.title')}</h2>
          <p role="status" className="[overflow-wrap:anywhere]">{t('sent.body', { email: sentTo })}</p>
          <p className="text-muted-foreground">{t('sent.more')}</p>
          <Link href={routes.help()} className={buttonVariants({ variant: 'outline' })}>{t('sent.back')}</Link>
        </section>}
  </div>;
}

function ContactForm({ data, handlers, initialResult, onSent }: HelpContactScreenProps & { initialResult?: ActionResult; onSent: (email: string) => void }) {
  const t = useTranslations('helpContact');
  const fieldCopy = useTranslations('forms.fieldErrors');
  const id = useId();
  const form = useForm<PublicSupportInput>({ resolver: zodResolver(publicSupportInputSchema), defaultValues: { email: '', message: '' } });
  const message = useWatch({ control: form.control, name: 'message' });
  const check = useBotCheck(data.botCheck, 'support');
  const action = useFormAction(form, { initialResult, onResult: (result) => { if (result.ok) onSent(form.getValues('email').trim().toLowerCase()); } });
  const pending = action.pending || form.formState.isSubmitting;
  const errorText = (code: string) => fieldCopy(fieldCopy.has(code) ? code : 'invalid');
  const messageError = form.formState.errors.message?.message;
  return <form noValidate aria-label={t('form')} aria-busy={pending} className={`${card} space-y-6`} onSubmit={form.handleSubmit(async (input) => {
    // A check still running is waited for (its line says so); null: it can't pass right now, and the form stays put.
    const answer = await check.ready();
    if (!answer) return;
    await action.run(handlers.onSubmit, { ...input, ...answer });
    check.reset();
  })}>
    <h2 className="font-display text-xl leading-7 font-semibold tracking-[-0.015em]">{t('form')}</h2>
    <fieldset disabled={pending} className="min-w-0 space-y-6">
      <legend className="sr-only">{t('form')}</legend>
      <TextFormField control={form.control} name="email" type="email" inputMode="email" autoComplete="email" spellCheck={false} label={t('email')} hint={t('emailHint')} />
      <Controller control={form.control} name="topic" render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid} className="gap-2">
        <p id={`${id}-topic-label`} className="font-medium">{t('topic')}</p>
        <RadioGroup name={field.name} value={field.value ?? ''} onValueChange={field.onChange} onBlur={field.onBlur} aria-labelledby={`${id}-topic-label`} aria-describedby={fieldState.error ? `${id}-topic-error` : undefined} aria-invalid={fieldState.invalid} aria-required="true" className="gap-2 sm:grid-cols-2">
          {/* The row is the target, as on the in-app support form. */}
          {PUBLIC_SUPPORT_TOPICS.map((topic, index) => <label key={topic} htmlFor={`${id}-topic-${topic}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-foreground/[0.09] px-3.5 py-2 transition-[border-color,background-color] duration-200 ease-[var(--ease-out)] hover:not-has-[[data-state=checked]]:not-has-disabled:border-foreground/20 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring has-disabled:cursor-not-allowed has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/[0.045]">
            <RadioGroupItem id={`${id}-topic-${topic}`} value={topic} ref={index === 0 ? field.ref : undefined} className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 text-sm">{t(`topics.${topic}`)}</span>
          </label>)}
        </RadioGroup>
        {fieldState.error?.message && <FieldError id={`${id}-topic-error`}>{fieldState.error.message === 'required' ? t('topicRequired') : errorText(fieldState.error.message)}</FieldError>}
      </Field>} />
      <Field data-invalid={Boolean(messageError)} className="gap-2">
        <FieldLabel htmlFor={`${id}-message`}>{t('message')}</FieldLabel>
        <Textarea {...form.register('message')} id={`${id}-message`} rows={6} maxLength={2000} aria-required="true" aria-invalid={Boolean(messageError)} aria-describedby={`${id}-message-hint ${id}-message-count${messageError ? ` ${id}-message-error` : ''}`} className="min-h-36" />
        <FieldDescription id={`${id}-message-hint`}>{t('messageHint')}</FieldDescription>
        <p id={`${id}-message-count`} className="text-sm tabular-nums text-muted-foreground">{t('messageCount', { count: message?.length ?? 0, max: 2000 })}</p>
        {messageError && <FieldError id={`${id}-message-error`}>{errorText(messageError)}</FieldError>}
      </Field>
    </fieldset>
    {data.botCheck && <BotCheckField check={check} result={action.result} />}
    <FormFeedback result={action.result} />
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'sending' : 'send')}</Button>
  </form>;
}
