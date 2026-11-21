'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { emailInputSchema, routes, type EmailInput } from '@/contracts';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { BotCheckField, useBotCheck } from '@/ui/components/forms/bot-check';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useFormAction } from '@/ui/lib/use-form-action';
import { PasskeySignIn } from './passkey-sign-in';
import { OrDivider, ProviderHint, SocialSignIn } from './social-sign-in';
import { ContinueButton, StepHeading, type SignInStepProps } from './step-parts';

export function EmailStep({ data, handlers, initialResult, onResult }: SignInStepProps) {
  const t = useTranslations('signIn');
  const fields = useTranslations('forms.fields');
  const form = useForm<EmailInput>({ resolver: zodResolver(emailInputSchema), defaultValues: { email: '' } });
  const action = useFormAction(form, { initialResult, onResult, navigation: 'replace' });
  const providers = data.socialProviders ?? [];
  const check = useBotCheck(data.botCheck, 'sign_in');
  return <div className="space-y-6">
    <StepHeading title={t('email.title')}><p>{t(providers.length > 0 ? 'email.descriptionWithProviders' : 'email.description')}</p></StepHeading>
    {/* Google, Microsoft and the passkey: one stack, spaced like the provider buttons among themselves. */}
    {(providers.length > 0 || (handlers.onPasskeyOptions && handlers.onPasskeySignIn)) && <div className="space-y-3">
      {providers.length > 0 && <SocialSignIn providers={providers} error={data.socialError} onContinueWith={handlers.onContinueWith} withHint={false} />}
      {handlers.onPasskeyOptions && handlers.onPasskeySignIn && <PasskeySignIn onPasskeyOptions={handlers.onPasskeyOptions} onPasskeySignIn={handlers.onPasskeySignIn} {...(onResult ? { onResult } : {})} />}
    </div>}
    <ProviderHint providers={providers} />
    {(providers.length > 0 || (handlers.onPasskeyOptions && handlers.onPasskeySignIn)) && <OrDivider label={t('social.or')} />}
    <form noValidate onSubmit={form.handleSubmit(async (input) => {
      await action.run(handlers.onRequestEmailCode, { ...input, ...(check.token ? { botCheck: check.token } : {}) });
      check.reset();
    })} aria-busy={action.pending} className="space-y-6">
      <TextFormField control={form.control} name="email" label={fields('email.label')} hint={fields('email.hint')} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} />
      {data.botCheck && <BotCheckField check={check} result={action.result} />}
      {/* The code couldn't go out (an email outage): said here, on the email step (when things break, 2026-11-21). */}
      <FormFeedback result={action.result} successMessage={t('codeSent')} errorMessage={action.result?.ok === false && action.result.code === 'unavailable' ? t('codeUnavailable') : undefined} />
      <ContinueButton pending={action.pending || form.formState.isSubmitting} />
    </form>
    <p className="text-sm text-muted-foreground">{t.rich('email.newHere', {
      link: (chunks) => <Link href={routes.signUp(data.next === routes.app.home() ? undefined : data.next)} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">{chunks}</Link>,
    })}</p>
  </div>;
}
