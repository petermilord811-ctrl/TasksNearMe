'use client';

import { useId, type ComponentProps } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';

type TextFormFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
  hint: string;
} & Omit<ComponentProps<typeof Input>, 'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur'>;

export function TextFormField<T extends FieldValues>({ control, name, label, hint, id: suppliedId, ...props }: TextFormFieldProps<T>) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const t = useTranslations('forms');
  return <Controller control={control} name={name} render={({ field, fieldState }) => {
    const code = fieldState.error?.message;
    return <Field data-invalid={fieldState.invalid} className="gap-2">
      <FieldLabel htmlFor={id} className="text-foreground">{label}</FieldLabel>
      <Input {...props} {...field} value={field.value ?? ''} id={id} aria-invalid={fieldState.invalid} aria-describedby={`${id}-hint${code ? ` ${id}-error` : ''}`} />
      <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
      {code && <FieldError id={`${id}-error`}>{t(t.has(`fields.${name}.${code}`) ? `fields.${name}.${code}` : t.has(`fieldErrors.${code}`) ? `fieldErrors.${code}` : 'fieldErrors.invalid')}</FieldError>}
    </Field>;
  }} />;
}
