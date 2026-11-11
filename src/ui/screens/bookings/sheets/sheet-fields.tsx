'use client';

import { useId, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Textarea } from '@/ui/primitives/textarea';

export function SheetChoice({ label, options, value, onChange, onBlur, inputRef, name, error, disabled }: {
  label: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void; onBlur: () => void; inputRef: Ref<HTMLButtonElement>; name: string; error?: string; disabled: boolean;
}) {
  const id = useId();
  const t = useTranslations('bookingSheets');
  const errors = useTranslations('forms.fieldErrors');
  return <Field data-invalid={Boolean(error)} className="gap-2">
    <p id={`${id}-label`} className="font-medium">{label}</p>
    <FieldDescription id={`${id}-hint`}>{t('choose')}</FieldDescription>
    <RadioGroup name={name} value={value} onValueChange={onChange} onBlur={onBlur} disabled={disabled} aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} aria-invalid={Boolean(error)} aria-required="true" className="gap-1">
      {options.map((option, index) => <label htmlFor={`${id}-${option.value}`} key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-secondary">
        <RadioGroupItem value={option.value} id={`${id}-${option.value}`} ref={index === 0 ? inputRef : undefined} className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 text-sm">{option.label}</span>
      </label>)}
    </RadioGroup>
    {error && <FieldError id={`${id}-error`}>{errors(errors.has(error) ? error : 'invalid')}</FieldError>}
  </Field>;
}

export function SheetText({ label, hint, registration, count, max, error, required = false }: {
  label: string; hint: string; registration: UseFormRegisterReturn; count: number; max: number; error?: string; required?: boolean;
}) {
  const id = useId();
  const t = useTranslations('bookingSheets');
  const errors = useTranslations('forms.fieldErrors');
  return <Field data-invalid={Boolean(error)} className="gap-2">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Textarea {...registration} id={id} rows={required ? 5 : 3} maxLength={max} aria-required={required} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint ${id}-count${error ? ` ${id}-error` : ''}`} />
    <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
    <p id={`${id}-count`} className="text-sm tabular-nums text-muted-foreground">{t('count', { count, max })}</p>
    {error && <FieldError id={`${id}-error`}>{errors(errors.has(error) ? error : 'invalid')}</FieldError>}
  </Field>;
}
