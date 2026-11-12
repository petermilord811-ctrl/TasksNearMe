'use client';

import { useId, type ReactNode } from 'react';
import { Controller, useFormContext, type FieldPath } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { PricingInput } from '@/contracts';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { MoneyInput } from './money-input';

type PricingForm = { pricing: PricingInput };

function PricingField({ name, label, hint, children }: {
  name: FieldPath<PricingForm>;
  label: string;
  hint: string;
  children: (id: string, invalid: boolean) => ReactNode;
}) {
  const id = useId();
  const { getFieldState, formState } = useFormContext<PricingForm>();
  const { error } = getFieldState(name, formState);
  const t = useTranslations('forms.fieldErrors');
  return <Field data-invalid={!!error} className="gap-2">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    {children(id, !!error)}
    <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
    <div id={`${id}-error`} aria-live="polite">{error?.message && <FieldError>{t(t.has(error.message) ? error.message : 'invalid')}</FieldError>}</div>
  </Field>;
}

/** Shared fixed/hourly fields for forms whose schema contains `pricing: PricingInput`. */
export function PricingFields({ disabled = false, namespace = 'invites' }: {
  disabled?: boolean;
  namespace?: 'invites' | 'availability' | 'clients.form';
}) {
  const t = useTranslations(namespace);
  const { control, register, watch, setValue, clearErrors } = useFormContext<PricingForm>();
  const pricing = watch('pricing');
  const priceName = pricing.type === 'fixed' ? 'pricing.priceCents' : 'pricing.rateCents';
  return <>
    <PricingField name="pricing.type" label={t('pricingType')} hint={t('pricingTypeHint')}>{(id, invalid) => <Controller control={control} name="pricing.type" render={({ field }) => <select id={id} name={field.name} ref={field.ref} value={field.value} onBlur={field.onBlur} disabled={disabled} onChange={(event) => {
      setValue('pricing', event.target.value === 'hourly' ? { type: 'hourly', rateCents: 0, estimatedHours: 1, hoursCap: 1 } : { type: 'fixed', priceCents: 0 }); clearErrors('pricing');
    }} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="min-h-11 w-full max-w-sm scroll-mb-40 rounded-[10px] border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <option value="fixed">{t('fixed')}</option><option value="hourly">{t('hourly')}</option>
    </select>} />}</PricingField>
    <PricingField name={priceName} label={t(pricing.type === 'fixed' ? 'price' : 'rate')} hint={t(pricing.type === 'fixed' ? 'priceHint' : 'rateHint')}>{(id, invalid) => <Controller key={priceName} control={control} name={priceName} render={({ field }) => <MoneyInput id={id} name={field.name} ref={field.ref} onBlur={field.onBlur} disabled={disabled} value={field.value} onValueChange={field.onChange} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="max-w-sm scroll-mb-40" />} />}</PricingField>
    {pricing.type === 'hourly' && <div className="grid gap-5 sm:grid-cols-2">{(['estimatedHours', 'hoursCap'] as const).map((key) => <PricingField key={key} name={`pricing.${key}`} label={t(key)} hint={t(`${key}Hint`)}>{(id, invalid) => <Input {...register(`pricing.${key}`, { setValueAs: (value: string) => value === '' ? -1 : Number(value) })} id={id} disabled={disabled} type="number" inputMode="decimal" min={0} max={key === 'hoursCap' ? 24 : undefined} step="any" aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="scroll-mb-40 tabular-nums" />}</PricingField>)}</div>}
  </>;
}
