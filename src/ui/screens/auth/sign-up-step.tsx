'use client';

import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { routes, SIGN_UP_INTENTS, signUpInputSchema, type SignUpInput } from '@/contracts';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { BotCheckField, useBotCheck } from '@/ui/components/forms/bot-check';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Field, FieldError } from '@/ui/primitives/field';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { ConsentFields } from './consent-fields';
import { OrDivider, SocialSignIn } from './social-sign-in';
import { ContinueButton, StepHeading, type SignInStepProps } from './step-parts';

/**
 * `/sign-up`'s first step (completion plan 9.6): what the person is here for, then Google or Microsoft, or their name,
 * email, 18+ and the terms. "Create account" emails a code; the steps after it are sign-in's.
 */
export function SignUpStep({ data, handlers, initialResult, onResult }: SignInStepProps) {
  const id = useId();
  const t = useTranslations('signIn');
  const forms = useTranslations('forms');
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpInputSchema),
    // Helping out unless the page suggests otherwise (owner, 2026-11-22: "Make I can help as default").
    defaultValues: { firstName: '', lastName: '', email: '', intent: data.suggestedIntent ?? 'help_out', adultAttested: false, termsAccepted: false },
  });
  const action = useFormAction(form, { initialResult, onResult, navigation: 'replace' });
  const check = useBotCheck(data.botCheck, 'sign_up');
  const providers = data.socialProviders ?? [];
  const { onStartSignUp, onSignUpWith } = handlers;
  if (!onStartSignUp) return null;

  return <div className="space-y-6">
    <StepHeading title={t('signUp.title')}><p>{t('signUp.description')}</p></StepHeading>
    <Controller control={form.control} name="intent" render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid} className="gap-2">
      <p id={`${id}-intent-label`} className="font-medium">{t('signUp.intent.label')}</p>
      <RadioGroup name={field.name} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} aria-labelledby={`${id}-intent-label`} aria-describedby={fieldState.error ? `${id}-intent-error` : undefined} aria-invalid={fieldState.invalid} aria-required="true" className="gap-2">
        {SIGN_UP_INTENTS.map((intent, index) => <label key={intent} htmlFor={`${id}-intent-${intent}`} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-foreground/[0.09] px-3.5 py-3 transition-[border-color,background-color] duration-200 ease-[var(--ease-out)] hover:not-has-[[data-state=checked]]:not-has-disabled:border-foreground/20 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring has-disabled:cursor-not-allowed has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/[0.045]">
          <RadioGroupItem id={`${id}-intent-${intent}`} value={intent} ref={index === 0 ? field.ref : undefined} aria-describedby={`${id}-intent-${intent}-hint`} className="mt-0.5 size-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t(`signUp.intent.${intent}.title`)}</span>
            <span id={`${id}-intent-${intent}-hint`} className="block text-sm text-muted-foreground">{t(`signUp.intent.${intent}.hint`)}</span>
          </span>
        </label>)}
      </RadioGroup>
      {fieldState.error && <FieldError id={`${id}-intent-error`}>{forms(`fieldErrors.${fieldState.error.message ?? 'required'}`)}</FieldError>}
    </Field>} />
    {providers.length > 0 && onSignUpWith && <>
      <SocialSignIn providers={providers} error={data.socialError} onContinueWith={(input) => onSignUpWith({ ...input, intent: form.getValues('intent') })} />
      <OrDivider label={t('social.or')} />
    </>}
    <form noValidate onSubmit={form.handleSubmit(async (input) => {
      // A check still running is waited for (its line says so); null: it can't pass right now, and the form stays put.
      const answer = await check.ready();
      if (!answer) return;
      await action.run(onStartSignUp, { ...input, ...answer });
      check.reset();
    })} aria-busy={action.pending} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
        <TextFormField control={form.control} name="firstName" label={forms('fields.firstName.label')} hint={t('profile.firstNameHint')} autoComplete="given-name" />
        <TextFormField control={form.control} name="lastName" label={forms('fields.lastName.label')} hint={t('profile.lastNameHint')} autoComplete="family-name" />
      </div>
      <TextFormField control={form.control} name="email" label={forms('fields.email.label')} hint={forms('fields.email.hint')} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} />
      <ConsentFields control={form.control} />
      {data.botCheck && <BotCheckField check={check} result={action.result} />}
      <FormFeedback result={action.result} successMessage={t('codeSent')} />
      <ContinueButton pending={action.pending || form.formState.isSubmitting} label={t('signUp.submit')} />
    </form>
    <p className="text-sm text-muted-foreground">{t.rich('signUp.haveAccount', {
      link: (chunks) => <Link href={routes.signIn(data.next === routes.app.home() ? undefined : data.next)} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">{chunks}</Link>,
    })}</p>
  </div>;
}
