'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { accountProfileInputSchema, type AccountHandlers, type AccountPageData, type AccountProfileInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export function AccountProfileForm({ profile, onSave }: {
  profile: AccountPageData['profile'];
  onSave: AccountHandlers['onSaveProfile'];
}) {
  const t = useTranslations('account');
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const form = useForm<AccountProfileInput>({
    resolver: zodResolver(accountProfileInputSchema),
    defaultValues: { firstName: profile.firstName, lastName: profile.lastName },
  });
  const action = useFormAction(form);
  const pending = action.pending || form.formState.isSubmitting;

  return <form noValidate aria-label={t('profile.title')} aria-busy={pending} className="space-y-5" onSubmit={form.handleSubmit(async (input) => {
    const result = await action.run(onSave, input);
    if (result?.ok) {
      setDisplayName(t('profile.displayNameFormat', { firstName: input.firstName, initial: Array.from(input.lastName)[0] }));
      form.reset(input);
      if (!result.redirectTo) router.refresh();
    }
  })}>
    <p aria-live="polite" className="rounded-2xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">{t('profile.displayName', { name: displayName })}</p>
    <fieldset disabled={pending} className="grid min-w-0 gap-5 sm:grid-cols-2">
      <legend className="sr-only">{t('profile.nameLegend')}</legend>
      <TextFormField control={form.control} name="firstName" label={t('profile.firstName')} hint={t('profile.firstNameHint')} autoComplete="given-name" required maxLength={40} />
      <TextFormField control={form.control} name="lastName" label={t('profile.lastName')} hint={t('profile.lastNameHint')} autoComplete="family-name" required maxLength={40} />
    </fieldset>
    <FormFeedback result={action.result} successMessage={t('profile.saved')} />
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'profile.saving' : 'profile.save')}</Button>
  </form>;
}
