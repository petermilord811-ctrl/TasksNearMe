'use client';

import { useId, useState, type ReactNode } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { ProposeChangeInput, ProposeChangePageData } from '@/contracts';
import { formatDateTime, formatMoneyInput, marketClockTime, marketDayKey, marketLocalToUtc, parseMoneyInput } from '@/shared/format';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Textarea } from '@/ui/primitives/textarea';

function ChangeField({ name, label, hint, children }: { name: keyof ProposeChangeInput; label: string; hint: string; children: (id: string, invalid: boolean) => ReactNode }) {
  const id = useId();
  const t = useTranslations('forms');
  const { getFieldState, formState } = useFormContext<ProposeChangeInput>();
  const { error } = getFieldState(name, formState);
  return <Field data-invalid={!!error} className="gap-2">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    {children(id, !!error)}
    <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
    <div id={`${id}-error`} aria-live="polite">{error?.message && <FieldError>{t(t.has(`fieldErrors.${error.message}`) ? `fieldErrors.${error.message}` : 'fieldErrors.invalid')}</FieldError>}</div>
  </Field>;
}

function ChangeMoneyField({ name, label, hint }: { name: 'priceCents' | 'hourlyRateCents' | 'expenseAllowanceCents'; label: string; hint: string }) {
  const { control } = useFormContext<ProposeChangeInput>();
  const [editing, setEditing] = useState<{ cents: number; raw: string }>();
  return <ChangeField name={name} label={label} hint={hint}>{(id, invalid) => <Controller control={control} name={name} render={({ field }) => <Input
    id={id} name={field.name} ref={field.ref} onBlur={field.onBlur} inputMode="decimal" aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="max-w-sm scroll-mb-40 tabular-nums"
    value={editing && Object.is(editing.cents, field.value) ? editing.raw : field.value !== undefined && Number.isInteger(field.value) && field.value >= 0 ? formatMoneyInput(field.value) : ''}
    onChange={(event) => { const raw = event.target.value; const cents = parseMoneyInput(raw) ?? -1; setEditing({ raw, cents }); field.onChange(cents); }}
  />} />}</ChangeField>;
}

function localStart(iso?: string) {
  return iso && Number.isFinite(new Date(iso).getTime()) ? `${marketDayKey(iso)}T${marketClockTime(iso)}` : '';
}

export function ProposeChangeFields({ data }: { data: ProposeChangePageData }) {
  const t = useTranslations('changes.propose');
  const { register, control } = useFormContext<ProposeChangeInput>();
  return <div className="space-y-5">
    {data.allowedTypes.includes('price') && <ChangeMoneyField name={data.current.pricing.type === 'fixed' ? 'priceCents' : 'hourlyRateCents'} label={t(data.current.pricing.type === 'fixed' ? 'price' : 'rate')} hint={t('moneyHint')} />}
    {data.allowedTypes.includes('hours_cap') && data.current.pricing.type === 'hourly' && <ChangeField name="hoursCap" label={t('hoursCap')} hint={t('hoursHint')}>{(id, invalid) => <Input {...register('hoursCap', { setValueAs: (value: string) => value === '' ? -1 : Number(value) })} id={id} type="number" inputMode="decimal" min={0} max={24} step="any" aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="max-w-sm scroll-mb-40 tabular-nums" />}</ChangeField>}
    {data.allowedTypes.includes('schedule') && <ChangeField name="start" label={t('start')} hint={data.scheduleWindow ? t('windowHint', { earliest: formatDateTime(data.scheduleWindow.earliest), latest: formatDateTime(data.scheduleWindow.latest) }) : t('startHint')}>{(id, invalid) => <Controller name="start" control={control} render={({ field }) => <Input
      id={id} name={field.name} ref={field.ref} onBlur={field.onBlur} type="datetime-local" value={localStart(field.value)} min={localStart(data.scheduleWindow?.earliest) || undefined} max={localStart(data.scheduleWindow?.latest) || undefined}
      onChange={(event) => { const [date, time] = event.target.value.split('T'); field.onChange(date && time ? marketLocalToUtc(date, time) : ''); }}
      aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="min-w-0 max-w-sm scroll-mb-40 tabular-nums"
    />} />}</ChangeField>}
    {data.allowedTypes.includes('scope') && <ChangeField name="scopeText" label={t('scope')} hint={t('scopeHint')}>{(id, invalid) => <Textarea {...register('scopeText')} id={id} rows={4} maxLength={2000} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="scroll-mb-40" />}</ChangeField>}
    {data.allowedTypes.includes('expense_allowance') && <ChangeMoneyField name="expenseAllowanceCents" label={t('expenses')} hint={t('expensesHint')} />}
    <ChangeField name="message" label={t('message')} hint={t('messageHint')}>{(id, invalid) => <Textarea {...register('message')} id={id} rows={3} maxLength={1000} aria-invalid={invalid} aria-describedby={`${id}-hint ${id}-error`} className="scroll-mb-40" />}</ChangeField>
  </div>;
}
