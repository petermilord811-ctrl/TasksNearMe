'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { phoneInputSchema, type PhoneInput } from '@/contracts';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { ContinueButton, StepHeading, type SignInStepProps } from './step-parts';

export function PhoneStep({ data, handlers, initialResult, onResult }: SignInStepProps) {
  const t = useTranslations('signIn');
  const fields = useTranslations('forms.fields');
  const form = useForm<PhoneInput>({ resolver: zodResolver(phoneInputSchema), defaultValues: { phone: '' } });
  const action = useFormAction(form, { initialResult, onResult, navigation: 'replace' });
  return <form noValidate onSubmit={form.handleSubmit(async (input) => { await action.run(handlers.onSendPhoneCode, input); })} aria-busy={action.pending} className="space-y-6">
    <StepHeading title={t('phone.title')}><p>{t(`phone.reasons.${data.phoneReason ?? 'account'}`)}</p><p>{t('phone.privacy')}</p></StepHeading>
    <TextFormField control={form.control} name="phone" label={fields('phone.label')} hint={fields('phone.hint')} type="tel" autoComplete="tel" />
    <FormFeedback result={action.result} successMessage={t('codeSent')} />
    <ContinueButton pending={action.pending || form.formState.isSubmitting} />
  </form>;
}
