'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { emailInputSchema, type EmailInput } from '@/contracts';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { ContinueButton, StepHeading, type SignInStepProps } from './step-parts';

export function EmailStep({ handlers, initialResult, onResult }: SignInStepProps) {
  const t = useTranslations('signIn');
  const fields = useTranslations('forms.fields');
  const form = useForm<EmailInput>({ resolver: zodResolver(emailInputSchema), defaultValues: { email: '' } });
  const action = useFormAction(form, { initialResult, onResult, navigation: 'replace' });
  return <form noValidate onSubmit={form.handleSubmit(async (input) => { await action.run(handlers.onRequestEmailCode, input); })} aria-busy={action.pending} className="space-y-6">
    <StepHeading title={t('email.title')}><p>{t('email.description')}</p></StepHeading>
    <TextFormField control={form.control} name="email" label={fields('email.label')} hint={fields('email.hint')} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} />
    <FormFeedback result={action.result} successMessage={t('codeSent')} />
    <ContinueButton pending={action.pending || form.formState.isSubmitting} />
  </form>;
}
