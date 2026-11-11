'use client';

import type { ReactNode } from 'react';
import { useFormContext, type FieldPath } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { TaskDraftInput } from '@/contracts';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';

export const postingFieldId = (name: string) => `post-${name.replaceAll('.', '-')}`;

export function PostingField({ name, label, hint, errorText, children }: {
  name: FieldPath<TaskDraftInput>; label: string; hint?: string; errorText?: string; children: ReactNode;
}) {
  const { getFieldState, formState } = useFormContext<TaskDraftInput>();
  const { error } = getFieldState(name, formState);
  const t = useTranslations('forms');
  const postTask = useTranslations('postTask');
  const id = postingFieldId(name);
  const code = error?.message;
  return <Field data-invalid={!!error} className="gap-2">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    {children}
    <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
    <div id={`${id}-error`}>
      {code && <FieldError>{errorText ?? (code === 'not_supported' ? postTask('unsupportedOption') : t(t.has(`fieldErrors.${code}`) ? `fieldErrors.${code}` : 'fieldErrors.invalid'))}</FieldError>}
    </div>
  </Field>;
}
