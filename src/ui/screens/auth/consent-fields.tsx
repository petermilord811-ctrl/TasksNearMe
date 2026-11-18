'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Controller, type Control, type Path } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts';
import { Checkbox } from '@/ui/primitives/checkbox';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';

/** "I'm 18 or older" and "I agree to the Terms of service and the Privacy policy", on the profile and sign-up steps. */
export function ConsentFields<T extends { adultAttested: boolean; termsAccepted: boolean }>({ control }: { control: Control<T> }) {
  const id = useId();
  const t = useTranslations('signIn');
  const forms = useTranslations('forms');
  return <>
    {(['adultAttested', 'termsAccepted'] as const).map((name) => <Controller key={name} control={control} name={name as Path<T>} render={({ field, fieldState }) => <Field orientation="horizontal" data-invalid={fieldState.invalid} className="items-start gap-3">
      <Checkbox id={`${id}-${name}`} name={field.name} ref={field.ref} checked={field.value === true} onCheckedChange={(checked) => field.onChange(checked === true)} onBlur={field.onBlur} aria-invalid={fieldState.invalid} aria-describedby={`${id}-${name}-hint${fieldState.error ? ` ${id}-${name}-error` : ''}`} className="size-11 rounded-md [&_svg]:size-5" />
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
  </>;
}
