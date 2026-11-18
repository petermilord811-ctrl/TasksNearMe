'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Controller, type Control, type Path } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts';
import { Checkbox } from '@/ui/primitives/checkbox';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';

/**
 * "I'm 18 or older" and "I agree to the Terms of service and the Privacy policy", on the profile and sign-up steps. The
 * boxes are the size of the radios above them on sign-up and keep a 44 px target (an invisible ring around them; the
 * label toggles too). The links read as part of their sentence: a box a target tall split "Privacy policy." off onto a
 * line of its own (f7's visual pass, 2026-11-18). Links in a sentence are exempt from target sizes (WCAG 2.5.8).
 */
export function ConsentFields<T extends { adultAttested: boolean; termsAccepted: boolean }>({ control }: { control: Control<T> }) {
  const id = useId();
  const t = useTranslations('signIn');
  const forms = useTranslations('forms');
  const inlineLink = "relative after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']";
  return <>
    {(['adultAttested', 'termsAccepted'] as const).map((name) => <Controller key={name} control={control} name={name as Path<T>} render={({ field, fieldState }) => <Field orientation="horizontal" data-invalid={fieldState.invalid} className="items-start gap-3">
      <Checkbox id={`${id}-${name}`} name={field.name} ref={field.ref} checked={field.value === true} onCheckedChange={(checked) => field.onChange(checked === true)} onBlur={field.onBlur} aria-invalid={fieldState.invalid} aria-describedby={`${id}-${name}-hint${fieldState.error ? ` ${id}-${name}-error` : ''}`} className="relative size-5 rounded-[6px] after:absolute after:-inset-3 after:content-[''] [&_svg]:size-3.5" />
      <FieldContent>
        <FieldLabel htmlFor={`${id}-${name}`} className="min-h-5 cursor-pointer text-foreground">{t(`profile.${name}`)}</FieldLabel>
        <FieldDescription id={`${id}-${name}-hint`}>
          {name === 'termsAccepted' ? t.rich('profile.policies', {
            terms: (chunks) => <Link href={routes.legal('terms')} className={inlineLink}>{chunks}</Link>,
            privacy: (chunks) => <Link href={routes.legal('privacy')} className={inlineLink}>{chunks}</Link>,
          }) : t('profile.ageHint')}
        </FieldDescription>
        {fieldState.error && <FieldError id={`${id}-${name}-error`}>{forms(`fieldErrors.${fieldState.error.message ?? 'must_accept'}`)}</FieldError>}
      </FieldContent>
    </Field>} />)}
  </>;
}
