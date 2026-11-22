'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { profileInputSchema, type ProfileInput } from '@/contracts';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { BotCheckField, useBotCheck } from '@/ui/components/forms/bot-check';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { ConsentFields } from './consent-fields';
import { ContinueButton, StepHeading, type SignInStepProps } from './step-parts';

export function ProfileStep({ data, handlers, initialResult, onResult }: SignInStepProps) {
  const t = useTranslations('signIn');
  const forms = useTranslations('forms');
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileInputSchema), defaultValues: { firstName: data.profileDefaults?.firstName ?? '', lastName: data.profileDefaults?.lastName ?? '', adultAttested: false, termsAccepted: false } });
  const action = useFormAction(form, { initialResult, onResult, navigation: 'replace' });
  const check = useBotCheck(data.botCheck, 'sign_up');
  return <form noValidate onSubmit={form.handleSubmit(async (input) => {
    // A check still running is waited for (its line says so); null: it can't pass right now, and the form stays put.
    const answer = await check.ready();
    if (!answer) return;
    await action.run(handlers.onSaveProfile, { ...input, ...answer });
    check.reset();
  })} aria-busy={action.pending} className="space-y-6">
    <StepHeading title={t('profile.title')}><p>{t('profile.privacy')}</p></StepHeading>
    {/* Focused as the step opens, as the code step's field is (journeys on a phone, J-H1: the first field a person met was Last name). */}
    <TextFormField control={form.control} name="firstName" label={forms('fields.firstName.label')} hint={t('profile.firstNameHint')} autoComplete="given-name" autoFocus />
    <TextFormField control={form.control} name="lastName" label={forms('fields.lastName.label')} hint={t('profile.lastNameHint')} autoComplete="family-name" />
    <ConsentFields control={form.control} />
    {data.botCheck && <BotCheckField check={check} result={action.result} />}
    <FormFeedback result={action.result} />
    <ContinueButton pending={action.pending || form.formState.isSubmitting} />
  </form>;
}
