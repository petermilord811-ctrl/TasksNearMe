'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { profileInputSchema, routes, type ProfileInput } from '@/contracts';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { BotCheckField, useBotCheck } from '@/ui/components/forms/bot-check';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Checkbox } from '@/ui/primitives/checkbox';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { useFormAction } from '@/ui/lib/use-form-action';
import { ContinueButton, StepHeading, type SignInStepProps } from './step-parts';

export function ProfileStep({ data, handlers, initialResult, onResult }: SignInStepProps) {
  const id = useId();
  const t = useTranslations('signIn');
  const forms = useTranslations('forms');
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileInputSchema), defaultValues: { firstName: data.profileDefaults?.firstName ?? '', lastName: data.profileDefaults?.lastName ?? '', adultAttested: false, termsAccepted: false } });
  const action = useFormAction(form, { initialResult, onResult, navigation: 'replace' });
  const check = useBotCheck(data.botCheck, 'sign_up');
  return <form noValidate onSubmit={form.handleSubmit(async (input) => {
    await action.run(handlers.onSaveProfile, { ...input, ...(check.token ? { botCheck: check.token } : {}) });
    check.reset();
  })} aria-busy={action.pending} className="space-y-6">
    <StepHeading title={t('profile.title')}><p>{t('profile.privacy')}</p></StepHeading>
    <TextFormField control={form.control} name="firstName" label={forms('fields.firstName.label')} hint={t('profile.firstNameHint')} autoComplete="given-name" />
    <TextFormField control={form.control} name="lastName" label={forms('fields.lastName.label')} hint={t('profile.lastNameHint')} autoComplete="family-name" />
    {(['adultAttested', 'termsAccepted'] as const).map((name) => <Controller key={name} control={form.control} name={name} render={({ field, fieldState }) => <Field orientation="horizontal" data-invalid={fieldState.invalid} className="items-start gap-3">
      <Checkbox id={`${id}-${name}`} name={field.name} ref={field.ref} checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} onBlur={field.onBlur} aria-invalid={fieldState.invalid} aria-describedby={`${id}-${name}-hint${fieldState.error ? ` ${id}-${name}-error` : ''}`} className="size-11 rounded-md [&_svg]:size-5" />
      <FieldContent>
        <FieldLabel htmlFor={`${id}-${name}`} className="min-h-11 text-foreground">{t(`profile.${name}`)}</FieldLabel>
        <FieldDescription id={`${id}-${name}-hint`}>
          {name === 'termsAccepted' ? t.rich('profile.policies', {
            terms: (chunks) => <Link href={routes.legal('terms')} className="inline-flex min-h-11 items-center">{chunks}</Link>,
            privacy: (chunks) => <Link href={routes.legal('privacy')} className="inline-flex min-h-11 items-center">{chunks}</Link>,
          }) : t('profile.ageHint')}
        </FieldDescription>
        {fieldState.error && <FieldError id={`${id}-${name}-error`}>{forms(`fieldErrors.${fieldState.error.message ?? 'must_accept'}`)}</FieldError>}
      </FieldContent>
    </Field>} />)}
    {data.botCheck && <BotCheckField check={check} result={action.result} />}
    <FormFeedback result={action.result} />
    <ContinueButton pending={action.pending || form.formState.isSubmitting} />
  </form>;
}
